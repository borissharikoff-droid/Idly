import { spawn, type ChildProcess, type SpawnOptions } from 'child_process'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import log from './logger'

/** Full path to PowerShell on Windows (works when PATH is not set for child processes). */
function getPowerShellPath(): string {
  const root = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows'
  return path.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}

// ── Persistent PowerShell window detector ──

let detectorProcess: ChildProcess | null = null
let latestWinInfo: { appName: string; title: string; keys: number; idleMs: number; bgCategories: string[] } | null = null
/** Cached background categories from last scan (bg scan runs every 2nd C# iteration). */
let lastKnownBgCategories: string[] = []
let stdoutBuffer = ''
let detectorRestartTimeout: NodeJS.Timeout | null = null
let detectorRestartCount = 0

/**
 * A single persistent PowerShell process that:
 * 1) Loads Win32 APIs (GetForegroundWindow, GetWindowText, GetAsyncKeyState, GetLastInputInfo)
 * 2) Loops every ~1.5s, outputs "WIN:ProcessName|WindowTitle|KeystrokeCount|IdleMs"
 * 3) IdleMs = time since last input (mouse or keyboard) for real AFK detection
 */
const DETECTOR_SCRIPT = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try {
  Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Runtime.InteropServices;
using System.Diagnostics;
public class WinApi {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("user32.dll", EntryPoint = "GetWindowTextW")]
    private static extern int GetWindowText(IntPtr hWnd, IntPtr lpString, int nMaxCount);
    [DllImport("user32.dll", EntryPoint = "GetWindowTextLengthW")]
    private static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern short GetAsyncKeyState(int vKey);
    [DllImport("user32.dll")]
    public static extern uint GetTickCount();
    [DllImport("user32.dll")]
    public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
    [StructLayout(LayoutKind.Sequential)]
    public struct LASTINPUTINFO {
        public uint cbSize;
        public uint dwTime;
    }
    private static Stream _stdout = Console.OpenStandardOutput();
    private static void WriteUtf8Line(string text) {
        byte[] bytes = Encoding.UTF8.GetBytes(text + "\\n");
        _stdout.Write(bytes, 0, bytes.Length);
        _stdout.Flush();
    }
    private static string GetTitle(IntPtr hWnd) {
        int len = GetWindowTextLength(hWnd);
        if (len <= 0) return "";
        int bufBytes = (len + 2) * 2;
        IntPtr buf = Marshal.AllocHGlobal(bufBytes);
        try {
            int copied = GetWindowText(hWnd, buf, len + 1);
            if (copied <= 0) return "";
            byte[] raw = new byte[copied * 2];
            Marshal.Copy(buf, raw, 0, copied * 2);
            return Encoding.Unicode.GetString(raw);
        } finally {
            Marshal.FreeHGlobal(buf);
        }
    }
    private static int CountKeyPresses() {
        int count = 0;
        for (int vk = 0x08; vk <= 0xFE; vk++) {
            short state = GetAsyncKeyState(vk);
            if ((state & 0x0001) != 0) count++;
        }
        return count;
    }
    private static int GetIdleMs() {
        LASTINPUTINFO lii = new LASTINPUTINFO();
        lii.cbSize = (uint)Marshal.SizeOf(typeof(LASTINPUTINFO));
        if (!GetLastInputInfo(ref lii)) return 0;
        uint now = GetTickCount();
        return (int)(now - lii.dwTime);
    }
    private static string GetProcessName(uint pid) {
        try {
            return Process.GetProcessById((int)pid).ProcessName;
        } catch {
            return null;
        }
    }
    // --- Background music detection via Win32 window enumeration ---
    [DllImport("user32.dll")]
    private static extern IntPtr GetDesktopWindow();
    [DllImport("user32.dll")]
    private static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);
    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool IsWindowVisible(IntPtr hWnd);
    private const uint GW_CHILD = 5;
    private const uint GW_HWNDNEXT = 2;
    private static readonly string[] MusicProcessNames = new string[] {
        "spotify", "wmplayer", "vkmusic", "yandexmusic", "deezer",
        "itunes", "tidal", "foobar2000", "aimp", "musicbee", "groove"
    };
    private static readonly string[] MusicTitleKeywords = new string[] {
        "youtube music", "music.youtube", "spotify", "soundcloud",
        "deezer", "apple music", "vk music", "vkmusic", "yandex music",
        "\\u044f\\u043d\\u0434\\u0435\\u043a\\u0441 \\u043c\\u0443\\u0437\\u044b\\u043a",
        "youtube \\u043c\\u0443\\u0437\\u044b\\u043a",
        "music.yandex", "zvuk.com", "boom.ru"
    };
    private static bool IsMusicTitle(string title) {
        string lower = title.ToLower();
        for (int i = 0; i < MusicTitleKeywords.Length; i++) {
            if (lower.Contains(MusicTitleKeywords[i])) return true;
        }
        return false;
    }
    private static bool IsMusicProcess(string processName) {
        string pn = processName.ToLower();
        for (int i = 0; i < MusicProcessNames.Length; i++) {
            if (pn == MusicProcessNames[i]) return true;
        }
        return false;
    }
    private static string DetectBackgroundMusic(IntPtr fgHwnd) {
        try {
            // Enumerate ALL visible top-level windows via Win32
            IntPtr desktop = GetDesktopWindow();
            IntPtr hwnd = GetWindow(desktop, GW_CHILD);
            while (hwnd != IntPtr.Zero) {
                if (hwnd != fgHwnd && IsWindowVisible(hwnd)) {
                    // Check window title for music keywords
                    string title = GetTitle(hwnd);
                    if (title.Length > 0 && IsMusicTitle(title)) return "music";
                    // Check process name for known music players
                    uint wpid = 0;
                    GetWindowThreadProcessId(hwnd, out wpid);
                    if (wpid > 0) {
                        string pn = GetProcessName(wpid);
                        if (pn != null && IsMusicProcess(pn)) return "music";
                    }
                }
                hwnd = GetWindow(hwnd, GW_HWNDNEXT);
            }
            return "";
        } catch { return ""; }
    }
    private static int _iter = 0;
    public static void RunLoop() {
        WriteUtf8Line("READY");
        while (true) {
            try {
                _iter++;
                int keys = 0;
                try { keys = CountKeyPresses(); } catch {}
                int idleMs = 0;
                try { idleMs = GetIdleMs(); } catch {}
                IntPtr hwnd = GetForegroundWindow();
                uint pid = 0;
                GetWindowThreadProcessId(hwnd, out pid);
                string rawTitle = GetTitle(hwnd);
                if (_iter <= 3) {
                    int tlen = GetWindowTextLength(hwnd);
                    WriteUtf8Line("DBG:iter=" + _iter + " hwnd=" + hwnd.ToInt64() + " pid=" + pid + " tlen=" + tlen + " title=" + rawTitle);
                }
                string title = rawTitle.Replace("\\r", " ").Replace("\\n", " ").Replace("|", "&#124;").Trim();
                string pname = null;
                if (pid > 0) {
                    try { pname = GetProcessName(pid); } catch {}
                }
                // Detect background music (every 2nd iteration to reduce overhead)
                string bgCats = _iter % 2 == 0 ? "_" : "";
                if (_iter % 2 == 0) {
                    string detected = DetectBackgroundMusic(hwnd);
                    bgCats = "_" + detected;
                }
                string line;
                if (pname == "explorer" && string.IsNullOrWhiteSpace(title)) {
                    line = "WIN:Idle||" + keys + "|" + idleMs + "|" + bgCats;
                } else if (pname != null) {
                    line = "WIN:" + pname + "|" + title + "|" + keys + "|" + idleMs + "|" + bgCats;
                } else if (title.Length > 0) {
                    line = "WIN:Unknown|" + title + "|" + keys + "|" + idleMs + "|" + bgCats;
                } else {
                    line = "WIN:Idle||" + keys + "|" + idleMs + "|" + bgCats;
                }
                WriteUtf8Line(line);
            } catch (Exception ex) {
                string msg = (ex.Message ?? "").Replace("|", " ").Replace("\\r", " ").Replace("\\n", " ");
                WriteUtf8Line("ERR:loop-" + msg);
            }
            Thread.Sleep(1500);
        }
    }
}
"@
  [WinApi]::RunLoop()
} catch {
  [Console]::Out.WriteLine("ERR:AddType-" + ($_.Exception.Message -replace '[|\\r\\n]', ' '))
  [Console]::Out.Flush()
  exit 1
}
`.replace(/\r?\n/g, '\n').trim()

let hasReceivedWinLine = false
let hasReceivedReady = false
let detectorLineCount = 0

function parseLine(line: string): void {
  const trimmed = line.trim()
  if (!trimmed) return
  detectorLineCount++
  // Log first 10 lines from detector for debugging
  if (detectorLineCount <= 10) {
    log.info('[tracker] detector raw line #' + detectorLineCount + ':', trimmed.slice(0, 200))
  }
  if (trimmed === 'READY') {
    hasReceivedReady = true
    log.info('[tracker] Detector script ready (Add-Type succeeded)')
    return
  }
  if (trimmed.startsWith('DBG:')) {
    log.info('[tracker] ' + trimmed)
    return
  }
  if (trimmed.startsWith('ERR:')) {
    const msg = trimmed.slice(4).trim()
    log.error('[tracker] Detector script error:', msg)
    latestWinInfo = { appName: 'Idly.TrackerError', title: msg, keys: 0, idleMs: 0, bgCategories: [] }
    return
  }
  if (!trimmed.startsWith('WIN:')) {
    log.warn('[tracker] Unexpected detector output:', trimmed.slice(0, 200))
    return
  }
  const payload = trimmed.slice(4)
  const parts = payload.split('|')
  if (parts.length < 5) {
    log.warn('[tracker] Malformed WIN line (parts=' + parts.length + '):', trimmed.slice(0, 200))
    return
  }
  const appName = (parts[0] ?? '').trim() || 'Idle'
  // Last 3 fields: keystrokeCount | idleMs | bgCategories
  const bgRaw = (parts[parts.length - 1] ?? '').trim()
  const idleMs = parseInt(parts[parts.length - 2], 10) || 0
  const keys = parseInt(parts[parts.length - 3], 10) || 0
  const title = parts.slice(1, -3).join('|').replace(/&#124;/g, '|').trim()
  // bgRaw starts with "_" when bg scan actually ran; empty = scan skipped (use cache)
  const didScan = bgRaw.startsWith('_')
  const bgCategories = didScan ? bgRaw.slice(1).split(',').filter(Boolean) : lastKnownBgCategories
  if (didScan) lastKnownBgCategories = bgCategories
  latestWinInfo = { appName, title, keys, idleMs, bgCategories }
  if (!hasReceivedWinLine) {
    hasReceivedWinLine = true
    log.info('[tracker] First window data received', { appName, title: title.slice(0, 50) })
  }
}

let detectorScriptPath: string | null = null
let detectorStderrLines: string[] = []

const PROBE_TIMEOUT_MS = 3000
const STDERR_TAIL_LINES = 10

/** Returns true if PowerShell runs and prints the probe string to stdout. */
function probePowerShell(): Promise<boolean> {
  return new Promise((resolve) => {
    const psExe = getPowerShellPath()
    const args = ['-NoProfile', '-NoLogo', '-NonInteractive', '-Command', "Write-Output 'IDLY_PROBE_OK'"]
    let stdout = ''
    let resolved = false
    const done = (ok: boolean) => {
      if (resolved) return
      resolved = true
      try { child.kill() } catch { /* ignore */ }
      resolve(ok)
    }
    let child: ChildProcess
    try {
      child = spawn(psExe, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        env: { ...process.env },
      })
    } catch (e) {
      log.warn('[tracker] PowerShell probe spawn failed', e)
      resolve(false)
      return
    }
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
      if (stdout.includes('IDLY_PROBE_OK')) done(true)
    })
    child.on('error', () => done(false))
    child.on('exit', () => {
      if (!resolved) done(stdout.includes('IDLY_PROBE_OK'))
    })
    setTimeout(() => done(stdout.includes('IDLY_PROBE_OK')), PROBE_TIMEOUT_MS)
  })
}

function startWindowDetector(): void {
  if (process.platform !== 'win32') return
  if (detectorProcess) return
  log.info('[tracker] Starting persistent window detector')
  hasReceivedWinLine = false
  hasReceivedReady = false
  detectorStderrLines = []

  const scriptDir = app.getPath('userData')
  const spawnOpts: SpawnOptions = {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    cwd: scriptDir,
    env: { ...process.env },
  }

  function trySpawn(executable: string, args: string[]): ChildProcess | null {
    try {
      return spawn(executable, args, spawnOpts)
    } catch (e) {
      log.warn('[tracker] spawn failed', { executable, err: e })
      return null
    }
  }

  const psExe = getPowerShellPath()
  const useFileOnly = detectorRestartCount > 0

  // -ExecutionPolicy Bypass only (no -Scope Process: some PowerShell/configs treat -Scope as separate cmdlet and fail)
  if (!useFileOnly) {
    // 1) Try -EncodedCommand first (no file write)
    const encodedScript = Buffer.from(DETECTOR_SCRIPT, 'utf16le').toString('base64')
    const encodedArgs = ['-NoProfile', '-NoLogo', '-Sta', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedScript]
    detectorProcess = trySpawn(psExe, encodedArgs)
    if (!detectorProcess) detectorProcess = trySpawn('powershell', encodedArgs)
  }

  // 2) Fallback or restart: -File only (avoids command-line length / encoding issues)
  if (!detectorProcess || useFileOnly) {
    try {
      detectorScriptPath = path.join(scriptDir, 'idly-window-detector.ps1')
      fs.writeFileSync(detectorScriptPath, '\uFEFF' + DETECTOR_SCRIPT, { encoding: 'utf8' })
    } catch (e) {
      log.error('[tracker] Failed to write detector script', e)
      return
    }
    const fileArgs = ['-NoProfile', '-NoLogo', '-Sta', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', detectorScriptPath]
    detectorProcess = trySpawn(psExe, fileArgs)
    if (!detectorProcess) {
      detectorProcess = trySpawn('powershell', fileArgs)
    }
  }

  if (!detectorProcess) {
    log.error('[tracker] Could not start PowerShell. Check that Windows PowerShell is installed.')
    if (detectorScriptPath) {
      try { fs.unlinkSync(detectorScriptPath) } catch { /* ignore */ }
      detectorScriptPath = null
    }
    return
  }

  detectorProcess.stdout?.on('data', (chunk: Buffer) => {
    stdoutBuffer += chunk.toString('utf8')
    const lines = stdoutBuffer.split(/\r?\n/)
    stdoutBuffer = lines.pop() || ''
    for (const line of lines) {
      parseLine(line)
    }
  })

  detectorProcess.stderr?.on('data', (chunk: Buffer) => {
    const msg = chunk.toString().trim()
    if (msg) {
      detectorStderrLines.push(msg)
      log.warn('[tracker:stderr]', msg)
    }
  })

  detectorProcess.on('exit', (code, signal) => {
    log.info('[tracker] Detector process exited', { code, signal })
    detectorProcess = null
    stdoutBuffer = ''
    if (detectorScriptPath) {
      try { fs.unlinkSync(detectorScriptPath) } catch { /* ignore */ }
      detectorScriptPath = null
    }
  })

  detectorProcess.on('error', (err) => {
    log.error('[tracker] Detector process error:', err)
    detectorProcess = null
    if (detectorScriptPath) {
      try { fs.unlinkSync(detectorScriptPath) } catch { /* ignore */ }
      detectorScriptPath = null
    }
  })

  log.info('[tracker] Detector process started', { pid: detectorProcess.pid, scriptPath: detectorScriptPath ?? 'EncodedCommand' })

  if (detectorRestartTimeout) {
    clearTimeout(detectorRestartTimeout)
    detectorRestartTimeout = null
  }
  const NO_DATA_MS = 25_000
  detectorRestartTimeout = setTimeout(() => {
    detectorRestartTimeout = null
    if (hasReceivedWinLine || detectorRestartCount > 0) {
      if (!hasReceivedWinLine) {
        const stderrTail = detectorStderrLines.slice(-STDERR_TAIL_LINES)
        log.warn('[tracker] No window data; ready=', hasReceivedReady, 'stderr (last ' + STDERR_TAIL_LINES + '):', stderrTail.join('; '))
      }
      return
    }
    const stderrTail = detectorStderrLines.slice(-STDERR_TAIL_LINES)
    log.warn('[tracker] No window data after 25s; ready=', hasReceivedReady, 'restarting detector once with -File only. stderr (last ' + STDERR_TAIL_LINES + '):', stderrTail.join('; '))
    detectorRestartCount++
    stopWindowDetector()
    startWindowDetector()
  }, NO_DATA_MS)
}

function stopWindowDetector(): void {
  if (detectorRestartTimeout) {
    clearTimeout(detectorRestartTimeout)
    detectorRestartTimeout = null
  }
  if (detectorProcess) {
    try {
      detectorProcess.kill()
    } catch { /* ignore */ }
    detectorProcess = null
    stdoutBuffer = ''
  }
  if (detectorScriptPath) {
    try { fs.unlinkSync(detectorScriptPath) } catch { /* ignore */ }
    detectorScriptPath = null
  }
}

// ── Activity types ──
/** 'idle' = desktop/explorer or unknown window — does not give XP. */
export type ActivityCategory = 'coding' | 'design' | 'games' | 'social' | 'browsing' | 'creative' | 'learning' | 'music' | 'other' | 'idle'

export interface ActivitySnapshot {
  appName: string
  windowTitle: string
  category: ActivityCategory
  /** All active categories (foreground + background, e.g. ['games', 'music']) */
  categories: ActivityCategory[]
  timestamp: number
  keystrokes: number
}

export interface ActivitySegment {
  appName: string
  windowTitle: string
  category: string
  startTime: number
  endTime: number
  keystrokes: number
}

// ── State ──
let pollInterval: NodeJS.Timeout | null = null
let isPaused = false
let lastActivity: ActivitySnapshot | null = null
const listeners: ((a: ActivitySnapshot) => void)[] = []
let segments: ActivitySegment[] = []
let currentSegmentStart = 0
let currentSegmentActivity: ActivitySnapshot | null = null
/** When multiple categories (e.g. music + learning), we push one segment per category. */
let currentSegmentCategories: ActivityCategory[] = []
let currentSegmentKeystrokes = 0
let totalSessionKeystrokes = 0

// ── AFK / Idle detection (uses GetLastInputInfo: mouse + keyboard) ──
let isIdle = false
let afkThresholdMs = 3 * 60 * 1000 // default 3 minutes
const POLL_INTERVAL_MS = 2000
const idleListeners: ((idle: boolean) => void)[] = []

function emitIdle(idle: boolean) {
  if (isIdle === idle) return
  isIdle = idle
  idleListeners.forEach(cb => cb(idle))
}

const MUSIC_TITLE = /youtube\s*music|music\.youtube|яндекс\s*музык|music\.yandex|music\.yandex\.ru|yandex\s*music|spotify|soundcloud|deezer|apple\s*music|amazon\s*music|vk\s*music|vkmusic| — spotify| - spotify/i
const LEARNING_TITLE = /подкаст|podcast|лекци|lecture|курс|course|udemy|stepik|edx|coursera|обучение|learning|теория/i

/** Returns one or more categories (e.g. music + learning for podcast on music site). */
export function categorizeMultiple(appName: string, windowTitle: string): ActivityCategory[] {
  const lowerApp = appName.toLowerCase().replace(/\.(exe|app)$/i, '')
  const lowerTitle = windowTitle.toLowerCase()
  // When process name is unknown (e.g. protected), infer from window title
  if (lowerApp === 'unknown' && lowerTitle) {
    if (/cursor|visual studio|\.tsx?|\.jsx?|\.py\b|\.rs\b|\.go\b|code\s*\-/i.test(lowerTitle)) return ['coding']
    if (/chrome|firefox|edge|brave|opera|browser/i.test(lowerTitle)) return ['browsing']
    if (MUSIC_TITLE.test(lowerTitle)) return ['music']
    if (LEARNING_TITLE.test(lowerTitle)) return ['learning']
    if (/figma|design|mockup/i.test(lowerTitle)) return ['design']
    if (/telegram|discord|slack|whatsapp|teams/i.test(lowerTitle)) return ['social']
    if (/steam|game|play/i.test(lowerTitle)) return ['games']
  }
  if (/^(code|cursor|intellij|webstorm|pycharm|idea|devenv|rider)$/i.test(lowerApp) || /visual studio/i.test(lowerApp)) return ['coding']
  if (/\.(tsx?|jsx?|py|rs|go|cpp|cs|java)\b/i.test(lowerTitle)) return ['coding']
  if (/^(figma|photoshop|sketch|canva|illustrator|xd|invision|zeplin|affinity|gimp|krita)$/i.test(lowerApp) || /figma|design|mockup/i.test(lowerTitle)) return ['design']
  if (/^(ableton|fl studio|reaper|logic|audacity|premiere|davinci|resolve|obs|blender|afterfx|vegas|cinema4d)$/i.test(lowerApp) || /premiere|davinci|blender|after effects/i.test(lowerTitle)) return ['creative']
  if (/^(notion|obsidian|anki|sumatrapdf|acrobat|acrord32|foxit|foxitreader|kindle|evernote|onenote)$/i.test(lowerApp) || /\.pdf\b|notion|obsidian|anki/i.test(lowerTitle)) return ['learning']
  if (/^(spotify|music|soundcloud|itunes|tidal|yandexmusic|deezer|wmplayer|vkmusic)$/i.test(lowerApp) || MUSIC_TITLE.test(lowerTitle)) return ['music']
  if (/^(steam|epicgameslauncher|valorant|leagueclient|dota2|dota\s*2|minecraft|fortniteclient|gta|csgo|cs2|overwatch|battle\.net|javaw)$/i.test(lowerApp.replace(/\s+/g, '')) || /dota\s*2|game|play|steam/i.test(lowerTitle)) return ['games']
  if (/^(telegram|discord|slack|whatsapp|teams)$/i.test(lowerApp)) return ['social']
  if (/^(chrome|firefox|msedge|brave|opera|vivaldi|arc|yandex)$/i.test(lowerApp)) {
    const isMusic = MUSIC_TITLE.test(lowerTitle)
    const isLearning = LEARNING_TITLE.test(lowerTitle)
    if (isMusic && isLearning) return ['music', 'learning']
    if (isMusic) return ['music']
    if (isLearning) return ['learning']
    return ['browsing']
  }
  // Windows: Edge/Chrome sometimes as "Application Frame Host" or "Microsoft Edge"
  if (/applicationframehost|microsoft edge|msedge|browser/i.test(lowerApp.replace(/\s+/g, ''))) return ['browsing']
  if (/^(chrome|firefox|edge)$/i.test(lowerApp.replace(/\s+/g, ''))) return ['browsing']
  return ['other']
}

function getAppDisplayName(appName: string): string {
  if (appName === 'Idly.TrackerError') return 'Window detector error'
  if (appName === 'Unknown') return 'Window'
  const base = appName.replace(/\.(exe|app)$/i, '').replace(/\s+/g, '')
  const baseLower = base.toLowerCase()
  if (baseLower === 'electron' || baseLower === 'idly') return 'Idly'
  const map: Record<string, string> = {
    code: 'VS Code',
    cursor: 'Cursor',
    chrome: 'Google Chrome',
    msedge: 'Microsoft Edge',
    firefox: 'Firefox',
    brave: 'Brave',
    spotify: 'Spotify',
    deezer: 'Deezer',
    wmplayer: 'Windows Media Player',
    vkmusic: 'VK Music',
    telegram: 'Telegram',
    discord: 'Discord',
    explorer: 'Explorer',
    windowsterminal: 'Terminal',
    powershell: 'PowerShell',
    cmd: 'Command Prompt',
    notepad: 'Notepad',
    devenv: 'Visual Studio',
    slack: 'Slack',
    teams: 'Teams',
    notion: 'Notion',
    figma: 'Figma',
    obsidian: 'Obsidian',
    dota2: 'Dota 2',
    cs2: 'Counter-Strike 2',
    csgo: 'CS:GO',
    valorant: 'Valorant',
    leagueclient: 'League of Legends',
    steam: 'Steam',
    epicgameslauncher: 'Epic Games',
    sumatrapdf: 'SumatraPDF',
    acrord32: 'Adobe Acrobat',
    acrobat: 'Adobe Acrobat',
    rider: 'JetBrains Rider',
    vivaldi: 'Vivaldi',
    arc: 'Arc',
    yandex: 'Yandex Browser',
  }
  if (map[baseLower]) return map[baseLower]
  if (/applicationframehost|microsoftedge|msedge/i.test(base)) return 'Microsoft Edge'
  if (/chrome/i.test(base)) return 'Google Chrome'
  return appName.replace(/\.(exe|app)$/i, '')
}

function pushCurrentSegment(now: number): void {
  if (!currentSegmentActivity || currentSegmentCategories.length === 0) return
  const base = {
    appName: currentSegmentActivity.appName,
    windowTitle: currentSegmentActivity.windowTitle,
    startTime: currentSegmentStart,
    endTime: now,
    keystrokes: currentSegmentKeystrokes,
  }
  for (const cat of currentSegmentCategories) {
    segments.push({ ...base, category: cat })
  }
  currentSegmentKeystrokes = 0
}

function poll(): void {
  if (isPaused) return
  const now = Date.now()

  if (latestWinInfo) {
    const { appName: rawName, title: windowTitle, keys } = latestWinInfo
    totalSessionKeystrokes += keys
    currentSegmentKeystrokes += keys

    // AFK detection: real idle = no mouse/keyboard (GetLastInputInfo from detector)
    const idleMs = latestWinInfo.idleMs ?? 0
    if (idleMs >= afkThresholdMs && !isIdle) {
      emitIdle(true)
    } else if (idleMs < afkThresholdMs && isIdle) {
      emitIdle(false)
    }

    // Idle (desktop with no title) does not give XP; Unknown windows use title-based categorization
    const fgCategories =
      rawName === 'Idle'
        ? (['idle'] as ActivityCategory[])
        : categorizeMultiple(rawName, windowTitle)
    // Merge background categories (e.g. music playing in Spotify while gaming)
    const bgCats = (latestWinInfo.bgCategories || []) as ActivityCategory[]
    const mergedSet = new Set<ActivityCategory>(fgCategories)
    for (const bg of bgCats) {
      if (bg && bg !== 'idle') mergedSet.add(bg)
    }
    const categories = Array.from(mergedSet)
    const primaryCategory = fgCategories[0] ?? 'other'
    const displayName = getAppDisplayName(rawName)
    lastActivity = { appName: displayName, windowTitle, category: primaryCategory, categories, timestamp: now, keystrokes: totalSessionKeystrokes }
    listeners.forEach((cb) => cb(lastActivity!))

    const key = `${lastActivity.appName}|${[...categories].sort().join(',')}`
    const prevKey = currentSegmentActivity ? `${currentSegmentActivity.appName}|${[...currentSegmentCategories].sort().join(',')}` : ''
    if (key !== prevKey) {
      pushCurrentSegment(now)
      currentSegmentStart = now
      currentSegmentCategories = categories
      currentSegmentActivity = lastActivity
    }
  } else {
    lastActivity = { appName: 'Unknown', windowTitle: 'Searching 4 window...', category: 'other', categories: ['other'], timestamp: now, keystrokes: totalSessionKeystrokes }
    currentSegmentCategories = ['other']
    listeners.forEach((cb) => cb(lastActivity!))
  }
}

export function getTrackerApi() {
  return {
    start() {
      if (pollInterval) return
      segments = []
      currentSegmentStart = Date.now()
      currentSegmentActivity = null
      currentSegmentCategories = []
      currentSegmentKeystrokes = 0
      totalSessionKeystrokes = 0
      isIdle = false
      latestWinInfo = null
      detectorRestartCount = 0
      pollInterval = setInterval(poll, POLL_INTERVAL_MS)
      poll() // run immediately so we show "Detecting..." then update when first WIN line arrives
      setTimeout(poll, 800) // and again after detector had time to output (script loop is 1.5s)
      if (process.platform !== 'win32') return
      probePowerShell().then((ok) => {
        if (ok) {
          startWindowDetector()
        } else {
          log.error('[tracker] PowerShell probe failed (no output or timeout). Window detector not started. Check that Windows PowerShell is installed and not blocked.')
        }
      })
    },
    stop(): ActivitySegment[] {
      if (pollInterval) {
        clearInterval(pollInterval)
        pollInterval = null
      }
      isPaused = false
      isIdle = false
      pushCurrentSegment(Date.now())
      currentSegmentActivity = null
      stopWindowDetector()
      const result = [...segments]
      segments = []
      return result
    },
    pause() {
      isPaused = true
    },
    resume() {
      isPaused = false
      isIdle = false
    },
    getCurrentActivity(): ActivitySnapshot | null {
      return lastActivity
    },
    onActivityUpdate(cb: (a: ActivitySnapshot) => void) {
      listeners.push(cb)
      return () => {
        const i = listeners.indexOf(cb)
        if (i >= 0) listeners.splice(i, 1)
      }
    },
    onIdleChange(cb: (idle: boolean) => void) {
      idleListeners.push(cb)
      return () => {
        const i = idleListeners.indexOf(cb)
        if (i >= 0) idleListeners.splice(i, 1)
      }
    },
    setAfkThreshold(ms: number) {
      afkThresholdMs = Math.max(30000, ms) // minimum 30s
    },
  }
}

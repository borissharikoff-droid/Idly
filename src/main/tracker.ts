import { spawn, type ChildProcess, type SpawnOptions } from 'child_process'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import log from './logger'
import { refineActivityLabels, type LabelRefineInput } from './deepseek'
import { getDeepSeekApiKey } from './aiConfig'

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
                string bgCats = "";
                if (_iter % 2 == 0) {
                    bgCats = DetectBackgroundMusic(hwnd);
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

function parseLine(line: string): void {
  const trimmed = line.trim()
  if (!trimmed) return
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
    latestWinInfo = { appName: 'Grindly.TrackerError', title: msg, keys: 0, idleMs: 0, bgCategories: [] }
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
  const bgCategories = bgRaw ? bgRaw.split(',').filter(Boolean) : lastKnownBgCategories
  if (bgRaw) lastKnownBgCategories = bgCategories
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
    const args = ['-NoProfile', '-NoLogo', '-NonInteractive', '-Command', "Write-Output 'GRINDLY_PROBE_OK'"]
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
      if (stdout.includes('GRINDLY_PROBE_OK')) done(true)
    })
    child.on('error', () => done(false))
    child.on('exit', () => {
      if (!resolved) done(stdout.includes('GRINDLY_PROBE_OK'))
    })
    setTimeout(() => done(stdout.includes('GRINDLY_PROBE_OK')), PROBE_TIMEOUT_MS)
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
      detectorScriptPath = path.join(scriptDir, 'grindly-window-detector.ps1')
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
  /** Optional context tag for richer analytics (for now, in-memory only). */
  contextTag?: string
  /** Confidence score for category assignment (0..1). */
  confidence?: number
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
const LEARNING_TITLE = /подкаст|podcast|лекци|lecture|курс|course|урок|lesson|lessons|tutorial|tutorials|guide|training|udemy|stepik|edx|coursera|khan academy|обучение|learning|теория/i
const CODING_TITLE = /claude(\s+code)?|claude\.ai|code\.claude\.ai|github|gitlab|bitbucket|stack\s*overflow|leetcode|codeforces|hackerrank|codesandbox|replit|vscode\.dev|codepen|pull request|merge request|api reference|developer docs|typescript docs|mdn web docs/i
const DESIGN_TITLE = /figma|canva|dribbble|behance|mockup|prototype|wireframe|ui kit|design system/i
const SOCIAL_TITLE = /twitter|x\.com|reddit|facebook|instagram|linkedin|discord web|messenger/i
const ENTERTAINMENT_TITLE = /netflix|twitch|prime video|hbo max|disney\+|youtube(?!\s*music)/i
const BROWSER_HOST_CODING = /github\.dev|vscode\.dev|codesandbox|stackblitz|replit|codespace|codepen|claude\.ai|code\.claude\.ai/i
const BROWSER_HOST_DESIGN = /figma\.com|canva\.com|dribbble\.com|behance\.net/i
const BROWSER_HOST_SOCIAL = /x\.com|twitter\.com|reddit\.com|facebook\.com|instagram\.com|linkedin\.com/i
const BROWSER_HOST_LEARNING = /udemy|coursera|khan academy|edx|stepik|tutorial|documentation|docs|wikipedia|notion|readthedocs|developer\.mozilla|mdn/i
const DOC_READING_TITLE = /readme|documentation|docs|wiki|manual|guide|api reference|knowledge base|paper|article|research|syllabus|chapter|lesson|lecture|курс|лекц|документац|справка|blog|post|medium\.com|habr|vc\.ru|dev\.to|stackoverflow|stack overflow|mdn|developer\.mozilla|notion|evernote|obsidian|book|книг|статья|статьи|reading|читаю|читать/i
const TERMINAL_APP = /^(windowsterminal|terminal|powershell|pwsh|cmd|bash|zsh|wsl|wezterm|alacritty|hyper|conhost|mintty|putty|mobaxterm)$/i
const TERMINAL_WORK_TITLE = /npm|pnpm|yarn|bun|node|python|pip|poetry|cargo|rust|go\s(test|run|build)|javac|gradle|maven|dotnet|tsc|vite|webpack|docker|kubectl|git|ssh|make|cmake|build|test|serve|dev/i

/** Passive activities (reading, learning) get extended AFK threshold so you don't lose XP while focused on content. */
function getEffectiveAfkThreshold(windowTitle: string, previousCategory: ActivityCategory | null): number {
  const lowerTitle = windowTitle.toLowerCase()
  const isPassiveReading =
    DOC_READING_TITLE.test(lowerTitle) ||
    /\.pdf|\.epub|\.mobi|kindle|reader|sumatrapdf|acrobat|foxit|calibre/i.test(lowerTitle)
  const isPassiveCategory = previousCategory === 'learning'
  // 10× for reading/learning: ~30 min idle before AFK vs 3 min for active work
  return isPassiveReading || isPassiveCategory ? afkThresholdMs * 10 : afkThresholdMs
}

interface AiRefinementCacheEntry {
  category: ActivityCategory
  confidence: number
  reason: string
  ts: number
}

const AI_CACHE_TTL_MS = 12 * 60 * 60 * 1000
const AI_MAX_CACHE_ITEMS = 1200
const AI_REFINE_BATCH_SIZE = 8
const AI_REFINE_INTERVAL_MS = 2500
const AI_REFINE_MAX_QUEUE = 48
const AI_REFINE_ERROR_COOLDOWN_MS = 60_000
const aiApiKey = getDeepSeekApiKey()
const aiRefinementCache = new Map<string, AiRefinementCacheEntry>()
const aiRefinementQueue = new Map<string, LabelRefineInput>()
const aiRefinementPending = new Set<string>()
let aiRefineLoop: NodeJS.Timeout | null = null
let aiRefineInFlight = false
let aiRefineCooldownUntil = 0

function makeAiCacheKey(appName: string, windowTitle: string): string {
  const app = appName.toLowerCase().trim()
  const title = windowTitle.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 180)
  return `${app}|${title}`
}

function normalizeAiCategory(category: string): ActivityCategory | null {
  const c = category.toLowerCase()
  const allowed: ActivityCategory[] = ['coding', 'design', 'games', 'social', 'browsing', 'creative', 'learning', 'music', 'other']
  return (allowed as string[]).includes(c) ? (c as ActivityCategory) : null
}

function setAiCache(appName: string, windowTitle: string, category: ActivityCategory, confidence: number, reason: string): void {
  if (aiRefinementCache.size >= AI_MAX_CACHE_ITEMS) {
    const oldestKey = aiRefinementCache.keys().next().value as string | undefined
    if (oldestKey) aiRefinementCache.delete(oldestKey)
  }
  aiRefinementCache.set(makeAiCacheKey(appName, windowTitle), {
    category,
    confidence: Math.max(0, Math.min(1, confidence)),
    reason: reason.slice(0, 120),
    ts: Date.now(),
  })
}

function getAiCache(appName: string, windowTitle: string): AiRefinementCacheEntry | null {
  const key = makeAiCacheKey(appName, windowTitle)
  const cached = aiRefinementCache.get(key)
  if (!cached) return null
  if (Date.now() - cached.ts > AI_CACHE_TTL_MS) {
    aiRefinementCache.delete(key)
    return null
  }
  return cached
}

function shouldUseAiRefinement(appName: string, windowTitle: string, base: ClassificationResult): boolean {
  if (!aiApiKey || appName === 'Idle') return false
  const lowerApp = appName.toLowerCase().replace(/\.(exe|app)$/i, '')
  const lowerTitle = windowTitle.toLowerCase()
  if (!lowerTitle || lowerTitle.length < 4) return false
  if (/\bgrindly\b/.test(lowerApp) || /\bgrindly\b/.test(lowerTitle)) return false
  if (/^(new tab|about:blank|start page|home)$/.test(lowerTitle.trim())) return false
  const browserLike = /^(chrome|firefox|msedge|brave|opera|vivaldi|arc|yandex|applicationframehost)$/i.test(lowerApp)
  const terminalLike = TERMINAL_APP.test(lowerApp)
  const uncertain = base.confidence < 0.88
  const ambiguousCategory = base.categories[0] === 'browsing' || base.categories[0] === 'other' || base.categories[0] === 'learning'
  return browserLike || terminalLike || uncertain || ambiguousCategory
}

function enqueueAiRefinement(appName: string, windowTitle: string, currentCategory: ActivityCategory): void {
  const key = makeAiCacheKey(appName, windowTitle)
  if (aiRefinementCache.has(key) || aiRefinementQueue.has(key) || aiRefinementPending.has(key)) return
  if (aiRefinementQueue.size >= AI_REFINE_MAX_QUEUE) {
    const oldestKey = aiRefinementQueue.keys().next().value as string | undefined
    if (oldestKey) aiRefinementQueue.delete(oldestKey)
  }
  aiRefinementQueue.set(key, {
    app_name: appName,
    window_title: windowTitle,
    current_category: currentCategory,
  })
}

async function processAiRefinementQueue(): Promise<void> {
  if (!aiApiKey || aiRefineInFlight) return
  if (Date.now() < aiRefineCooldownUntil) return
  if (aiRefinementQueue.size === 0) return
  aiRefineInFlight = true
  const selected: { key: string; item: LabelRefineInput }[] = []
  for (const [key, item] of aiRefinementQueue.entries()) {
    selected.push({ key, item })
    aiRefinementQueue.delete(key)
    aiRefinementPending.add(key)
    if (selected.length >= AI_REFINE_BATCH_SIZE) break
  }
  try {
    const refined = await refineActivityLabels(selected.map((s) => s.item), aiApiKey)
    for (const row of refined) {
      const normalized = normalizeAiCategory(row.refined_category)
      if (!normalized) continue
      setAiCache(row.app_name, row.window_title, normalized, row.confidence, row.reason)
    }
  } catch (err) {
    aiRefineCooldownUntil = Date.now() + AI_REFINE_ERROR_COOLDOWN_MS
    log.warn('[tracker] AI refinement failed, temporary cooldown', err)
  } finally {
    for (const { key } of selected) aiRefinementPending.delete(key)
    aiRefineInFlight = false
  }
}

function startAiRefinementLoop(): void {
  if (!aiApiKey || aiRefineLoop) return
  aiRefineLoop = setInterval(() => {
    void processAiRefinementQueue()
  }, AI_REFINE_INTERVAL_MS)
}

function stopAiRefinementLoop(): void {
  if (aiRefineLoop) {
    clearInterval(aiRefineLoop)
    aiRefineLoop = null
  }
  aiRefineInFlight = false
  aiRefinementQueue.clear()
  aiRefinementPending.clear()
}

function refineClassificationWithAi(appName: string, windowTitle: string, base: ClassificationResult): ClassificationResult {
  const cached = getAiCache(appName, windowTitle)
  if (cached) {
    return {
      categories: [cached.category],
      contextTag: `ai_${base.contextTag}`,
      confidence: Math.max(base.confidence, cached.confidence),
    }
  }
  if (shouldUseAiRefinement(appName, windowTitle, base)) {
    enqueueAiRefinement(appName, windowTitle, base.categories[0] ?? 'other')
  }
  return base
}

export interface ClassificationResult {
  categories: ActivityCategory[]
  contextTag: string
  confidence: number
}

function classifyBrowserContext(lowerTitle: string): ClassificationResult {
  const isCoding = CODING_TITLE.test(lowerTitle) || BROWSER_HOST_CODING.test(lowerTitle)
  const isDesign = DESIGN_TITLE.test(lowerTitle) || BROWSER_HOST_DESIGN.test(lowerTitle)
  const isLearning = LEARNING_TITLE.test(lowerTitle) || BROWSER_HOST_LEARNING.test(lowerTitle)
  const isSocial = SOCIAL_TITLE.test(lowerTitle) || BROWSER_HOST_SOCIAL.test(lowerTitle)
  const isMusic = MUSIC_TITLE.test(lowerTitle)
  const isEntertainment = ENTERTAINMENT_TITLE.test(lowerTitle)
  const isPdf = /\.pdf\b/.test(lowerTitle)
  const isDocReading = isPdf || DOC_READING_TITLE.test(lowerTitle)

  // Priority order keeps signal deterministic and easier to reason about.
  if (isMusic && isDocReading) return { categories: ['music', 'learning'], contextTag: 'browser_music_learning', confidence: 0.9 }
  if (isDocReading) return { categories: ['learning'], contextTag: 'browser_docs_learning', confidence: 0.92 }
  if (isCoding) return { categories: ['coding'], contextTag: 'browser_coding', confidence: 0.95 }
  if (isDesign) return { categories: ['design'], contextTag: 'browser_design', confidence: 0.93 }
  if (isMusic && isLearning) return { categories: ['music', 'learning'], contextTag: 'browser_music_learning', confidence: 0.9 }
  if (isMusic) return { categories: ['music'], contextTag: 'browser_music', confidence: 0.95 }
  if (isLearning) return { categories: ['learning'], contextTag: 'browser_learning', confidence: 0.9 }
  if (isSocial) return { categories: ['social'], contextTag: 'browser_social', confidence: 0.9 }
  if (isEntertainment) return { categories: ['other'], contextTag: 'browser_entertainment', confidence: 0.82 }
  return { categories: ['browsing'], contextTag: 'browser_research', confidence: 0.7 }
}

/** Returns one or more categories (e.g. music + learning for podcast on music site). */
export function categorizeMultiple(appName: string, windowTitle: string): ActivityCategory[] {
  return categorizeDetailed(appName, windowTitle).categories
}

export function categorizeDetailed(appName: string, windowTitle: string): ClassificationResult {
  const lowerApp = appName.toLowerCase().replace(/\.(exe|app)$/i, '')
  const lowerTitle = windowTitle.toLowerCase()
  // When process name is unknown (e.g. protected), infer from window title
  if (lowerApp === 'unknown' && lowerTitle) {
    if (/cursor|visual studio|\.tsx?|\.jsx?|\.py\b|\.rs\b|\.go\b|code\s*\-/i.test(lowerTitle) || CODING_TITLE.test(lowerTitle)) return { categories: ['coding'], contextTag: 'unknown_title_coding', confidence: 0.85 }
    if (/chrome|firefox|edge|brave|opera|browser/i.test(lowerTitle)) return { categories: ['browsing'], contextTag: 'unknown_browser', confidence: 0.6 }
    if (MUSIC_TITLE.test(lowerTitle)) return { categories: ['music'], contextTag: 'unknown_title_music', confidence: 0.75 }
    if (LEARNING_TITLE.test(lowerTitle)) return { categories: ['learning'], contextTag: 'unknown_title_learning', confidence: 0.75 }
    if (/figma|design|mockup/i.test(lowerTitle)) return { categories: ['design'], contextTag: 'unknown_title_design', confidence: 0.8 }
    if (/telegram|discord|slack|whatsapp|teams/i.test(lowerTitle)) return { categories: ['social'], contextTag: 'unknown_title_social', confidence: 0.8 }
    if (/steam|game|play/i.test(lowerTitle)) return { categories: ['games'], contextTag: 'unknown_title_games', confidence: 0.8 }
  }
  if (TERMINAL_APP.test(lowerApp) || /terminal|powershell|command prompt/i.test(lowerTitle)) {
    if (DOC_READING_TITLE.test(lowerTitle) || /\.pdf\b|\.docx?\b|\.pptx?\b/i.test(lowerTitle)) {
      return { categories: ['learning'], contextTag: 'terminal_docs_learning', confidence: 0.88 }
    }
    if (TERMINAL_WORK_TITLE.test(lowerTitle) || !lowerTitle) {
      return { categories: ['coding'], contextTag: 'terminal_work', confidence: 0.94 }
    }
    return { categories: ['coding'], contextTag: 'terminal_generic', confidence: 0.9 }
  }
  if (/^(code|cursor|intellij|webstorm|pycharm|idea|devenv|rider)$/i.test(lowerApp) || /visual studio/i.test(lowerApp)) return { categories: ['coding'], contextTag: 'native_ide', confidence: 0.98 }
  if (/\.(tsx?|jsx?|py|rs|go|cpp|cs|java)\b/i.test(lowerTitle)) return { categories: ['coding'], contextTag: 'source_file', confidence: 0.92 }
  if (/^(chrome|firefox|msedge|brave|opera|vivaldi|arc|yandex)$/i.test(lowerApp)) {
    return classifyBrowserContext(lowerTitle)
  }
  if (/^(figma|photoshop|sketch|canva|illustrator|xd|invision|zeplin|affinity|gimp|krita)$/i.test(lowerApp) || /figma|design|mockup/i.test(lowerTitle)) return { categories: ['design'], contextTag: 'native_design', confidence: 0.95 }
  if (/^(ableton|fl studio|reaper|logic|audacity|premiere|davinci|resolve|obs|blender|afterfx|vegas|cinema4d)$/i.test(lowerApp) || /premiere|davinci|blender|after effects/i.test(lowerTitle)) return { categories: ['creative'], contextTag: 'creative_suite', confidence: 0.95 }
  if (/^(notion|obsidian|anki|sumatrapdf|acrobat|acrord32|foxit|foxitreader|kindle|evernote|onenote)$/i.test(lowerApp) || /\.pdf\b|notion|obsidian|anki/i.test(lowerTitle)) return { categories: ['learning'], contextTag: 'learning_tools', confidence: 0.92 }
  if (/^(spotify|music|soundcloud|itunes|tidal|yandexmusic|deezer|wmplayer|vkmusic)$/i.test(lowerApp) || MUSIC_TITLE.test(lowerTitle)) return { categories: ['music'], contextTag: 'music_tools', confidence: 0.96 }
  if (/^(steam|epicgameslauncher|valorant|leagueclient|dota2|dota\s*2|minecraft|fortniteclient|gta|csgo|cs2|overwatch|battle\.net|javaw)$/i.test(lowerApp.replace(/\s+/g, '')) || /dota\s*2|game|play|steam/i.test(lowerTitle)) return { categories: ['games'], contextTag: 'games_tools', confidence: 0.96 }
  if (/^(telegram|discord|slack|whatsapp|teams)$/i.test(lowerApp)) return { categories: ['social'], contextTag: 'messenger', confidence: 0.95 }
  // Windows: Edge/Chrome sometimes as "Application Frame Host" or "Microsoft Edge"
  if (/applicationframehost|microsoft edge|msedge|browser/i.test(lowerApp.replace(/\s+/g, ''))) return { categories: ['browsing'], contextTag: 'browser_host_fallback', confidence: 0.55 }
  if (/^(chrome|firefox|edge)$/i.test(lowerApp.replace(/\s+/g, ''))) return { categories: ['browsing'], contextTag: 'browser_name_fallback', confidence: 0.55 }
  return { categories: ['other'], contextTag: 'unknown', confidence: 0.5 }
}

function getAppDisplayName(appName: string): string {
  if (appName === 'Grindly.TrackerError') return 'Window detector error'
  if (appName === 'Unknown') return 'Window'
  const base = appName.replace(/\.(exe|app)$/i, '').replace(/\s+/g, '')
  const baseLower = base.toLowerCase()
  if (baseLower === 'electron' || baseLower === 'grindly') return 'Grindly'
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
    const effectiveAfkThresholdMs = getEffectiveAfkThreshold(
      windowTitle,
      (lastActivity?.category as ActivityCategory | undefined) ?? null,
    )
    if (idleMs >= effectiveAfkThresholdMs && !isIdle) {
      emitIdle(true)
    } else if (idleMs < effectiveAfkThresholdMs && isIdle) {
      emitIdle(false)
    }

    // Idle (desktop with no title) does not give XP; Unknown windows use title-based categorization
    const heuristicsClassification =
      rawName === 'Idle'
        ? ({ categories: ['idle'] as ActivityCategory[], contextTag: 'idle', confidence: 1 } as ClassificationResult)
        : categorizeDetailed(rawName, windowTitle)
    const fgClassification =
      rawName === 'Idle'
        ? heuristicsClassification
        : refineClassificationWithAi(rawName, windowTitle, heuristicsClassification)
    const fgCategories = fgClassification.categories
    // Merge background categories (e.g. music playing in Spotify while gaming)
    const bgCats = (latestWinInfo.bgCategories || []) as ActivityCategory[]
    const mergedSet = new Set<ActivityCategory>(fgCategories)
    for (const bg of bgCats) {
      if (bg && bg !== 'idle') mergedSet.add(bg)
    }
    const categories = Array.from(mergedSet)
    const primaryCategory = fgCategories[0] ?? 'other'
    const displayName = getAppDisplayName(rawName)
    lastActivity = {
      appName: displayName,
      windowTitle,
      category: primaryCategory,
      categories,
      contextTag: fgClassification.contextTag,
      confidence: fgClassification.confidence,
      timestamp: now,
      keystrokes: totalSessionKeystrokes,
    }
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
      startAiRefinementLoop()
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
      stopAiRefinementLoop()
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

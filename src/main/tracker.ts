import { spawn, type ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'
import log from './logger'

// ── Persistent PowerShell window detector ──

let detectorProcess: ChildProcess | null = null
let latestWinInfo: { appName: string; title: string; keys: number; idleMs: number } | null = null
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
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class WinApi {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowTextLength(IntPtr hWnd);
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
    public static string GetTitle(IntPtr hWnd) {
        int len = GetWindowTextLength(hWnd);
        if (len <= 0) return "";
        StringBuilder sb = new StringBuilder(len + 1);
        GetWindowText(hWnd, sb, sb.Capacity);
        return sb.ToString();
    }
    public static int CountKeyPresses() {
        int count = 0;
        for (int vk = 0x08; vk <= 0xFE; vk++) {
            short state = GetAsyncKeyState(vk);
            if ((state & 0x0001) != 0) count++;
        }
        return count;
    }
    public static int GetIdleMs() {
        LASTINPUTINFO lii = new LASTINPUTINFO();
        lii.cbSize = (uint)Marshal.SizeOf(typeof(LASTINPUTINFO));
        if (!GetLastInputInfo(ref lii)) return 0;
        uint now = GetTickCount();
        return (int)(now - lii.dwTime);
    }
}
"@
while ($true) {
    try {
        $keys = [WinApi]::CountKeyPresses()
        $idleMs = [WinApi]::GetIdleMs()
        $hwnd = [WinApi]::GetForegroundWindow()
        $pid2 = [uint32]0
        [void][WinApi]::GetWindowThreadProcessId($hwnd, [ref]$pid2)
        if ($pid2 -gt 0) {
            $pname = $null
            $proc = Get-Process -Id $pid2 -ErrorAction SilentlyContinue
            if ($proc) { $pname = $proc.ProcessName }
            if (-not $pname) {
                try {
                    $cim = Get-CimInstance Win32_Process -Filter ("ProcessId = " + $pid2) -ErrorAction SilentlyContinue
                    if ($cim -and $cim.Name) { $pname = [System.IO.Path]::GetFileNameWithoutExtension($cim.Name) }
                } catch { }
            }
            if ($pname -eq 'explorer') {
                [Console]::Out.WriteLine("WIN:Idle||" + $keys + "|" + $idleMs)
                [Console]::Out.Flush()
            } elseif ($pname) {
                $title = ([WinApi]::GetTitle($hwnd)) -replace '\|', '&#124;'
                [Console]::Out.WriteLine("WIN:" + $pname + "|" + $title + "|" + $keys + "|" + $idleMs)
                [Console]::Out.Flush()
            } else {
                [Console]::Out.WriteLine("WIN:Idle||" + $keys + "|" + $idleMs)
                [Console]::Out.Flush()
            }
        } else {
            [Console]::Out.WriteLine("WIN:Idle||" + $keys + "|" + $idleMs)
            [Console]::Out.Flush()
        }
    } catch {
        [Console]::Out.WriteLine("WIN:Idle||0|0")
        [Console]::Out.Flush()
    }
    Start-Sleep -Milliseconds 1500
}
`.replace(/\r?\n/g, '\n').trim()

let hasReceivedWinLine = false

function parseLine(line: string): void {
  const trimmed = line.trim()
  if (!trimmed.startsWith('WIN:')) return
  if (!hasReceivedWinLine) {
    hasReceivedWinLine = true
    log.info('[tracker] First window data received')
  }
  const payload = trimmed.slice(4)
  const parts = payload.split('|')
  if (parts.length < 4) return
  const appName = (parts[0] ?? '').trim() || 'Idle'
  const keys = parseInt(parts[parts.length - 2], 10) || 0
  const idleMs = parseInt(parts[parts.length - 1], 10) || 0
  const title = parts.slice(1, -2).join('|').replace(/&#124;/g, '|').trim()
  latestWinInfo = { appName, title, keys, idleMs }
}

let detectorScriptPath: string | null = null

function startWindowDetector(): void {
  if (process.platform !== 'win32') return
  if (detectorProcess) return
  log.info('[tracker] Starting persistent window detector')
  hasReceivedWinLine = false

  try {
    const tmpDir = os.tmpdir()
    detectorScriptPath = path.join(tmpDir, `grinder-window-detector-${process.pid}.ps1`)
    fs.writeFileSync(detectorScriptPath, '\uFEFF' + DETECTOR_SCRIPT, { encoding: 'utf8' })
  } catch (e) {
    log.error('[tracker] Failed to write detector script', e)
    return
  }

  detectorProcess = spawn(
    'powershell',
    ['-NoProfile', '-NoLogo', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', detectorScriptPath],
    { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, cwd: process.cwd(), env: process.env }
  )

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
    if (msg) log.warn('[tracker:stderr]', msg)
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

  if (detectorRestartTimeout) {
    clearTimeout(detectorRestartTimeout)
    detectorRestartTimeout = null
  }
  detectorRestartTimeout = setTimeout(() => {
    detectorRestartTimeout = null
    if (hasReceivedWinLine || detectorRestartCount > 0) return
    log.warn('[tracker] No window data after 10s, restarting detector once')
    detectorRestartCount++
    stopWindowDetector()
    startWindowDetector()
  }, 10_000)
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
export type ActivityCategory = 'coding' | 'design' | 'games' | 'social' | 'browsing' | 'creative' | 'learning' | 'music' | 'other'

export interface ActivitySnapshot {
  appName: string
  windowTitle: string
  category: ActivityCategory
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
function categorizeMultiple(appName: string, windowTitle: string): ActivityCategory[] {
  const lowerApp = appName.toLowerCase().replace(/\.(exe|app)$/i, '')
  const lowerTitle = windowTitle.toLowerCase()
  if (/^(code|cursor|intellij|webstorm|pycharm|idea|devenv|rider)$/i.test(lowerApp) || /visual studio/i.test(lowerApp)) return ['coding']
  if (/\.(tsx?|jsx?|py|rs|go|cpp|cs|java)\b/i.test(lowerTitle)) return ['coding']
  if (/^(figma|photoshop|sketch|canva|illustrator|xd|invision|zeplin|affinity|gimp|krita)$/i.test(lowerApp) || /figma|design|mockup/i.test(lowerTitle)) return ['design']
  if (/^(ableton|fl studio|reaper|logic|audacity|premiere|davinci|resolve|obs|blender|afterfx|vegas|cinema4d)$/i.test(lowerApp) || /premiere|davinci|blender|after effects/i.test(lowerTitle)) return ['creative']
  if (/^(notion|obsidian|anki|sumatrapdf|acrobat|acrord32|foxit|foxitreader|kindle|evernote|onenote)$/i.test(lowerApp) || /\.pdf\b|notion|obsidian|anki/i.test(lowerTitle)) return ['learning']
  if (/^(spotify|music|soundcloud|itunes|tidal|yandexmusic|deezer|wmplayer|vkmusic)$/i.test(lowerApp) || MUSIC_TITLE.test(lowerTitle)) return ['music']
  if (/^(steam|epicgameslauncher|valorant|leagueclient|dota2|minecraft|fortniteclient|gta|csgo|cs2|overwatch|battle\.net|javaw)$/i.test(lowerApp) || /game|play|steam/i.test(lowerTitle)) return ['games']
  if (/^(telegram|discord|slack|whatsapp|teams)$/i.test(lowerApp)) return ['social']
  if (/^(chrome|firefox|msedge|brave|opera|vivaldi|arc|yandex)$/i.test(lowerApp)) {
    const isMusic = MUSIC_TITLE.test(lowerTitle)
    const isLearning = LEARNING_TITLE.test(lowerTitle)
    if (isMusic && isLearning) return ['music', 'learning']
    if (isMusic) return ['music']
    if (isLearning) return ['learning']
    return ['browsing']
  }
  return ['other']
}

function getAppDisplayName(appName: string): string {
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
  const base = appName.replace(/\.(exe|app)$/i, '')
  return map[base.toLowerCase()] || base
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

    const categories = categorizeMultiple(rawName, windowTitle)
    const primaryCategory = categories[0] ?? 'other'
    const displayName = getAppDisplayName(rawName)
    lastActivity = { appName: displayName, windowTitle, category: primaryCategory, timestamp: now, keystrokes: totalSessionKeystrokes }
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
    lastActivity = { appName: 'Unknown', windowTitle: 'Detecting...', category: 'other', timestamp: now, keystrokes: totalSessionKeystrokes }
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
      startWindowDetector()
      pollInterval = setInterval(poll, POLL_INTERVAL_MS)
      setTimeout(poll, 2500)
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

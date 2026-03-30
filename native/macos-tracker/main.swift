// Grindly macOS Activity Tracker
// Outputs: WIN:AppName|WindowTitle|0|IdleMs|bgCats
// Requires Accessibility permission for window titles (optional).
import Foundation
import AppKit
import ApplicationServices
import IOKit

// MARK: - Idle time via IOHIDSystem

func getIdleMs() -> Int {
    var iter: io_iterator_t = 0
    guard IOServiceGetMatchingServices(
        mach_port_t(0),
        IOServiceMatching("IOHIDSystem"),
        &iter
    ) == kIOReturnSuccess else { return 0 }
    defer { IOObjectRelease(iter) }

    let service = IOIteratorNext(iter)
    guard service != IO_OBJECT_NULL else { return 0 }
    defer { IOObjectRelease(service) }

    var propsRef: Unmanaged<CFMutableDictionary>?
    guard IORegistryEntryCreateCFProperties(service, &propsRef, kCFAllocatorDefault, 0) == kIOReturnSuccess,
          let props = propsRef?.takeRetainedValue() as? NSDictionary,
          let idleNS = props["HIDIdleTime"] as? NSNumber else {
        return 0
    }
    return Int(idleNS.uint64Value / 1_000_000)
}

// MARK: - Window title via Accessibility API

func getWindowTitle(pid: pid_t) -> String {
    let axApp = AXUIElementCreateApplication(pid)
    var focusedRef: CFTypeRef?
    guard AXUIElementCopyAttributeValue(axApp, kAXFocusedWindowAttribute as CFString, &focusedRef) == .success,
          let focusedWindow = focusedRef else { return "" }
    // unsafeBitCast is the idiomatic way to convert CF types in Swift
    let focusedElement: AXUIElement = unsafeBitCast(focusedWindow, to: AXUIElement.self)
    var titleRef: CFTypeRef?
    guard AXUIElementCopyAttributeValue(focusedElement, kAXTitleAttribute as CFString, &titleRef) == .success,
          let title = titleRef as? String else { return "" }
    return title
}

// MARK: - Background music detection

let musicBundleIds: [String] = [
    "com.spotify.client",
    "com.apple.Music",
    "com.tidal.desktop",
    "co.deezer.Deezer-Music",
    "com.amazon.music",
    "com.soundcloud.desktop",
    "fm.last.Last.fm",
    "com.vkontakte.VKDesktop",
    "org.videolan.vlc",
    "com.foobar2000.foobar2000",
]

let musicAppNames: [String] = [
    "spotify", "music", "itunes", "tidal", "deezer", "vk music",
    "amazon music", "soundcloud", "last.fm", "vlc",
    "yandex music", "яндекс музыка",
]

func detectBackgroundMusic(foregroundPid: pid_t) -> String {
    let apps = NSWorkspace.shared.runningApplications
    for app in apps {
        guard app.activationPolicy == .regular else { continue }
        guard app.processIdentifier != foregroundPid else { continue }
        if let bundleId = app.bundleIdentifier?.lowercased() {
            for id in musicBundleIds where bundleId == id.lowercased() {
                return "music"
            }
        }
        if let name = app.localizedName?.lowercased() {
            for musicName in musicAppNames where name.contains(musicName) {
                return "music"
            }
        }
    }
    return ""
}

// MARK: - String sanitization (mirrors Windows PS tracker format)

func sanitize(_ s: String) -> String {
    return s
        .replacingOccurrences(of: "|", with: "&#124;")
        .replacingOccurrences(of: "\r", with: " ")
        .replacingOccurrences(of: "\n", with: " ")
        .trimmingCharacters(in: .whitespaces)
}

// MARK: - Main loop

print("READY")
fflush(stdout)

var iteration = 0

while true {
    autoreleasepool {
        iteration += 1

        let idleMs = getIdleMs()
        let frontApp = NSWorkspace.shared.frontmostApplication

        let appName: String
        let windowTitle: String

        if let app = frontApp {
            let rawName = app.localizedName ?? app.bundleIdentifier ?? "Unknown"
            appName = sanitize(rawName)
            windowTitle = sanitize(getWindowTitle(pid: app.processIdentifier))
        } else {
            appName = "Idle"
            windowTitle = ""
        }

        // Background music check every 2nd iteration to reduce overhead
        let bgCats: String
        if iteration % 2 == 0, let app = frontApp {
            bgCats = detectBackgroundMusic(foregroundPid: app.processIdentifier)
        } else {
            bgCats = ""
        }

        print("WIN:\(appName)|\(windowTitle)|0|\(idleMs)|\(bgCats)")
        fflush(stdout)
    }
    Thread.sleep(forTimeInterval: 1.5)
}

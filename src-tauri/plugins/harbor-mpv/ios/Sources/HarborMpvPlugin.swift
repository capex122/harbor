import AVFoundation
import SwiftRs
import Tauri
import UIKit
import VLCKit
import WebKit

final class HarborMpvPlugin: Plugin {
    private let player = HarborVlcPlayer()

    override func load(webview: WKWebView) {
        webview.scrollView.contentInsetAdjustmentBehavior = .never
        webview.scrollView.contentInset = .zero
        webview.scrollView.scrollIndicatorInsets = .zero
        if let root = webview.superview ?? manager.viewController?.view {
            NSLayoutConstraint.deactivate(root.constraints.filter {
                $0.firstItem === webview || $0.secondItem === webview
            })
            webview.translatesAutoresizingMaskIntoConstraints = false
            NSLayoutConstraint.activate([
                webview.leadingAnchor.constraint(equalTo: root.leadingAnchor),
                webview.trailingAnchor.constraint(equalTo: root.trailingAnchor),
                webview.topAnchor.constraint(equalTo: root.topAnchor),
                webview.bottomAnchor.constraint(equalTo: root.bottomAnchor),
            ])
        }
        player.install(below: webview)
    }

    @objc public func call(_ invoke: Invoke) throws {
        let payload = try invoke.getArgs()
        let method = payload.getString("method") ?? ""
        let args = payload.getObject("args") ?? [:]
        DispatchQueue.main.async {
            do {
                let result = try self.player.call(method, args)
                if let value = result as? Bool { invoke.resolve(value) }
                else if let value = result as? JSObject {
                    invoke.resolve(value.reduce(into: JsonObject()) { $0[$1.key] = $1.value })
                }
            } catch { invoke.reject(error.localizedDescription) }
        }
    }
}

@_cdecl("init_plugin_harbor_mpv")
func initPlugin() -> Plugin { HarborMpvPlugin() }

private final class HarborVlcPlayer: NSObject, VLCMediaPlayerDelegate {
    private weak var webview: WKWebView?
    private let view = UIView()
    private let player = VLCMediaPlayer(options: ["--no-video-title-show"])
    private var buffering = false
    private var errorMessage: String?

    override init() {
        super.init()
        view.backgroundColor = .black
        player.drawable = view
        player.delegate = self
        player.timeChangeUpdateInterval = 0.25
    }

    func install(below webview: WKWebView) {
        self.webview = webview
        webview.isOpaque = false
        webview.backgroundColor = .clear
        webview.scrollView.backgroundColor = .clear
        view.isHidden = true
        if let parent = webview.superview { parent.insertSubview(view, belowSubview: webview) }
    }

    func call(_ method: String, _ args: JSObject) throws -> JSValue {
        switch method {
        case "show": show(args); return [:] as JSObject
        case "hide": view.isHidden = true; return [:] as JSObject
        case "load": try load(args); return [:] as JSObject
        case "play": player.play(); return [:] as JSObject
        case "pause": player.pause(); return [:] as JSObject
        case "seek": player.time = VLCTime(number: NSNumber(value: seconds(args, "seconds") * 1000)); return [:] as JSObject
        case "setProperty": setProperty(args); return [:] as JSObject
        case "command": command(args); return [:] as JSObject
        case "addSubtitle": return addSubtitle(args)
        case "snapshot": return snapshot()
        case "stop": player.stop(); view.isHidden = true; return [:] as JSObject
        case "destroy": player.stop(); player.media = nil; view.isHidden = true; return [:] as JSObject
        default: throw failure("Unknown player operation: \(method)")
        }
    }

    private func load(_ args: JSObject) throws {
        guard let value = args.getString("url"), let url = URL(string: value) else {
            throw failure("Missing media URL")
        }
        try AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
        try AVAudioSession.sharedInstance().setActive(true)
        guard let media = VLCMedia(url: url) else { throw failure("VLCKit could not open the media URL") }
        if let headers = args.getObject("headers") {
            for (name, value) in headers { addHeader(String(describing: name), String(describing: value), to: media) }
        }
        let start = seconds(args, "startAtSec")
        if start > 0 { media.addOption(":start-time=\(start)") }
        errorMessage = nil
        player.media = media
        view.isHidden = false
        player.play()
        for item in args.getArray("subtitles") ?? [] {
            if let subtitle = item as? JSObject { _ = addSubtitle(subtitle) }
        }
    }

    private func show(_ args: JSObject) {
        guard let webview, let parent = webview.superview else { return }
        let rect = CGRect(
            x: point(args, "x"), y: point(args, "y"),
            width: point(args, "width"), height: point(args, "height")
        )
        view.frame = webview.convert(rect, to: parent)
        view.isHidden = rect.isEmpty
    }

    private func addSubtitle(_ args: JSObject) -> Bool {
        guard let value = args.getString("url"), let url = URL(string: value) else { return false }
        return player.addPlaybackSlave(url, type: .subtitle, enforce: args.getBool("select") == true) == 0
    }

    private func addHeader(_ name: String, _ value: String, to media: VLCMedia) {
        switch name.lowercased() {
        case "user-agent": media.addOption(":http-user-agent=\(value)")
        case "referer", "referrer": media.addOption(":http-referrer=\(value)")
        case "origin": media.addOption(":http-origin=\(value)")
        case "cookie": media.addOption(":http-cookie=\(value)")
        default: break
        }
    }

    private func setProperty(_ args: JSObject) {
        guard let name = args.getString("name"), let value = args.getValue("value") else { return }
        switch name {
        case "volume": player.audio?.volume = Int32((value as? NSNumber)?.intValue ?? 100)
        case "mute": player.audio?.isMuted = (value as? Bool) == true
        case "speed": player.rate = (value as? NSNumber)?.floatValue ?? 1
        case "aid": select(value, in: player.audioTracks)
        case "sid": selectSubtitle(value, secondary: false)
        case "secondary-sid": selectSubtitle(value, secondary: true)
        case "sub-visibility": if (value as? Bool) == false { player.deselectAllTextTracks() }
        case "sub-delay": player.currentVideoSubTitleDelay = Int(((value as? NSNumber)?.doubleValue ?? 0) * 1_000_000)
        case "audio-delay": player.currentAudioPlaybackDelay = Int(((value as? NSNumber)?.doubleValue ?? 0) * 1_000_000)
        case "video-aspect-override": player.videoAspectRatio = value as? String
        case "video-zoom": player.scaleFactor = max(0, 1 + ((value as? NSNumber)?.floatValue ?? 0))
        default: break
        }
    }

    private func select(_ value: JSValue, in tracks: [VLCMediaPlayer.Track]) {
        let id = String(describing: value)
        tracks.first { $0.trackId == id }?.isSelectedExclusively = true
    }

    private func selectSubtitle(_ value: JSValue, secondary: Bool) {
        let id = String(describing: value)
        guard id != "no", let track = player.textTracks.first(where: { $0.trackId == id }) else {
            if !secondary { player.deselectAllTextTracks() }
            return
        }
        if secondary {
            player.selectTextTracks(player.textTracks.filter(\.isSelected) + [track])
        } else {
            player.selectTextTracks([track])
        }
    }

    private func command(_ args: JSObject) {
        guard let command = args.getArray("values")?.first as? String else { return }
        if command == "frame-step" { player.gotoNextFrame() }
        else if command == "frame-back-step" { player.gotoPreviousFrame() }
    }

    private func snapshot() -> JSObject {
        let position = Double(player.time.value?.int64Value ?? 0) / 1000
        let duration = Double(player.media?.length.value?.int64Value ?? 0) / 1000
        var result: JSObject = [
            "status": status(), "positionSec": position, "durationSec": duration,
            "bufferedSec": 0, "buffering": buffering,
            "volume": Double(player.audio?.volume ?? 100) / 100,
            "muted": player.audio?.isMuted ?? false, "rate": Double(player.rate),
            "audioTracks": tracks(player.audioTracks, kind: "audio"),
            "subtitleTracks": tracks(player.textTracks, kind: "subtitle"),
            "chapters": [] as JSArray,
            "subDelaySec": Double(player.currentVideoSubTitleDelay) / 1_000_000,
            "audioDelaySec": Double(player.currentAudioPlaybackDelay) / 1_000_000,
            "subText": "", "subStartSec": 0, "secondarySubText": "", "audioNormalize": false,
            "videoWidth": Double(player.videoSize.width), "videoHeight": Double(player.videoSize.height),
            "hdrGamma": ""
        ]
        result["errorMessage"] = errorMessage ?? NSNull()
        result["errorCode"] = errorMessage == nil ? NSNull() : "decode"
        return result
    }

    private func tracks(_ tracks: [VLCMediaPlayer.Track], kind: String) -> JSArray {
        tracks.map {
            ["id": $0.trackId, "label": $0.trackName, "lang": $0.language ?? "",
             "kind": kind, "selected": $0.isSelected] as JSObject
        }
    }

    private func status() -> String {
        switch player.state {
        case .opening: return "loading"
        case .playing: return "playing"
        case .paused: return "paused"
        case .error: return "error"
        default: return "idle"
        }
    }

    func mediaPlayerStateChanged(_ newState: VLCMediaPlayerState) {
        buffering = newState == .opening
        if newState == .error { errorMessage = "VLCKit could not play this stream" }
    }

    func mediaPlayerBufferingChanged(_ progress: Float) { buffering = progress < 1 }

    private func seconds(_ args: JSObject, _ key: String) -> Double {
        (args.getValue(key) as? NSNumber)?.doubleValue ?? 0
    }

    private func point(_ args: JSObject, _ key: String) -> CGFloat { CGFloat(seconds(args, key)) }

    private func failure(_ message: String) -> NSError {
        NSError(domain: "HarborVlc", code: 2, userInfo: [NSLocalizedDescriptionKey: message])
    }
}

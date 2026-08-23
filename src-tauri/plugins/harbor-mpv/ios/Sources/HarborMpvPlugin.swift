import AVFoundation
import Libmpv
import QuartzCore
import SwiftRs
import Tauri
import UIKit
import WebKit

final class HarborMpvPlugin: Plugin {
    private let player = HarborMpvPlayer()

    override func load(webview: WKWebView) {
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
            }
            catch { invoke.reject(error.localizedDescription) }
        }
    }
}

@_cdecl("init_plugin_harbor_mpv")
func initPlugin() -> Plugin { HarborMpvPlugin() }

private final class HarborMetalLayer: CAMetalLayer {
    override var drawableSize: CGSize {
        get { super.drawableSize }
        set {
            if newValue.width > 1 && newValue.height > 1 { super.drawableSize = newValue }
        }
    }
}

private final class HarborMpvView: UIView {
    let metalLayer = HarborMetalLayer()

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .black
        metalLayer.contentsScale = UIScreen.main.nativeScale
        metalLayer.framebufferOnly = true
        layer.addSublayer(metalLayer)
    }

    required init?(coder: NSCoder) { nil }

    override func layoutSubviews() {
        super.layoutSubviews()
        metalLayer.frame = bounds
    }
}

private final class HarborMpvPlayer {
    private weak var webview: WKWebView?
    private let view = HarborMpvView(frame: .zero)
    private var mpv: OpaquePointer?
    private var errorMessage: String?

    deinit {
        if let mpv { mpv_terminate_destroy(mpv) }
    }

    func install(below webview: WKWebView) {
        self.webview = webview
        webview.isOpaque = false
        webview.backgroundColor = .clear
        webview.scrollView.backgroundColor = .clear
        view.isHidden = true
        webview.superview?.insertSubview(view, belowSubview: webview)
    }

    func call(_ method: String, _ args: JSObject) throws -> JSValue {
        switch method {
        case "show": show(args); return [:] as JSObject
        case "hide": view.isHidden = true; return [:] as JSObject
        case "load": try load(args); return [:] as JSObject
        case "play": setFlag("pause", false); return [:] as JSObject
        case "pause": setFlag("pause", true); return [:] as JSObject
        case "seek": command(["seek", numberString(args, "seconds"), "absolute", "exact"]); return [:] as JSObject
        case "setProperty": setProperty(args); return [:] as JSObject
        case "command": command((args.getArray("values") ?? []).map { String(describing: $0) }); return [:] as JSObject
        case "addSubtitle": addSubtitle(args); return true
        case "snapshot": return snapshot()
        case "stop": command(["stop"]); view.isHidden = true; return [:] as JSObject
        case "destroy": destroy(); return [:] as JSObject
        default: throw failure("Unknown MPV operation: \(method)")
        }
    }

    private func ensureMpv() throws {
        guard mpv == nil else { return }
        guard view.window != nil, view.bounds.width > 1, view.bounds.height > 1 else {
            throw failure("MPV video surface is not ready")
        }
        view.layoutIfNeeded()
        try AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
        try AVAudioSession.sharedInstance().setActive(true)
        guard let handle = mpv_create() else { throw failure("MPVKit could not create libmpv") }
        do {
            var layer = view.metalLayer
            try require(mpv_set_option(handle, "wid", MPV_FORMAT_INT64, &layer), "Metal surface")
            for (name, value) in [("vo", "gpu-next"), ("gpu-api", "vulkan"), ("gpu-context", "moltenvk"), ("hwdec", "videotoolbox"), ("sub-auto", "no"), ("keep-open", "yes")] {
                try require(mpv_set_option_string(handle, name, value), name)
            }
            try require(mpv_initialize(handle), "MPV initialization")
            mpv = handle
        } catch {
            mpv_destroy(handle)
            throw error
        }
    }

    private func load(_ args: JSObject) throws {
        try ensureMpv()
        guard let url = args.getString("url"), !url.isEmpty else { throw failure("Missing media URL") }
        errorMessage = nil
        if let headers = args.getObject("headers"), !headers.isEmpty {
            let fields = headers.map { "\($0.key): \($0.value)" }.joined(separator: ",")
            check(mpv_set_property_string(mpv, "http-header-fields", fields))
        }
        command(["loadfile", url, "replace", "start=\(numberString(args, "startAtSec"))"])
        for item in args.getArray("subtitles") ?? [] {
            if let subtitle = item as? JSObject { addSubtitle(subtitle) }
        }
        view.isHidden = false
    }

    private func show(_ args: JSObject) {
        guard let webview, let parent = webview.superview else { return }
        let rect = CGRect(
            x: numberPoint(args, "x"), y: numberPoint(args, "y"),
            width: numberPoint(args, "width"), height: numberPoint(args, "height")
        )
        view.frame = webview.convert(rect, to: parent)
        view.isHidden = rect.isEmpty
    }

    private func addSubtitle(_ args: JSObject) {
        guard let url = args.getString("url") else { return }
        command(["sub-add", url, args.getBool("select") == true ? "select" : "auto", args.getString("title") ?? "", args.getString("lang") ?? ""])
    }

    private func setProperty(_ args: JSObject) {
        guard let name = args.getString("name"), let value = args.getValue("value") else { return }
        if let value = value as? Bool { setFlag(name, value) }
        else if let value = value as? NSNumber {
            var number = value.doubleValue
            mpv_set_property(mpv, name, MPV_FORMAT_DOUBLE, &number)
        } else {
            mpv_set_property_string(mpv, name, String(describing: value))
        }
    }

    private func snapshot() -> JSObject {
        let idle = flag("idle-active")
        let paused = flag("pause")
        var result: JSObject = [
            "status": idle ? "idle" : (paused ? "paused" : "playing"),
            "positionSec": double("time-pos"), "durationSec": double("duration"),
            "bufferedSec": double("demuxer-cache-duration"), "buffering": flag("paused-for-cache"),
            "volume": double("volume") / 100, "muted": flag("mute"), "rate": double("speed", fallback: 1),
            "audioTracks": tracks("audio"), "subtitleTracks": tracks("sub"),
            "chapters": [] as JSArray, "subDelaySec": double("sub-delay"), "audioDelaySec": double("audio-delay"),
            "subText": string("sub-text") ?? "", "subStartSec": double("sub-start"),
            "secondarySubText": string("secondary-sub-text") ?? "", "audioNormalize": false,
            "videoWidth": double("dwidth"), "videoHeight": double("dheight"),
            "hdrGamma": string("video-params/gamma") ?? ""
        ]
        if let errorMessage {
            result["errorMessage"] = errorMessage
            result["errorCode"] = "decode"
        } else {
            result["errorMessage"] = NSNull()
            result["errorCode"] = NSNull()
        }
        return result
    }

    private func tracks(_ wanted: String) -> JSArray {
        let count = Int(integer("track-list/count"))
        return (0..<count).compactMap { index -> JSValue? in
            let base = "track-list/\(index)/"
            guard string(base + "type") == wanted else { return nil }
            let id = string(base + "id") ?? "\(index)"
            let lang = string(base + "lang") ?? ""
            let title = string(base + "title") ?? lang
            return [
                "id": id, "label": title.isEmpty ? "\(wanted) \(id)" : title,
                "lang": lang, "kind": wanted == "audio" ? "audio" : "subtitle",
                "selected": flag(base + "selected")
            ] as JSObject
        }
    }

    private func command(_ values: [String]) {
        guard let mpv, !values.isEmpty else { return }
        var pointers: [UnsafePointer<CChar>?] = values.map { value in
            strdup(value).map { UnsafePointer($0) }
        }
        pointers.append(nil)
        defer { pointers.dropLast().forEach { if let pointer = $0 { free(UnsafeMutablePointer(mutating: pointer)) } } }
        let result = mpv_command(mpv, &pointers)
        if result < 0 { errorMessage = String(cString: mpv_error_string(result)) }
    }

    private func string(_ name: String) -> String? {
        guard let value = mpv_get_property_string(mpv, name) else { return nil }
        defer { mpv_free(value) }
        return String(cString: value)
    }

    private func double(_ name: String, fallback: Double = 0) -> Double {
        var value = fallback
        return mpv_get_property(mpv, name, MPV_FORMAT_DOUBLE, &value) < 0 ? fallback : value
    }

    private func integer(_ name: String) -> Int64 {
        var value: Int64 = 0
        return mpv_get_property(mpv, name, MPV_FORMAT_INT64, &value) < 0 ? 0 : value
    }

    private func flag(_ name: String) -> Bool {
        var value: Int32 = 0
        mpv_get_property(mpv, name, MPV_FORMAT_FLAG, &value)
        return value != 0
    }

    private func setFlag(_ name: String, _ value: Bool) {
        var flag: Int32 = value ? 1 : 0
        mpv_set_property(mpv, name, MPV_FORMAT_FLAG, &flag)
    }

    private func numberString(_ args: JSObject, _ key: String) -> String {
        String((args.getValue(key) as? NSNumber)?.doubleValue ?? 0)
    }

    private func numberPoint(_ args: JSObject, _ key: String) -> CGFloat {
        CGFloat((args.getValue(key) as? NSNumber)?.doubleValue ?? 0)
    }

    private func check(_ result: Int32) {
        if result < 0 { errorMessage = String(cString: mpv_error_string(result)) }
    }

    private func require(_ result: Int32, _ operation: String) throws {
        if result < 0 {
            throw failure("\(operation) failed: \(String(cString: mpv_error_string(result)))")
        }
    }

    private func failure(_ message: String) -> NSError {
        NSError(domain: "HarborMpv", code: 2, userInfo: [NSLocalizedDescriptionKey: message])
    }

    private func destroy() {
        command(["stop"])
        view.isHidden = true
    }
}

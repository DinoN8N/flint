import SwiftUI
import WebKit
import UIKit

/// Coquille FLINT : l'app web (flint-demo-eta) plein écran dans une WKWebView,
/// + le pont Bluetooth FlintTestBand (montres UTE / J-Style) branché dessus.
///
/// MODE NUIT : l'app garde la connexion montre en arrière-plan (UIBackgroundModes
/// bluetooth-central) et stocke NATIVEMENT chaque mesure (la WKWebView est suspendue
/// quand l'écran est verrouillé). Au retour au premier plan, tout est rejoué au web
/// via l'événement 'nightlog' → l'app calcule la nuit à partir des vraies mesures.
///
/// Natif → web : window.flintNative(type, data) pour chaque événement (hr, battery, steps…).
/// Web → natif : window.webkit.messageHandlers.flint.postMessage({cmd:"start"|"stop"|"connect"}).
final class ShellBridge: NSObject, WKScriptMessageHandler, WKNavigationDelegate, ObservableObject {
    let band = FlintTestBand()
    weak var webView: WKWebView?
    private var autoConnected = false
    private var pageReady = false

    // Journal de nuit natif : [[ts(s), bpm]] + derniers steps/kcal/dist/batterie.
    private var nightHR: [[Double]] = []
    private var lastSteps: Int?, lastKcal: Int?, lastDist: Int?, lastBattery: Int?
    private var lastHRAt: Date = .distantPast
    private var lastPokeAt: Date = .distantPast
    private var dirtyCount = 0

    override init() {
        super.init()
        restoreNight()
        band.onEvent = { [weak self] type, data in self?.handle(type: type, data: data) }
        band.onLog = { [weak self] line in self?.forward(type: "log", data: ["line": line]) }
        NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            self?.flushNight()
        }
    }

    private func handle(type: String, data: [String: Any]) {
        let now = Date()
        switch type {
        case "hr":
            if let bpm = data["hr"] as? Int, bpm > 25, bpm < 230 {
                nightHR.append([now.timeIntervalSince1970, Double(bpm)])
                lastHRAt = now
                dirtyCount += 1
                if dirtyCount >= 40 { persistNight() }   // sauvegarde périodique (survit à un kill)
            }
        case "steps": lastSteps = data["steps"] as? Int
        case "kcal": lastKcal = data["kcal"] as? Int
        case "distance": lastDist = data["distance"] as? Int
        case "battery": lastBattery = data["level"] as? Int
        case "status":
            if data["status"] as? String == "disconnected" {
                autoConnected = false        // la montre re-connectera au prochain passage du scan
            }
        case "deviceFound":
            if !autoConnected,
               let name = data["name"] as? String,
               let id = data["deviceId"] as? String,
               name.range(of: "ES100|J2208A2|JCV8B|JC ?Vital", options: [.regularExpression, .caseInsensitive]) != nil {
                autoConnected = true
                band.connect(id)
            }
        default: break
        }
        // Relance des flux si la FC s'est tue > 3 min (firmwares qui coupent la FC continue).
        if now.timeIntervalSince(lastHRAt) > 180, now.timeIntervalSince(lastPokeAt) > 180, autoConnected {
            lastPokeAt = now
            band.pokeJStyle()
        }
        forward(type: type, data: data)
    }

    // MARK: persistance native (la nuit, le web dort)

    private func persistNight() {
        dirtyCount = 0
        let cutoff = Date().timeIntervalSince1970 - 36 * 3600
        if nightHR.count > 40000 { nightHR = Array(nightHR.suffix(40000)) }
        nightHR.removeAll { $0[0] < cutoff }
        var payload: [String: Any] = ["hr": nightHR]
        if let s = lastSteps { payload["steps"] = s }
        if let k = lastKcal { payload["kcal"] = k }
        if let d = lastDist { payload["dist"] = d }
        if let b = lastBattery { payload["battery"] = b }
        UserDefaults.standard.set(try? JSONSerialization.data(withJSONObject: payload), forKey: "flint_nightlog")
    }

    private func restoreNight() {
        guard let raw = UserDefaults.standard.data(forKey: "flint_nightlog"),
              let obj = try? JSONSerialization.jsonObject(with: raw) as? [String: Any] else { return }
        nightHR = obj["hr"] as? [[Double]] ?? []
        lastSteps = obj["steps"] as? Int
        lastKcal = obj["kcal"] as? Int
        lastDist = obj["dist"] as? Int
        lastBattery = obj["battery"] as? Int
    }

    /// Rejoue le journal de nuit au web (au premier plan / après chargement de la page).
    private func flushNight() {
        guard pageReady, !nightHR.isEmpty else { return }
        persistNight()
        var payload: [String: Any] = ["hr": nightHR]
        if let s = lastSteps { payload["steps"] = s }
        if let k = lastKcal { payload["kcal"] = k }
        if let d = lastDist { payload["dist"] = d }
        if let b = lastBattery { payload["battery"] = b }
        forward(type: "nightlog", data: payload, force: true)
    }

    /// Passe l'événement au web en base64 (sûr pour accents/quotes des logs).
    /// En arrière-plan la WKWebView est suspendue : on ne pousse qu'au premier plan.
    private func forward(type: String, data: [String: Any], force: Bool = false) {
        guard force || UIApplication.shared.applicationState == .active else { return }
        guard let web = webView,
              let json = try? JSONSerialization.data(withJSONObject: data) else { return }
        let b64 = json.base64EncodedString()
        let js = "window.flintNative&&window.flintNative('\(type)',JSON.parse(decodeURIComponent(escape(atob('\(b64)')))))"
        DispatchQueue.main.async { web.evaluateJavaScript(js, completionHandler: nil) }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        pageReady = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) { [weak self] in self?.flushNight() }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let cmd = body["cmd"] as? String else { return }
        switch cmd {
        case "start":
            autoConnected = false
            band.start()
        case "stop":
            band.stop()
        case "connect":
            if let id = body["deviceId"] as? String { band.connect(id) }
        case "nightack":
            break   // le web a intégré le journal ; on garde les 36 h glissantes côté natif
        default:
            break
        }
    }
}

struct WebShellView: UIViewRepresentable {
    let bridge: ShellBridge

    func makeUIView(context: Context) -> WKWebView {
        let cfg = WKWebViewConfiguration()
        cfg.allowsInlineMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = []
        cfg.userContentController.add(bridge, name: "flint")
        let web = WKWebView(frame: .zero, configuration: cfg)
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.scrollView.bounces = false
        web.allowsBackForwardNavigationGestures = false
        web.isOpaque = false
        web.backgroundColor = .white
        web.navigationDelegate = bridge
        bridge.webView = web
        web.load(URLRequest(url: URL(string: "https://flint-demo-eta.vercel.app")!))
        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

struct ContentView: View {
    @StateObject private var bridge = ShellBridge()

    var body: some View {
        WebShellView(bridge: bridge)
            .ignoresSafeArea()
            .statusBarHidden(false)
    }
}

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
        // v795 — le web affiche le compteur de crashs WebKit (Réglages) : on
        // pousse la vérité native à chaque chargement, y compris après un
        // rechargement post-crash.
        let d = UserDefaults.standard
        let kills = d.integer(forKey: "flintWKKills")
        let last = d.string(forKey: "flintWKLastKill") ?? ""
        // Repli imposé par le coupe-circuit : on force le thème le plus léger
        // avant que la page ne construise quoi que ce soit.
        let force = d.bool(forKey: "flintForceLight")
        if force { d.set(false, forKey: "flintForceLight") }
        let js = """
        try{localStorage.setItem('flWkKills','\(kills)');localStorage.setItem('flWkLast','\(last)');
        \(force ? "localStorage.setItem('flTheme','light');" : "")}catch(e){}
        """
        webView.evaluateJavaScript(js, completionHandler: nil)
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
        case "haptic":
            playHaptic(style: body["style"] as? String ?? "LIGHT")
        default:
            break
        }
    }

    // MARK: haptique native
    // Le web appelle haptic(), qui teste Capacitor.Plugins.Haptics en premier : on injecte
    // ce shim au chargement (voir WebShellView) et il retombe donc ici. navigator.vibrate
    // n'existe pas sur iOS — sans ça, aucun retour tactile dans toute l'app.
    private let lightGen = UIImpactFeedbackGenerator(style: .light)
    private let mediumGen = UIImpactFeedbackGenerator(style: .medium)
    private let heavyGen = UIImpactFeedbackGenerator(style: .heavy)

    private func playHaptic(style: String) {
        DispatchQueue.main.async {
            switch style.uppercased() {
            case "HEAVY": self.heavyGen.impactOccurred()
            case "MEDIUM": self.mediumGen.impactOccurred()
            default: self.lightGen.impactOccurred()
            }
        }
    }

    // MARK: crash du processus web (pression mémoire en navigation rapide) →
    // rechargement IMMÉDIAT au lieu d'un écran figé/blanc. C'est la cause du
    // « ça lague puis l'écran de démarrage revient » : WebKit tue son processus,
    // et sans ce handler l'app restait plantée jusqu'à une relance manuelle.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        // v791 — chaque mort du processus web est comptée et horodatée : permet de
        // distinguer un VRAI crash WebKit (visible ici) du voile de chargement web
        // (flPageLoader) quand le founder signale « l'app se recharge ».
        let d = UserDefaults.standard
        d.set(d.integer(forKey: "flintWKKills") + 1, forKey: "flintWKKills")
        d.set(Date().description, forKey: "flintWKLastKill")
        NSLog("FLINT WKWebContent TERMINATED — total: %d", d.integer(forKey: "flintWKKills"))
        pageReady = false

        // v832 — COUPE-CIRCUIT. Sans lui, une page qui meurt à l'init est
        // rechargée aussitôt, remeurt, et l'app boucle indéfiniment (constaté :
        // 3 morts en 15 s). Au 2ᵉ décès en moins de 45 s on repasse en thème
        // Clair — le mode le plus léger — avant de recharger, et on espace la
        // relance pour laisser le système respirer.
        let now = Date().timeIntervalSince1970
        let last = d.double(forKey: "flintWKLastKillTS")
        let rapid = (now - last) < 45
        d.set(now, forKey: "flintWKLastKillTS")

        if rapid {
            NSLog("FLINT — boucle de crash détectée : repli sur le thème Clair")
            d.set(true, forKey: "flintForceLight")
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + (rapid ? 1.5 : 0)) {
            webView.reload()
        }
    }

    // MARK: échec de chargement → message natif au lieu d'une page blanche
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showLoadError(in: webView)
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        showLoadError(in: webView)
    }
    private func showLoadError(in webView: WKWebView) {
        let html = """
        <html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head>
        <body style="margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;
        font-family:-apple-system,system-ui,sans-serif;background:#fbfbfa;color:#14110f;text-align:center;padding:32px">
        <div style="font-size:26px;font-weight:800;letter-spacing:-.02em">FLINT<span style="color:#fb6015">.</span></div>
        <p style="font-size:15px;font-weight:300;color:#8a8378;margin:14px 0 22px;line-height:1.5">
        L'application n'a pas pu se charger.<br>Relance-la, ça devrait repartir.</p>
        </body></html>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }
}

struct WebShellView: UIViewRepresentable {
    let bridge: ShellBridge

    func makeUIView(context: Context) -> WKWebView {
        let cfg = WKWebViewConfiguration()
        cfg.allowsInlineMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = []
        cfg.userContentController.add(bridge, name: "flint")

        // Shim Capacitor : le haptic() du web teste Capacitor.Plugins.Haptics en premier,
        // donc en le fournissant ici on obtient un vrai retour tactile natif partout,
        // sans modifier une seule ligne de l'app web.
        // Jeu de démonstration : 40 jours de données variées (nuits, séances,
        // repas, journal) avec des trous quand la montre n'est pas portée.
        // Mettre à false pour retrouver l'app avec les seules données réelles.
        let demoData = true
        if demoData {
            cfg.userContentController.addUserScript(WKUserScript(
                source: "try{localStorage.setItem('flintDemoData','1')}catch(e){}",
                injectionTime: .atDocumentStart, forMainFrameOnly: true))
        } else {
            cfg.userContentController.addUserScript(WKUserScript(
                source: "try{localStorage.setItem('flintDemoData','0')}catch(e){}",
                injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }

        let shim = """
        window.Capacitor = window.Capacitor || {};
        window.Capacitor.Plugins = window.Capacitor.Plugins || {};
        window.Capacitor.Plugins.Haptics = {
          impact: function(o){ try{ window.webkit.messageHandlers.flint.postMessage(
            {cmd:'haptic', style:(o&&o.style)||'LIGHT'}); }catch(e){} return Promise.resolve(); }
        };
        """
        cfg.userContentController.addUserScript(
            WKUserScript(source: shim, injectionTime: .atDocumentStart, forMainFrameOnly: true))

        // Servir l'app via un scheme perso : indispensable pour que index.html puisse
        // accéder au document de l'iframe (tous nos injecteurs en dépendent). Voir
        // WebSchemeHandler pour le détail — en file:// l'accès cross-frame est bloqué.
        cfg.setURLSchemeHandler(WebSchemeHandler(root: WebRoot.prepare()),
                                forURLScheme: WebSchemeHandler.scheme)

        let web = WKWebView(frame: .zero, configuration: cfg)
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.scrollView.bounces = false
        web.allowsBackForwardNavigationGestures = false
        web.isOpaque = false
        // Blanc pur : même couleur que l'écran de lancement natif ET que le splash web
        // (#flSplash). Les trois se succèdent sans le moindre changement de teinte.
        web.backgroundColor = .white
        web.navigationDelegate = bridge
        bridge.webView = web

        // App web EMBARQUÉE : démarrage instantané, aucun écran blanc, marche hors ligne.
        web.load(URLRequest(url: WebSchemeHandler.startURL(root: WebRoot.prepare())))
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
            .onAppear {
                // Mise à jour silencieuse : on télécharge la version en ligne si elle est
                // plus récente ; elle sera active au prochain lancement (jamais de
                // rechargement pendant l'utilisation).
                WebRoot.checkForUpdate()
            }
    }
}

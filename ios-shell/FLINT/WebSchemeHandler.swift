import Foundation
import WebKit

/// Sert l'app web embarquée via un scheme personnalisé (`flintapp://localhost/...`).
///
/// POURQUOI PAS `file://` : toute l'app repose sur des injecteurs qui, depuis `index.html`,
/// manipulent le document de l'iframe `flint-today.html` (trio d'accueil, thème violet du
/// sommeil, cartes hebdo, effets de zones…). En `file://`, WKWebView donne à chaque document
/// une origine UNIQUE : `iframe.contentDocument` renvoie null et **tous les injecteurs
/// meurent silencieusement** (l'app s'affiche, mais brute, sans aucune de nos surcouches).
///
/// Avec un scheme personnalisé, parent et iframe partagent la même origine
/// (`flintapp://localhost`) : l'accès cross-frame fonctionne, comme en HTTPS. C'est
/// exactement l'approche de Capacitor (`capacitor://localhost`).
final class WebSchemeHandler: NSObject, WKURLSchemeHandler {

    static let scheme = "flintapp"
    static let host = "localhost"

    private let root: URL

    init(root: URL) {
        self.root = root.standardizedFileURL
        super.init()
    }

    static func startURL(root: URL) -> URL {
        URL(string: "\(scheme)://\(host)/index.html")!
    }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else {
            task.didFailWithError(URLError(.badURL)); return
        }

        // On ignore la query (`?v=23`) et le fragment : ce sont des cache-busters côté web.
        var rel = url.path
        if rel.isEmpty || rel == "/" { rel = "/index.html" }
        let decoded = rel.removingPercentEncoding ?? rel
        let fileURL = root.appendingPathComponent(String(decoded.dropFirst())).standardizedFileURL

        // Garde-fou : jamais servir hors de la racine web.
        guard fileURL.path.hasPrefix(root.path) else {
            task.didFailWithError(URLError(.noPermissionsToReadFile)); return
        }
        guard let data = try? Data(contentsOf: fileURL) else {
            let resp = HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: nil)!
            task.didReceive(resp); task.didReceive(Data()); task.didFinish(); return
        }

        let headers = [
            "Content-Type": Self.mime(for: fileURL.pathExtension),
            "Content-Length": String(data.count),
            // Même origine → pas de CORS à gérer, mais on reste explicite.
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache"
        ]
        let resp = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!
        task.didReceive(resp)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}

    private static func mime(for ext: String) -> String {
        switch ext.lowercased() {
        case "html", "htm": return "text/html; charset=utf-8"
        case "js", "mjs":   return "text/javascript; charset=utf-8"
        case "css":         return "text/css; charset=utf-8"
        case "json":        return "application/json; charset=utf-8"
        case "png":         return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "gif":         return "image/gif"
        case "svg":         return "image/svg+xml"
        case "webp":        return "image/webp"
        case "ico":         return "image/x-icon"
        case "woff2":       return "font/woff2"
        case "woff":        return "font/woff"
        case "ttf":         return "font/ttf"
        case "otf":         return "font/otf"
        case "mp4":         return "video/mp4"
        default:            return "application/octet-stream"
        }
    }
}

import Foundation

/// Racine web servie par l'app.
///
/// L'app web est EMBARQUÉE dans le bundle (démarrage instantané, marche hors ligne).
/// Au premier lancement — ou après une mise à jour de l'app — le dossier `web/` du bundle
/// est copié dans Application Support, et c'est cette copie qui est servie. Ça permet à
/// l'updater d'écrire par-dessus (le bundle, lui, est en lecture seule).
///
/// Mise à jour auto : au lancement, on lit `sw.js` en ligne pour en extraire la version
/// (`flint-vNNN`). Si elle est plus récente que la version installée, on télécharge les
/// fichiers qui changent à chaque déploiement, on les écrit de façon atomique, et la
/// nouvelle version est active **au prochain lancement** (jamais de rechargement brutal
/// pendant que le founder utilise l'app).
enum WebRoot {

    static let remoteBase = URL(string: "https://flint-demo-eta.vercel.app")!

    /// Fichiers réécrits à chaque déploiement. Les images/polices ne changent qu'avec
    /// une nouvelle version de l'app (elles restent servies depuis la copie installée).
    static let updatableFiles = ["index.html", "flint-today.html", "sw.js"]

    // MARK: emplacements

    static var installedDir: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("web", isDirectory: true)
    }

    static var bundledDir: URL? {
        Bundle.main.url(forResource: "web", withExtension: nil)
    }

    // MARK: versions

    static func parseVersion(_ text: String) -> Int {
        guard let r = text.range(of: "flint-v[0-9]+", options: .regularExpression) else { return 0 }
        return Int(text[r].dropFirst("flint-v".count)) ?? 0
    }

    static func version(at dir: URL) -> Int {
        guard let s = try? String(contentsOf: dir.appendingPathComponent("sw.js"), encoding: .utf8) else { return 0 }
        return parseVersion(s)
    }

    // MARK: préparation

    /// Renvoie le dossier à servir, en le (re)semant depuis le bundle si nécessaire.
    /// Si quoi que ce soit échoue, on retombe sur le dossier du bundle : l'app démarre toujours.
    @discardableResult
    static func prepare() -> URL {
        let fm = FileManager.default
        guard let bundled = bundledDir else { return installedDir }
        let installed = installedDir
        let indexOK = fm.fileExists(atPath: installed.appendingPathComponent("index.html").path)
        let needsSeed = !indexOK || version(at: installed) < version(at: bundled)

        if needsSeed {
            try? fm.removeItem(at: installed)
            try? fm.createDirectory(at: installed.deletingLastPathComponent(),
                                    withIntermediateDirectories: true)
            do { try fm.copyItem(at: bundled, to: installed) }
            catch { return bundled }   // copie impossible → on sert le bundle en lecture seule
        }
        return fm.fileExists(atPath: installed.appendingPathComponent("index.html").path) ? installed : bundled
    }

    // MARK: mise à jour

    /// Va voir en ligne s'il existe une version plus récente et la télécharge.
    /// `done` reçoit la version téléchargée (0 si rien à faire) — active au prochain lancement.
    static func checkForUpdate(done: ((Int) -> Void)? = nil) {
        let localVersion = version(at: installedDir)
        var req = URLRequest(url: remoteBase.appendingPathComponent("sw.js"))
        req.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        req.timeoutInterval = 12

        URLSession.shared.dataTask(with: req) { data, _, _ in
            guard let data, let text = String(data: data, encoding: .utf8) else { done?(0); return }
            let remoteVersion = parseVersion(text)
            guard remoteVersion > localVersion else { done?(0); return }
            download(version: remoteVersion, done: done)
        }.resume()
    }

    /// Télécharge d'abord TOUS les fichiers en mémoire ; on n'écrit que si tout est arrivé
    /// (sinon une coupure réseau laisserait un index.html sans son flint-today.html).
    private static func download(version remoteVersion: Int, done: ((Int) -> Void)?) {
        let group = DispatchGroup()
        var fetched: [String: Data] = [:]
        var failed = false
        let lock = NSLock()

        for name in updatableFiles {
            group.enter()
            var req = URLRequest(url: remoteBase.appendingPathComponent(name))
            req.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
            req.timeoutInterval = 30
            URLSession.shared.dataTask(with: req) { data, resp, _ in
                defer { group.leave() }
                let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
                guard let data, !data.isEmpty, code == 200 else { lock.lock(); failed = true; lock.unlock(); return }
                lock.lock(); fetched[name] = data; lock.unlock()
            }.resume()
        }

        group.notify(queue: .global(qos: .utility)) {
            guard !failed, fetched.count == updatableFiles.count else { done?(0); return }
            let dir = installedDir
            guard FileManager.default.fileExists(atPath: dir.path) else { done?(0); return }
            for (name, data) in fetched {
                do { try data.write(to: dir.appendingPathComponent(name), options: .atomic) }
                catch { done?(0); return }
            }
            done?(remoteVersion)
        }
    }
}

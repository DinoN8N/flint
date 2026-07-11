import Foundation
import CoreBluetooth

/// Pont CoreBluetooth AUTONOME pour TestUltime : un seul fichier, aucune dépendance.
///
/// Deux missions :
///  1. Identifier la famille SDK de n'importe quelle montre BLE via son GATT
///     (lignes 🔬 = dump des caractéristiques, ligne 🧬 = verdict de famille).
///     Familles connues :
///       55FF / 56FF          = UTE / GloryFit (ES100)
///       FFF0 (FFF6 / FFF7)   = J-Style / Youhong (JC Vital V8 « JCV8B », Essential « J2208A2 »)
///       FFD0 ou préfixe 6E40 = Oudmon / QWatchPro
///       FEE7                 = Veepoo / HBand (données fermées, écartée)
///       sinon                = inconnue (le dump GATT est alors LE résultat)
///  2. Parler le protocole UTE complet à l'ES100 (témoin que l'app marche) :
///       activer FC continue : 01 E1 AB 02 01 01
///       activer FC auto     : 01 E1 AB 01 01 01
///       commande segmentée  : trame section 0 puis trame FD avec CRC = XOR des octets
///       mode workout        : cmdHead 0x01E5 / flag 0xABAB (force la FC temps réel)
///       report temps réel   : header 0x01E8 / flag 0xAC02, TLV (tag 2 = FC,
///                             tag 4 = pas, tag 7 = distance, tag 8 = calories)
///       batterie            : header 0x01A4 / flag 0xAC01, TLV tag 1 = %
///  3. Parler le protocole J-Style aux JC Vital (dump GATT réel du 10 juillet 2026) :
///       trames de 16 octets [cmd][payload 14 octets][checksum = somme des 15
///       premiers octets & 0xFF], écrites sur FFF6, réponses sur FFF7 :
///       FC temps réel ON : cmd 0x28 payload 02 01 00
///                          (réponse 0x28 : type à l'octet 1, bpm à l'octet 2)
///       pas / calories   : cmd 0x09 payload 01 00 (réponse 0x09 : pas = octets
///                          1..4 little-endian, calories/100 = octets 5..8)
///       batterie         : cmd 0x13 payload vide (réponse 0x13 : % à l'octet 1)
/// Aucune donnée n'est inventée : on n'émet que ce que le bracelet envoie.
final class FlintTestBand: NSObject {

    /// Journal texte : chaque ligne est affichée dans l'app (à copier pour Félix).
    var onLog: (String) -> Void = { _ in }
    /// Événements structurés : deviceFound, status, family, hr, steps, distance,
    /// kcal, battery, spo2, hrhistory, rr, error.
    var onEvent: (String, [String: Any]) -> Void = { _, _ in }

    // UUID exacts du SDK UTE (UUIDUtils).
    private let svc55 = CBUUID(string: "55FF")
    private let svc56 = CBUUID(string: "56FF")
    private let write55 = CBUUID(string: "35F1")
    private let notify55 = CBUUID(string: "35F2")
    private let write56 = CBUUID(string: "34F1")
    private let notify56 = CBUUID(string: "34F2")

    // UUID J-Style / Youhong (JC Vital V8 et Essential, dump GATT du 10 juillet 2026).
    private let svcFFF0 = CBUUID(string: "FFF0")
    private let jWrite = CBUUID(string: "FFF6")
    private let jNotify = CBUUID(string: "FFF7")

    private var central: CBCentralManager?
    private var peripheral: CBPeripheral?
    private var writeChar: CBCharacteristic?
    private var found: [String: CBPeripheral] = [:]
    private var connecting = false
    private var wantScan = false
    private var gotData = false
    private var streamReady = false
    private var enableSent = false
    private var family = "inconnue"           // verdict du classifieur pour la montre connectée
    private var scanLogSeen = Set<String>()   // pour ne loguer chaque appareil qu'une fois

    // MARK: API appelée depuis la vue

    /// Lance le scan BLE. Le CBCentralManager est créé ici (et pas au lancement
    /// de l'app) pour que la demande d'autorisation Bluetooth arrive au bon moment.
    func start() {
        if central == nil {
            central = CBCentralManager(delegate: self, queue: .main)
        }
        if streamReady { log("déjà en streaming, scan ignoré"); return }
        if connecting { return }
        found.removeAll()
        scanLogSeen.removeAll()
        gotData = false
        family = "inconnue"
        emit("status", ["status": "scanning"])
        wantScan = true
        if central?.state == .poweredOn { beginScan() }
        else { log("attente Bluetooth prêt (état \(central?.state.rawValue ?? -1))") }
    }

    /// Arrête tout : scan et connexion en cours.
    func stop() {
        wantScan = false
        // Sur une J-Style : coupe la FC temps réel et le flux de pas avant de fermer.
        if family == "jstyle", let p = peripheral, let ch = writeChar {
            let type: CBCharacteristicWriteType = ch.properties.contains(.writeWithoutResponse) ? .withoutResponse : .withResponse
            p.writeValue(Data(jPacket(0x28, [0x02, 0x00, 0x00])), for: ch, type: type)
            p.writeValue(Data(jPacket(0x09, [0x00, 0x00])), for: ch, type: type)
        }
        connecting = false
        streamReady = false
        enableSent = false
        writeChar = nil
        if central?.state == .poweredOn { central?.stopScan() }
        if let p = peripheral { central?.cancelPeripheralConnection(p) }
        peripheral = nil
        log("scan/mesure arrêtés")
        emit("status", ["status": "stopped"])
    }

    /// Connexion à un appareil de la liste (tap dans l'interface).
    func connect(_ deviceId: String) {
        guard let p = found[deviceId] else { log("appareil inconnu: \(deviceId)"); return }
        connectTo(p)
    }

    // MARK: Scan et connexion

    private func beginScan() {
        guard let central = central else { return }
        // 1) Périphérique UTE déjà connecté au système (cas rapide).
        let known = central.retrieveConnectedPeripherals(withServices: [svc55, svc56])
        if let p = known.first {
            let nm = p.name ?? "Bracelet"
            log("déjà connecté (système): \(nm)")
            found[p.identifier.uuidString] = p
            emit("deviceFound", ["deviceId": p.identifier.uuidString, "name": nm, "rssi": 0])
            connectTo(p)
            return
        }
        // 2) Sinon SCAN complet : on écoute tout le voisinage BLE.
        log("scan BLE démarré, approche ta montre du téléphone...")
        central.scanForPeripherals(withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
    }

    private func connectTo(_ p: CBPeripheral) {
        guard !connecting, let central = central else { return }
        connecting = true
        central.stopScan()
        peripheral = p
        p.delegate = self
        let nm = p.name ?? "Bracelet"
        emit("status", ["status": "connecting", "device": nm])
        log("connexion à \(nm)...")
        central.connect(p, options: nil)
        let target = p
        DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self] in
            guard let self = self, self.connecting, self.peripheral === target else { return }
            self.log("connexion bloquée 8 s, annulation puis reprise du scan")
            self.central?.cancelPeripheralConnection(target)
            self.connecting = false
            self.peripheral = nil
            if self.wantScan {
                self.central?.scanForPeripherals(withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
            }
        }
    }

    // MARK: Trames d'activation UTE

    private func enableFrames() -> [[UInt8]] {
        // Active la mesure FC + déclenche une mesure active immédiate (AB 0A),
        // seule commande qui force le bracelet à mesurer tout de suite.
        return [
            [0x01, 0xE1, 0xAB, 0x02, 0x01, 0x01],   // FC continue ON
            [0x01, 0xE1, 0xAB, 0x01, 0x01, 0x01],   // FC auto ON
            [0x01, 0xE1, 0xAB, 0x0A, 0x01, 0x01],   // état mesure FC repos = mesurer maintenant
            [0x01, 0xE1, 0xAB, 0x09, 0x01, 0x01]    // type mesure FC repos = actif
        ]
    }

    private func sendEnable() {
        guard let p = peripheral, let ch = writeChar, !enableSent else { return }
        enableSent = true
        let type: CBCharacteristicWriteType = ch.properties.contains(.write) ? .withResponse : .withoutResponse
        for f in enableFrames() {
            p.writeValue(Data(f), for: ch, type: type)
        }
        log("trames d'activation + mesure FC envoyées (\(enableFrames().count)) sur \(ch.uuid.uuidString)")
        // Force un report FC toutes les minutes (commande segmentée).
        setHeartRateInterval1min()
        // FC temps réel garantie via le mode workout.
        startWorkoutForRealtimeHR()
        // Relance la mesure active toutes les 20 s tant qu'on n'a rien reçu.
        scheduleMeasurePoke()
        DispatchQueue.main.asyncAfter(deadline: .now() + 35) { [weak self] in
            guard let self = self, !self.gotData else { return }
            self.log("⚠️ connecté et activé, mais aucune mesure reçue en 35 s. Vérifie que la montre est bien au poignet (capteur optique).")
            self.emit("status", ["status": "silent"])
        }
    }

    /// Émet une commande segmentée façon SDK UTE : trame section 0 puis trame FD
    /// (0xFD + CRC = XOR de tous les octets envoyés). Utilisé pour régler
    /// l'intervalle de report FC et pour le mode workout.
    private func sendSegmented(cmdHead: Int, flag: Int, payload: [UInt8]) {
        guard let p = peripheral, let ch = writeChar else { return }
        let type: CBCharacteristicWriteType = ch.properties.contains(.write) ? .withResponse : .withoutResponse
        var frame: [UInt8] = [
            UInt8((cmdHead >> 8) & 0xFF), UInt8(cmdHead & 0xFF),
            UInt8((flag >> 8) & 0xFF), UInt8(flag & 0xFF),
            0x00
        ]
        frame.append(contentsOf: payload)
        var crc: UInt8 = 0
        for b in frame { crc ^= b }
        let fd: [UInt8] = [
            UInt8((cmdHead >> 8) & 0xFF), UInt8(cmdHead & 0xFF),
            UInt8((flag >> 8) & 0xFF), UInt8(flag & 0xFF),
            0xFD, crc
        ]
        p.writeValue(Data(frame), for: ch, type: type)
        p.writeValue(Data(fd), for: ch, type: type)
        log("cmd segmentée \(String(format: "%04X", cmdHead))/\(String(format: "%04X", flag)) envoyée")
    }

    /// Règle l'intervalle de report FC à 1 minute (enable + interval), cmdHead 0x01E1,
    /// flag 0xABAB, payload TLV AB0201<01> AB0B01<01>.
    private func setHeartRateInterval1min() {
        sendSegmented(cmdHead: 0x01E1, flag: 0xABAB,
                      payload: [0xAB, 0x02, 0x01, 0x01, 0xAB, 0x0B, 0x01, 0x01])
    }

    /// Démarre un workout (cmd 0x01E5) puis ouvre le report temps réel
    /// (01 E8 AB 02 01 01). Le bracelet se met alors à pousser la FC live.
    private func startWorkoutForRealtimeHR() {
        let now = UInt32(Date().timeIntervalSince1970)
        func be(_ v: UInt32) -> [UInt8] { [UInt8(v >> 24 & 0xFF), UInt8(v >> 16 & 0xFF), UInt8(v >> 8 & 0xFF), UInt8(v & 0xFF)] }
        var p: [UInt8] = []
        p += [0xAB, 0x02, 0x01, 0x01]                    // operatorType = START
        p += [0xAB, 0x03, 0x01, 0x01]                    // sportType
        p += [0xAB, 0x04, 0x04] + be(now)                // planStartDate
        p += [0xAB, 0x05, 0x01, 0x08]                    // workoutType = marche (indoor)
        p += [0xAB, 0x06, 0x04] + be(now)                // operationTime
        p += [0xAB, 0x07, 0x0F, 0x01, 0x03, 0, 0, 0, 0x02, 0x03, 0, 0, 0, 0x03, 0x03, 0, 0, 0]  // dist/cal/durée = 0
        p += [0xAB, 0x08, 0x01, 0x01]                    // version
        p += [0xAB, 0x09, 0x04] + be(now)                // startTime
        p += [0xAB, 0x0A, 0x01, 0x00]                    // runCourseVersion
        p += [0xAB, 0x0B, 0x01, 0x00]                    // forbidPause
        sendSegmented(cmdHead: 0x01E5, flag: 0xABAB, payload: p)
        // Ouvre le report d'opérateur workout (trame simple).
        if let pr = peripheral, let ch = writeChar {
            let type: CBCharacteristicWriteType = ch.properties.contains(.write) ? .withResponse : .withoutResponse
            pr.writeValue(Data([0x01, 0xE8, 0xAB, 0x02, 0x01, 0x01]), for: ch, type: type)
        }
        log("workout démarré + report temps réel ouvert")
    }

    private func scheduleMeasurePoke() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 20) { [weak self] in
            guard let self = self, !self.gotData, let p = self.peripheral, let ch = self.writeChar else { return }
            let type: CBCharacteristicWriteType = ch.properties.contains(.write) ? .withResponse : .withoutResponse
            p.writeValue(Data([0x01, 0xE1, 0xAB, 0x0A, 0x01, 0x01]), for: ch, type: type)
            self.log("relance mesure active FC")
            self.scheduleMeasurePoke()
        }
    }

    // MARK: Protocole J-Style (JC Vital V8 / Essential)

    /// Trame J-Style : 16 octets [cmd][payload 14 octets][checksum = somme des
    /// 15 premiers octets & 0xFF], écrite sur FFF6, réponse sur FFF7.
    private func jPacket(_ cmd: UInt8, _ payload: [UInt8]) -> [UInt8] {
        var p = [UInt8](repeating: 0, count: 16)
        p[0] = cmd
        for (i, b) in payload.prefix(14).enumerated() { p[1 + i] = b }
        var sum = 0
        for i in 0..<15 { sum += Int(p[i]) }
        p[15] = UInt8(sum & 0xFF)
        return p
    }

    private func jSend(_ cmd: UInt8, _ payload: [UInt8], note: String) {
        guard let p = peripheral, let ch = writeChar else { return }
        let type: CBCharacteristicWriteType = ch.properties.contains(.writeWithoutResponse) ? .withoutResponse : .withResponse
        p.writeValue(Data(jPacket(cmd, payload)), for: ch, type: type)
        log("cmd J-Style 0x" + String(format: "%02X", cmd) + " envoyée (" + note + ")")
    }

    /// Démarre les flux temps réel J-Style : FC continue, pas/calories, batterie.
    private func sendJStyleEnable() {
        guard !enableSent else { return }
        enableSent = true
        jSend(0x28, [0x02, 0x01, 0x00], note: "FC temps réel ON")
        jSend(0x09, [0x01, 0x00], note: "flux pas/calories ON")
        jSend(0x13, [], note: "batterie")
        DispatchQueue.main.asyncAfter(deadline: .now() + 35) { [weak self] in
            guard let self = self, !self.gotData else { return }
            self.log("⚠️ connecté (J-Style) et activé, mais aucune mesure reçue en 35 s. Vérifie que la montre est bien au poignet (capteur optique).")
            self.emit("status", ["status": "silent"])
        }
    }

    /// (Coquille FLINT) Relance les flux temps réel J-Style si la montre s'est tue
    /// (certains firmwares coupent la FC continue après quelques minutes).
    /// N'envoie que les commandes déjà validées sur la montre : 0x28 / 0x09 / 0x13.
    func pokeJStyle() {
        guard family == "jstyle", writeChar != nil else { return }
        jSend(0x28, [0x02, 0x01, 0x00], note: "FC temps réel ON (relance)")
        jSend(0x09, [0x01, 0x00], note: "flux pas/calories ON (relance)")
        jSend(0x13, [], note: "batterie (relance)")
    }

    /// Décodage des réponses J-Style (notifications FFF7).
    private func handleJStyleFrame(_ d: [UInt8]) {
        guard !d.isEmpty else { return }
        switch d[0] {
        case 0x28:  // mesure santé temps réel : type à l'octet 1, bpm à l'octet 2
            guard d.count >= 3 else { return }
            let type = d[1]
            let bpm = Int(d[2])
            if type == 0x01 || type == 0x02 || type == 0x03 {
                if bpm > 25 && bpm < 240 {
                    gotData = true
                    emit("hr", ["hr": bpm])
                }
            }
            if type == 0x03 && d.count >= 4 {
                let spo2 = Int(d[3])
                if spo2 > 50 && spo2 <= 100 { emit("spo2", ["spo2": spo2]) }
            }
        case 0x09:  // pas / calories / distance temps réel (little-endian)
            guard d.count >= 16 else { return }
            let steps = Int(d[1]) | Int(d[2]) << 8 | Int(d[3]) << 16 | Int(d[4]) << 24
            let kcal = (Int(d[5]) | Int(d[6]) << 8 | Int(d[7]) << 16 | Int(d[8]) << 24) / 100
            let dist = (Int(d[9]) | Int(d[10]) << 8 | Int(d[11]) << 16 | Int(d[12]) << 24) * 10  // km/100 -> m
            if steps >= 0 && steps < 200000 { gotData = true; emit("steps", ["steps": steps]) }
            if kcal >= 0 && kcal < 20000 { emit("kcal", ["kcal": kcal]) }
            if dist >= 0 && dist < 1000000 { emit("distance", ["distance": dist]) }
        case 0x13:  // batterie : % à l'octet 1
            guard d.count >= 2 else { return }
            let pct = Int(d[1])
            if pct > 0 && pct <= 100 {
                log("batterie: \(pct)%")
                emit("battery", ["level": pct])
            }
        default:
            break   // trame déjà tracée en hexadécimal dans didUpdateValueFor
        }
    }

    // MARK: Décodage des reports entrants

    // Réassemblage du report temps réel workout (header 0x01E8, flag 0xAC02).
    private var rtBuf: [UInt8] = []
    private func handleWorkoutRealtime(_ b: [UInt8]) {
        guard b.count >= 5 else { return }
        let section = b[4]
        if section == 0xFD {
            // Fin : le buffer contient des TLV [tag][len][valeur]. tag 2 = FC.
            parseWorkoutTLV(rtBuf)
            rtBuf.removeAll()
        } else {
            rtBuf.append(contentsOf: b[5...])
        }
    }

    private func parseWorkoutTLV(_ d: [UInt8]) {
        var i = 0
        while i + 1 < d.count {
            let tag = d[i]; let len = Int(d[i + 1]); let vStart = i + 2
            if vStart + len > d.count { break }
            if tag == 0x02 && len >= 1 {              // fréquence cardiaque
                let bpm = Int(d[vStart])
                if bpm > 25 && bpm < 240 {
                    gotData = true
                    emit("hr", ["hr": bpm])
                }
            } else if tag == 0x04 && len >= 1 {       // pas cumulés
                var steps = 0
                for j in 0..<len { steps = (steps << 8) | Int(d[vStart + j]) }
                if steps >= 0 && steps < 200000 { emit("steps", ["steps": steps]) }
            } else if tag == 0x07 && len >= 1 {       // distance (mètres)
                var dist = 0
                for j in 0..<len { dist = (dist << 8) | Int(d[vStart + j]) }
                if dist >= 0 && dist < 1000000 { emit("distance", ["distance": dist]) }
            } else if tag == 0x08 && len >= 1 {       // calories cumulées calculées par le bracelet
                var kcal = 0
                for j in 0..<len { kcal = (kcal << 8) | Int(d[vStart + j]) }
                if kcal >= 0 && kcal < 200000 { emit("kcal", ["kcal": kcal]) }
            }
            i = vStart + len
        }
    }

    private func handleFrame(_ b: [UInt8]) {
        guard b.count >= 4 else { return }
        let header = (Int(b[0]) << 8) | Int(b[1])
        let flag = (Int(b[2]) << 8) | Int(b[3])
        if header == 0x01E8 && flag == 0xAC02 { handleWorkoutRealtime(b); return }  // report temps réel workout
        if header == 0x01A4 && flag == 0xAC01 {                                     // info appareil : TLV, tag 1 = batterie %
            var i = 5
            while i + 1 < b.count {
                let tag = b[i]; let len = Int(b[i + 1]); let v = i + 2
                if tag == 0x01 && len >= 1 && v < b.count {
                    let pct = Int(b[v])
                    if pct > 0 && pct <= 100 {
                        log("batterie: \(pct)%")
                        emit("battery", ["level": pct])
                    }
                }
                i = v + len
            }
            return
        }
        guard header == 0x01E1 else { return }        // famille fréquence cardiaque
        switch flag {
        case 0xAC03:                                   // report FC : [len][bpm,ts(4o)]* (historique auto-mesures)
            guard b.count >= 5 else { return }
            let len = Int(b[4])
            let count = len / 5
            var samples: [[Int]] = []
            for i in 0..<count {
                let base = 5 + i * 5
                if base + 4 < b.count {
                    let bpm = Int(b[base])
                    let ts = (Int(b[base+1]) << 24) | (Int(b[base+2]) << 16) | (Int(b[base+3]) << 8) | Int(b[base+4])
                    if bpm > 25 && bpm < 240 { samples.append([bpm, ts]) }
                }
            }
            if !samples.isEmpty {
                gotData = true
                log("historique FC: \(samples.count) mesures (dernière \(samples.last![0]) bpm)")
                emit("hrhistory", ["samples": samples])
                emit("hr", ["hr": samples.last![0]])
            }
        case 0xAC04:                                   // report RRI (intervalles RR)
            let hex = b.map { String(format: "%02x", $0) }.joined()
            log("⭐️ trame RRI reçue: \(hex)")
            let rr = decodeRRI(b)
            if !rr.isEmpty {
                gotData = true
                log("RRI: \(rr.count) intervalles décodés: \(rr.prefix(8))")
                emit("rr", ["rr": rr])
            }
        default:
            break
        }
    }

    /// Les intervalles RR sont des uint16 (ms) à partir de l'offset 5, payload = b[4].
    private func decodeRRI(_ b: [UInt8]) -> [Int] {
        guard b.count >= 6 else { return [] }
        let len = Int(b[4])
        var out: [Int] = []
        var i = 5
        while i + 1 < b.count && (i - 5) < len {
            let v = (Int(b[i]) << 8) | Int(b[i + 1])
            if v > 250 && v < 2500 { out.append(v) }   // plage physiologique
            i += 2
        }
        return out
    }

    // MARK: Sorties

    private func emit(_ type: String, _ data: [String: Any]) {
        DispatchQueue.main.async { self.onEvent(type, data) }
    }
    private func log(_ m: String) {
        DispatchQueue.main.async { self.onLog(m) }
    }
}

extension FlintTestBand: CBCentralManagerDelegate {
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        log("état Bluetooth: \(central.state.rawValue)")
        if central.state == .poweredOn && wantScan && peripheral == nil { beginScan() }
    }

    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
                        advertisementData: [String: Any], rssi RSSI: NSNumber) {
        let name = peripheral.name ?? (advertisementData[CBAdvertisementDataLocalNameKey] as? String) ?? ""
        // Journal d'identification : nom + services annoncés de TOUT appareil vu
        // (sert à reconnaître la famille de SDK d'une nouvelle montre).
        let advSvcs = (advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID])?.map { $0.uuidString } ?? []
        let idu = peripheral.identifier.uuidString
        if scanLogSeen.insert(idu).inserted {
            log("📡 vu: '\(name.isEmpty ? "(sans nom)" : name)' rssi=\(RSSI.intValue) services=[\(advSvcs.joined(separator: ","))]")
        }
        // On ne liste que les appareils nommés (bracelets), pas tout le voisinage BLE.
        guard !name.isEmpty else { return }
        if found[idu] == nil {
            found[idu] = peripheral
            emit("deviceFound", ["deviceId": idu, "name": name, "rssi": RSSI.intValue])
        }
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        connecting = false
        let nm = peripheral.name ?? "Bracelet"
        emit("status", ["status": "connected", "device": nm])
        // Découverte de TOUS les services (pas seulement UTE) : indispensable pour
        // identifier la famille d'une montre inconnue (Essential...) via son GATT.
        log("✅ connecté à \(nm), découverte de tous les services...")
        peripheral.discoverServices(nil)
    }

    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        connecting = false
        log("échec connexion: \(error?.localizedDescription ?? "?")")
        emit("error", ["message": "connexion échouée"])
    }

    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        connecting = false
        writeChar = nil
        enableSent = false
        streamReady = false
        family = "inconnue"
        self.peripheral = nil
        emit("status", ["status": "disconnected"])
        log("déconnecté")
        if wantScan { beginScan() }
    }
}

extension FlintTestBand: CBPeripheralDelegate {
    /// Classement de famille SDK par les services GATT :
    /// 55FF/56FF = UTE/GloryFit ; FFF0 = J-Style/Youhong (JC Vital) ;
    /// FFD0 ou préfixe 6E40 = Oudmon/QWatchPro ;
    /// FEE7 = Veepoo/HBand (données fermées, écartée) ; sinon inconnue.
    private func classifyFamily(_ ids: [String]) -> String {
        func has(_ short: String) -> Bool {
            ids.contains { $0 == short || $0.hasPrefix("0000" + short) }
        }
        if has("55FF") || has("56FF") { return "ute" }
        if has("FFF0") { return "jstyle" }
        if has("FFD0") || ids.contains(where: { $0.hasPrefix("6E40") }) { return "oudmon" }
        if has("FEE7") { return "veepoo" }
        return "inconnue"
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        let svcs = peripheral.services ?? []
        let ids = svcs.map { $0.uuid.uuidString.uppercased() }
        let nm = peripheral.name ?? "Bracelet"
        log("services de \(nm): [\(ids.joined(separator: ","))]")
        let family = classifyFamily(ids)
        self.family = family
        log("🧬 famille \(nm): \(family)")
        emit("family", ["family": family, "device": nm, "services": ids.joined(separator: ",")])
        if family == "jstyle" {
            log("→ famille J-Style/Youhong (JC Vital) : protocole 16 octets sur FFF6/FFF7")
        }
        if family == "oudmon" {
            log("→ famille Oudmon/QWatchPro : protocole non géré par ce banc de test, mais dump GATT quand même")
        }
        if family == "veepoo" {
            log("⚠️ famille Veepoo/HBand : données fermées (processed only), montre écartée")
        }
        if family == "inconnue" {
            log("❓ famille inconnue : le dump GATT complet ci-dessous est LE résultat à renvoyer")
        }
        // Dump GATT complet dans tous les cas (diagnostic), le protocole UTE ne
        // part que si la caractéristique d'écriture 35F1/34F1 existe.
        for s in svcs {
            peripheral.discoverCharacteristics(nil, for: s)
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        // Dump GATT d'identification : toutes les caractéristiques du service + leurs
        // propriétés (W=write, N=notify, R=read). Sert à reconnaître la famille SDK.
        let chs = (service.characteristics ?? []).map { c -> String in
            var p = ""
            if c.properties.contains(.write) || c.properties.contains(.writeWithoutResponse) { p += "W" }
            if c.properties.contains(.notify) { p += "N" }
            if c.properties.contains(.read) { p += "R" }
            return c.uuid.uuidString + "(" + p + ")"
        }.joined(separator: " ")
        log("🔬 GATT svc \(service.uuid.uuidString) -> \(chs)")
        for c in service.characteristics ?? [] {
            if c.uuid == notify55 || c.uuid == notify56 || c.uuid == jNotify {
                peripheral.setNotifyValue(true, for: c)
                log("abonnement notif \(c.uuid.uuidString)")
            }
            if c.uuid == write55 {
                writeChar = c
                log("caractéristique d'écriture prête \(c.uuid.uuidString)")
            } else if c.uuid == write56, writeChar == nil {
                writeChar = c
                log("caractéristique d'écriture (secours) \(c.uuid.uuidString)")
            } else if c.uuid == jWrite {
                writeChar = c
                log("caractéristique d'écriture J-Style prête FFF6")
            }
        }
        // Le protocole part selon la famille reconnue : UTE (35F1/34F1) ou J-Style (FFF6).
        if writeChar != nil {
            streamReady = true
            if family == "jstyle" { sendJStyleEnable() } else { sendEnable() }
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        guard let d = characteristic.value else { return }
        let hex = d.map { String(format: "%02x", $0) }.joined()
        log("notif \(characteristic.uuid.uuidString): \(hex)")   // trace toute trame entrante
        if characteristic.uuid == jNotify { handleJStyleFrame([UInt8](d)) }
        else { handleFrame([UInt8](d)) }
    }

    func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
        if let e = error { log("écriture \(characteristic.uuid.uuidString) ÉCHEC: \(e.localizedDescription)") }
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
        log("notif \(characteristic.uuid.uuidString) " + (characteristic.isNotifying ? "ACTIVE" : "inactive") + (error != nil ? " err" : ""))
    }
}

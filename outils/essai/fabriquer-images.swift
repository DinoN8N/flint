// Fabrique les trois images d'essai de `outils/essai-serveur.js`.
//
//   swift outils/essai/fabriquer-images.swift outils/essai
//
// Tout est DESSINÉ ici, par des formes et la police du système : aucune photo,
// aucun logo, aucune marque, rien d'internet. Les chiffres de l'étiquette et
// les plats de la carte sont recopiés dans `outils/essai-serveur.js`
// (ATTENDU_ETIQUETTE, ATTENDU_CARTE) : si on change l'un, on change l'autre.
import AppKit

let dossier = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "."

func dessiner(_ nom: String, _ l: Int, _ h: Int, _ corps: (CGContext) -> Void) {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: l, pixelsHigh: h, bitsPerSample: 8,
                               samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                               colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    let ctx = NSGraphicsContext(bitmapImageRep: rep)!
    NSGraphicsContext.current = ctx
    // Origine en haut à gauche, comme une photo.
    ctx.cgContext.translateBy(x: 0, y: CGFloat(h)); ctx.cgContext.scaleBy(x: 1, y: -1)
    corps(ctx.cgContext)
    NSGraphicsContext.restoreGraphicsState()
    let jpeg = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.82])!
    try! jpeg.write(to: URL(fileURLWithPath: dossier + "/" + nom))
    print("\(nom) : \(l)×\(h), \(jpeg.count) octets")
}

func texte(_ s: String, _ x: CGFloat, _ y: CGFloat, _ taille: CGFloat, gras: Bool = false, couleur: NSColor = .black) {
    let police = gras ? NSFont.boldSystemFont(ofSize: taille) : NSFont.systemFont(ofSize: taille)
    let a = NSAttributedString(string: s, attributes: [.font: police, .foregroundColor: couleur])
    // Le contexte est retourné : on dessine le texte dans un repère remis à l'endroit.
    let ctx = NSGraphicsContext.current!.cgContext
    ctx.saveGState()
    ctx.translateBy(x: x, y: y + taille); ctx.scaleBy(x: 1, y: -1)
    a.draw(at: .zero)
    ctx.restoreGState()
}

func couleur(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat) -> CGColor { CGColor(red: r / 255, green: g / 255, blue: b / 255, alpha: 1) }

// ① Un repas : sur une table en bois, une assiette avec deux œufs au plat, une
//    tranche de pain grillé et une poignée de tomates cerises.
dessiner("repas.jpg", 1024, 768) { c in
    c.setFillColor(couleur(150, 104, 62)); c.fill(CGRect(x: 0, y: 0, width: 1024, height: 768))
    for i in stride(from: 0, to: 768, by: 48) {           // veinage de la table
        c.setFillColor(couleur(135, 92, 54)); c.fill(CGRect(x: 0, y: CGFloat(i), width: 1024, height: 6))
    }
    c.setFillColor(couleur(70, 50, 30).copy(alpha: 0.35)!); c.fillEllipse(in: CGRect(x: 172, y: 104, width: 700, height: 600))
    c.setFillColor(couleur(246, 246, 242)); c.fillEllipse(in: CGRect(x: 160, y: 84, width: 700, height: 600))
    c.setFillColor(couleur(232, 232, 226)); c.fillEllipse(in: CGRect(x: 230, y: 154, width: 560, height: 460))
    for (x, y) in [(300.0, 220.0), (470.0, 300.0)] {      // les deux œufs
        c.setFillColor(couleur(253, 253, 250))
        c.fillEllipse(in: CGRect(x: x, y: y, width: 220, height: 170))
        c.fillEllipse(in: CGRect(x: x + 40, y: y - 30, width: 150, height: 120))
        c.setFillColor(couleur(245, 170, 20)); c.fillEllipse(in: CGRect(x: x + 70, y: y + 40, width: 80, height: 76))
        c.setFillColor(couleur(255, 214, 120)); c.fillEllipse(in: CGRect(x: x + 88, y: y + 52, width: 24, height: 20))
    }
    c.setFillColor(couleur(150, 90, 40))                   // le pain grillé (croûte)
    c.fill(CGRect(x: 560, y: 470, width: 200, height: 160))
    c.setFillColor(couleur(214, 160, 92)); c.fill(CGRect(x: 574, y: 484, width: 172, height: 132))
    for (x, y) in [(300.0, 470.0), (350.0, 500.0), (300.0, 530.0), (400.0, 470.0)] {   // tomates cerises
        c.setFillColor(couleur(210, 30, 30)); c.fillEllipse(in: CGRect(x: x, y: y, width: 56, height: 56))
        c.setFillColor(couleur(60, 140, 50)); c.fill(CGRect(x: x + 24, y: y + 2, width: 8, height: 10))
    }
}

// ② Une étiquette : le tableau des valeurs nutritionnelles d'un produit sans marque.
dessiner("etiquette.jpg", 900, 1000) { c in
    c.setFillColor(couleur(255, 255, 255)); c.fill(CGRect(x: 0, y: 0, width: 900, height: 1000))
    texte("MUESLI AUX FRUITS SECS", 60, 40, 44, gras: true)
    texte("Portion : 40 g", 60, 110, 30)
    c.setStrokeColor(couleur(0, 0, 0)); c.setLineWidth(4); c.stroke(CGRect(x: 50, y: 180, width: 800, height: 760))
    texte("VALEURS NUTRITIONNELLES", 75, 200, 36, gras: true)
    texte("pour 100 g", 620, 210, 30, gras: true)
    let lignes: [(String, String)] = [
        ("Énergie", "1571 kJ / 372 kcal"),
        ("Matières grasses", "6,2 g"),
        ("dont acides gras saturés", "1,1 g"),
        ("Glucides", "64 g"),
        ("dont sucres", "21 g"),
        ("Fibres alimentaires", "8,5 g"),
        ("Protéines", "9,8 g"),
        ("Sel", "0,12 g"),
    ]
    var y: CGFloat = 280
    for (nom, valeur) in lignes {
        c.setFillColor(couleur(0, 0, 0)); c.fill(CGRect(x: 50, y: y - 14, width: 800, height: 2))
        texte(nom, nom.hasPrefix("dont") ? 105 : 75, y, 32)
        texte(valeur, 540, y, 32)
        y += 80
    }
}

// ③ Une carte de restaurant (restaurant inventé), trois rubriques, six plats.
dessiner("carte.jpg", 900, 1200) { c in
    c.setFillColor(couleur(250, 244, 230)); c.fill(CGRect(x: 0, y: 0, width: 900, height: 1200))
    texte("Le Petit Essai", 270, 50, 56, gras: true)
    texte("ENTRÉES", 80, 190, 38, gras: true, couleur: NSColor(calibratedRed: 0.55, green: 0.1, blue: 0.1, alpha: 1))
    texte("Salade de chèvre chaud", 80, 250, 34); texte("9,50 €", 700, 250, 34)
    texte("Velouté de potiron", 80, 310, 34); texte("7,00 €", 700, 310, 34)
    texte("PLATS", 80, 430, 38, gras: true, couleur: NSColor(calibratedRed: 0.55, green: 0.1, blue: 0.1, alpha: 1))
    texte("Entrecôte, frites maison", 80, 490, 34); texte("22,00 €", 690, 490, 34)
    texte("Pavé de saumon, riz et brocolis", 80, 550, 34); texte("19,50 €", 690, 550, 34)
    texte("DESSERTS", 80, 670, 38, gras: true, couleur: NSColor(calibratedRed: 0.55, green: 0.1, blue: 0.1, alpha: 1))
    texte("Crème brûlée", 80, 730, 34); texte("7,50 €", 700, 730, 34)
    texte("Mousse au chocolat", 80, 790, 34); texte("6,50 €", 700, 790, 34)
}

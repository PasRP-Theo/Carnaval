import express from "express";
import multer from "multer";

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

let chars = [
  { id: 1, nom: "Char des Lions", description: "Le char officiel des Lions", statut: "actif", vitesse: 4, participants: 12, latitude: 50.4669, longitude: 4.8674, batterie: 87, gps_signal: true, updated_at: new Date(), historique: [] },
  { id: 2, nom: "Char des Aigles", description: "Char des jeunes du village", statut: "actif", vitesse: 3, participants: 8, latitude: 50.4655, longitude: 4.8650, batterie: 62, gps_signal: true, updated_at: new Date(), historique: [] },
  { id: 3, nom: "Char des Fous", description: "Le plus decore du carnaval !", statut: "arrete", vitesse: 0, participants: 15, latitude: 50.4640, longitude: 4.8630, batterie: 15, gps_signal: false, updated_at: new Date(), historique: [] },
];
let benevoles = [
  { id: 1, nom: "Marie Dupont", role: "Signaleur", zone: "Rue du Centre", present: true },
  { id: 2, nom: "Jean Martin", role: "Secours", zone: "Place du Marche", present: true },
];
let forains = [
  { id: 1, nom: "Manege Etoile", contact: "0470 12 34 56", emplacement: "Place A1", paye: true },
  { id: 2, nom: "Friterie Carnaval", contact: "0489 98 76 54", emplacement: "Place B3", paye: false },
];
let inscriptions = [];
let photos = [];
let votes = {};
let votedIPs = new Set();
let secuAlertes = [];
let secuPositions = [
  { id: 1, nom: "Poste Secours A", role: "Secours", latitude: 50.4680, longitude: 4.8690, actif: true },
  { id: 2, nom: "Signaleur Rue du Moulin", role: "Signaleur", latitude: 50.4645, longitude: 4.8655, actif: true },
];
const SECU_PASSWORD = process.env.SECU_PASSWORD || "secu2026";
const secuSessions = new Set();

function secuAuth(req, res, next) {
  const token = req.headers["x-secu-token"];
  if (!token || !secuSessions.has(token)) return res.status(401).json({ error: "Non autorise" });
  next();
}

// PUBLIC
router.get("/chars", (req, res) => {
  res.json(chars.map(({ latitude, longitude, historique, batterie, gps_signal, ...c }) => c));
});

router.get("/chars/positions", (req, res) => {
  res.json(chars);
});

router.post("/chars/:id/position", (req, res) => {
  const char = chars.find(c => c.id === parseInt(req.params.id));
  if (!char) return res.status(404).json({ error: "Char introuvable" });
  const { latitude, longitude, vitesse, batterie } = req.body;
  if (char.historique.length === 0 || char.latitude !== latitude || char.longitude !== longitude) {
    char.historique.push({ latitude: char.latitude, longitude: char.longitude });
    if (char.historique.length > 100) char.historique.shift();
  }
  char.latitude = latitude;
  char.longitude = longitude;
  if (vitesse !== undefined) char.vitesse = vitesse;
  if (batterie !== undefined) char.batterie = batterie;
  char.gps_signal = true;
  char.updated_at = new Date();
  res.json({ success: true });
});

router.post("/vote", (req, res) => {
  const ip = req.ip;
  if (votedIPs.has(ip)) return res.status(429).json({ error: "Vous avez deja vote." });
  const { char_id } = req.body;
  votes[char_id] = (votes[char_id] || 0) + 1;
  votedIPs.add(ip);
  res.json({ success: true, votes: votes[char_id] });
});

router.get("/votes", (req, res) => res.json(votes));

router.get("/photos", (req, res) => res.json(photos));
router.post("/photos", upload.single("photo"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Aucun fichier" });
  const photo = { id: Date.now(), url: `/uploads/${req.file.filename}`, created_at: new Date() };
  photos.push(photo);
  res.json(photo);
});

router.post("/inscriptions", (req, res) => {
  const inscription = { id: Date.now(), ...req.body, created_at: new Date() };
  inscriptions.push(inscription);
  res.status(201).json(inscription);
});

// ADMIN
router.get("/admin/stats", (req, res) => {
  res.json({
    chars_actifs: chars.filter(c => c.statut === "actif").length,
    chars_total: chars.length,
    benevoles: benevoles.length,
    forains: forains.length,
    alertes: secuAlertes.filter(a => !a.lu).length,
  });
});

router.get("/admin/benevoles", (req, res) => res.json(benevoles));
router.post("/admin/benevoles", (req, res) => {
  const b = { id: Date.now(), present: false, ...req.body };
  benevoles.push(b);
  res.status(201).json(b);
});
router.patch("/admin/benevoles/:id", (req, res) => {
  const b = benevoles.find(x => x.id === parseInt(req.params.id));
  if (!b) return res.status(404).json({ error: "Introuvable" });
  Object.assign(b, req.body);
  res.json(b);
});

router.get("/admin/forains", (req, res) => res.json(forains));
router.post("/admin/forains", (req, res) => {
  const f = { id: Date.now(), paye: false, ...req.body };
  forains.push(f);
  res.status(201).json(f);
});
router.patch("/admin/forains/:id", (req, res) => {
  const f = forains.find(x => x.id === parseInt(req.params.id));
  if (!f) return res.status(404).json({ error: "Introuvable" });
  Object.assign(f, req.body);
  res.json(f);
});

router.get("/admin/inscriptions", (req, res) => res.json(inscriptions));

// SECURITE
router.post("/secu/login", (req, res) => {
  if (req.body.password !== SECU_PASSWORD) return res.status(401).json({ error: "Mot de passe incorrect" });
  const token = `secu_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  secuSessions.add(token);
  res.json({ token });
});

router.get("/secu/positions", secuAuth, (req, res) => res.json(secuPositions));
router.post("/secu/positions/:id", secuAuth, (req, res) => {
  const p = secuPositions.find(x => x.id === parseInt(req.params.id));
  if (!p) return res.status(404).json({ error: "Introuvable" });
  Object.assign(p, req.body);
  res.json(p);
});

router.get("/secu/alertes", secuAuth, (req, res) => res.json(secuAlertes));
router.post("/secu/alertes", secuAuth, (req, res) => {
  const alerte = { id: Date.now(), lu: false, time: new Date().toLocaleTimeString(), ...req.body };
  secuAlertes.unshift(alerte);
  res.status(201).json(alerte);
});
router.patch("/secu/alertes/:id/lu", secuAuth, (req, res) => {
  const a = secuAlertes.find(x => x.id === parseInt(req.params.id));
  if (!a) return res.status(404).json({ error: "Introuvable" });
  a.lu = true;
  res.json(a);
});

export default router;
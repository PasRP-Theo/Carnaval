import { Router } from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";

import { query } from "./db.js";

const router    = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const JWT_SECRET    = process.env.JWT_SECRET    || "carnaval_rio_secret_2026_change_me";
const SECU_PASSWORD = process.env.SECU_PASSWORD || "secu2026";

// ═══════════════════════════════════════════════════════════
//  MIDDLEWARES AUTH
// ═══════════════════════════════════════════════════════════

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer "))
    return res.status(401).json({ error: "Token manquant" });
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Token invalide ou expiré" });
  }
}

function requireSecu(req, res, next) {
  const token = req.headers["x-secu-token"] || "";
  if (!token) return res.status(401).json({ error: "Token sécu manquant" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== "secu" && payload.role !== "admin")
      return res.status(403).json({ error: "Accès refusé" });
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Token sécu invalide ou expiré" });
  }
}

// ═══════════════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════════════

// POST /api/auth/login
router.post("/auth/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: "username et password requis" });
  try {
    const { rows } = await query(
      "SELECT * FROM users WHERE username = $1", [username]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: "Identifiants incorrects" });

    const ok = password === user.password;
    if (!ok) return res.status(401).json({ error: "Identifiants incorrects" });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, displayName: user.display_name },
      JWT_SECRET,
      { expiresIn: "8h" }
    );
    res.json({ token, role: user.role, displayName: user.display_name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/auth/me
router.get("/auth/me", requireAdmin, (req, res) => {
  res.json({ username: req.user.username, role: req.user.role, displayName: req.user.displayName });
});

router.post("/auth/logout", (_, res) => res.json({ ok: true }));

// PATCH /api/auth/password
router.patch("/auth/password", requireAdmin, async (req, res) => {
  const { current, newPassword } = req.body || {};
  try {
    const { rows } = await query("SELECT * FROM users WHERE id = $1", [req.user.id]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });

    const ok = current === user.password;
    if (!ok) return res.status(401).json({ error: "Mot de passe actuel incorrect" });

    const hashed = newPassword;
    await query("UPDATE users SET password = $1 WHERE id = $2", [hashed, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ═══════════════════════════════════════════════════════════
//  CHARS — PUBLIC
// ═══════════════════════════════════════════════════════════

router.get("/chars", async (_, res) => {
  try {
    const { rows } = await query(
      "SELECT id, nom, description, statut, vitesse, participants FROM chars ORDER BY id"
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/chars/positions", async (_, res) => {
  try {
    const { rows: chars } = await query("SELECT * FROM chars ORDER BY id");
    // Récupérer historique pour chaque char
    for (const char of chars) {
      const { rows: hist } = await query(
        "SELECT latitude, longitude FROM char_historique WHERE char_id = $1 ORDER BY recorded_at DESC LIMIT 50",
        [char.id]
      );
      char.historique = hist;
    }
    res.json(chars);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GPS update depuis module embarqué
router.post("/chars/:id/position", async (req, res) => {
  const id = parseInt(req.params.id);
  const { latitude, longitude, vitesse, batterie, gps_signal } = req.body;
  try {
    // Sauvegarder ancienne position dans historique
    const { rows } = await query("SELECT latitude, longitude FROM chars WHERE id = $1", [id]);
    if (!rows[0]) return res.status(404).json({ error: "Char introuvable" });

    if (rows[0].latitude && rows[0].longitude) {
      await query(
        "INSERT INTO char_historique (char_id, latitude, longitude) VALUES ($1, $2, $3)",
        [id, rows[0].latitude, rows[0].longitude]
      );
      // Garder max 50 points
      await query(
        "DELETE FROM char_historique WHERE char_id = $1 AND id NOT IN (SELECT id FROM char_historique WHERE char_id = $1 ORDER BY recorded_at DESC LIMIT 50)",
        [id]
      );
    }

    await query(
      `UPDATE chars SET
        latitude   = COALESCE($1, latitude),
        longitude  = COALESCE($2, longitude),
        vitesse    = COALESCE($3, vitesse),
        batterie   = COALESCE($4, batterie),
        gps_signal = COALESCE($5, gps_signal),
        updated_at = NOW()
       WHERE id = $6`,
      [latitude, longitude, vitesse, batterie, gps_signal, id]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
//  VOTES — PUBLIC
// ═══════════════════════════════════════════════════════════

router.post("/vote", async (req, res) => {
  const ip     = req.ip || req.socket?.remoteAddress || "unknown";
  const { char_id } = req.body;
  try {
    // Vérifier si déjà voté
    const { rows: already } = await query(
      "SELECT id FROM votes WHERE voter_ip = $1", [ip]
    );
    if (already.length > 0) return res.status(409).json({ error: "Déjà voté" });

    // Vérifier que le char existe
    const { rows: charRows } = await query("SELECT id FROM chars WHERE id = $1", [char_id]);
    if (!charRows[0]) return res.status(404).json({ error: "Char introuvable" });

    await query("INSERT INTO votes (char_id, voter_ip) VALUES ($1, $2)", [char_id, ip]);

    const { rows: countRows } = await query(
      "SELECT COUNT(*) FROM votes WHERE char_id = $1", [char_id]
    );
    res.json({ ok: true, votes: parseInt(countRows[0].count) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/votes", async (_, res) => {
  try {
    const { rows } = await query(
      "SELECT char_id, COUNT(*) AS count FROM votes GROUP BY char_id"
    );
    const result = {};
    rows.forEach(r => { result[r.char_id] = parseInt(r.count); });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
//  PHOTOS — PUBLIC
// ═══════════════════════════════════════════════════════════

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, path.join(__dirname, "uploads")),
  filename:    (_, file, cb) => cb(null, `${Date.now()}_${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

router.get("/photos", async (_, res) => {
  try {
    const { rows } = await query("SELECT * FROM photos ORDER BY uploaded_at DESC");
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/photos", upload.single("photo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Aucun fichier" });
  try {
    const url = `/uploads/${req.file.filename}`;
    const { rows } = await query(
      "INSERT INTO photos (url) VALUES ($1) RETURNING *", [url]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
//  CHARIOTS — ADMIN
// ═══════════════════════════════════════════════════════════

router.get("/chariots", requireAdmin, async (_, res) => {
  try {
    const { rows } = await query("SELECT * FROM chariots ORDER BY id");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/chariots", requireAdmin, async (req, res) => {
  const { nom, description, statut, vitesse, participants, latitude, longitude, batterie, gps_signal } = req.body;
  if (!nom) return res.status(400).json({ error: "nom requis" });
  try {
    const { rows } = await query(`
      INSERT INTO chariots (nom, description, statut, vitesse, participants, latitude, longitude, batterie, gps_signal)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *
    `, [nom, description, statut || "actif", vitesse, participants, latitude, longitude, batterie, gps_signal]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  ADMIN
// ═══════════════════════════════════════════════════════════

// GET /api/admin/stats
router.get("/admin/stats", requireAdmin, async (req, res) => {
  try {
    const { rows: chars } = await query("SELECT COUNT(*) AS total, SUM(CASE WHEN statut = 'actif' THEN 1 ELSE 0 END) AS actifs FROM chariots");
    const { rows: benevoles } = await query("SELECT COUNT(*) AS count FROM benevoles");
    const { rows: forains } = await query("SELECT COUNT(*) AS count FROM forains");
    const { rows: inscriptions } = await query("SELECT COUNT(*) AS count FROM chariots");
    const { rows: alertes } = await query("SELECT COUNT(*) AS count FROM alertes WHERE lu = false");
    const { rows: votes } = await query("SELECT COUNT(*) AS count FROM votes");
    const { rows: photos } = await query("SELECT COUNT(*) AS count FROM photos");
    res.json({
      chars_actifs: parseInt(chars[0].actifs || 0),
      chars_total: parseInt(chars[0].total || 0),
      benevoles: parseInt(benevoles[0].count || 0),
      forains: parseInt(forains[0].count || 0),
      inscriptions: parseInt(inscriptions[0].count || 0),
      alertes: parseInt(alertes[0].count || 0),
      votes_total: parseInt(votes[0].count || 0),
      photos: parseInt(photos[0].count || 0),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/admin/benevoles
router.get("/admin/benevoles", requireAdmin, async (req, res) => {
  try {
    const { rows } = await query("SELECT * FROM benevoles ORDER BY id");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/admin/benevoles
router.post("/admin/benevoles", requireAdmin, async (req, res) => {
  const { nom, role, zone } = req.body;
  if (!nom) return res.status(400).json({ error: "Nom requis" });
  try {
    const { rows } = await query("INSERT INTO benevoles (nom, role, zone) VALUES ($1, $2, $3) RETURNING *", [nom, role, zone]);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PATCH /api/admin/benevoles/:id
router.patch("/admin/benevoles/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { present } = req.body;
  try {
    await query("UPDATE benevoles SET present = $1 WHERE id = $2", [present, id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// DELETE /api/admin/benevoles/:id
router.delete("/admin/benevoles/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await query("DELETE FROM benevoles WHERE id = $1", [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/admin/forains
router.get("/admin/forains", requireAdmin, async (req, res) => {
  try {
    const { rows } = await query("SELECT * FROM forains ORDER BY id");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/admin/forains
router.post("/admin/forains", requireAdmin, async (req, res) => {
  const { nom, contact, emplacement } = req.body;
  if (!nom) return res.status(400).json({ error: "Nom requis" });
  try {
    const { rows } = await query("INSERT INTO forains (nom, contact, emplacement) VALUES ($1, $2, $3) RETURNING *", [nom, contact, emplacement]);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PATCH /api/admin/forains/:id
router.patch("/admin/forains/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { paye } = req.body;
  try {
    await query("UPDATE forains SET paye = $1 WHERE id = $2", [paye, id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// DELETE /api/admin/forains/:id
router.delete("/admin/forains/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await query("DELETE FROM forains WHERE id = $1", [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/admin/alertes
router.get("/admin/alertes", requireAdmin, async (req, res) => {
  try {
    const { rows } = await query("SELECT * FROM alertes ORDER BY time DESC");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PATCH /api/admin/alertes/:id/lu
router.patch("/admin/alertes/:id/lu", requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await query("UPDATE alertes SET lu = true WHERE id = $1", [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/admin/chariots
router.get("/admin/chariots", requireAdmin, async (req, res) => {
  try {
    const { rows } = await query("SELECT * FROM chariots ORDER BY created_at DESC");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/admin/chariots
router.post("/admin/chariots", requireAdmin, async (req, res) => {
  const { nom, description } = req.body;
  if (!nom) return res.status(400).json({ error: "Nom requis" });
  try {
    const { rows } = await query("INSERT INTO chariots (nom, description) VALUES ($1, $2) RETURNING *", [nom, description]);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// DELETE /api/admin/chariots/:id
router.delete("/admin/chariots/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await query("DELETE FROM chariots WHERE id = $1", [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ═══════════════════════════════════════════════════════════
//  PUBLIC
// ═══════════════════════════════════════════════════════════

// GET /api/chariots
router.get("/chariots", async (req, res) => {
  try {
    const { rows } = await query("SELECT id, nom, description, statut, created_at FROM chariots ORDER BY created_at DESC");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/admin/stats
router.get("/admin/stats", requireAdmin, async (req, res) => {
  try {
    const { rows: chars } = await query("SELECT COUNT(*) AS total, SUM(CASE WHEN statut = 'actif' THEN 1 ELSE 0 END) AS actifs FROM chariots");
    const { rows: benevoles } = await query("SELECT COUNT(*) AS count FROM benevoles");
    const { rows: forains } = await query("SELECT COUNT(*) AS count FROM forains");
    const { rows: inscriptions } = await query("SELECT COUNT(*) AS count FROM chariots");
    const { rows: alertes } = await query("SELECT COUNT(*) AS count FROM alertes WHERE lu = false");
    const { rows: votes } = await query("SELECT COUNT(*) AS count FROM votes");
    const { rows: photos } = await query("SELECT COUNT(*) AS count FROM photos");
    res.json({
      chars_actifs: parseInt(chars[0].actifs || 0),
      chars_total: parseInt(chars[0].total || 0),
      benevoles: parseInt(benevoles[0].count || 0),
      forains: parseInt(forains[0].count || 0),
      inscriptions: parseInt(inscriptions[0].count || 0),
      alertes: parseInt(alertes[0].count || 0),
      votes_total: parseInt(votes[0].count || 0),
      photos: parseInt(photos[0].count || 0),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/admin/benevoles
router.get("/admin/benevoles", requireAdmin, async (req, res) => {
  try {
    const { rows } = await query("SELECT * FROM benevoles ORDER BY id");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/admin/benevoles
router.post("/admin/benevoles", requireAdmin, async (req, res) => {
  const { nom, role, zone } = req.body;
  if (!nom) return res.status(400).json({ error: "Nom requis" });
  try {
    const { rows } = await query("INSERT INTO benevoles (nom, role, zone) VALUES ($1, $2, $3) RETURNING *", [nom, role, zone]);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PATCH /api/admin/benevoles/:id
router.patch("/admin/benevoles/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { present } = req.body;
  try {
    await query("UPDATE benevoles SET present = $1 WHERE id = $2", [present, id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// DELETE /api/admin/benevoles/:id
router.delete("/admin/benevoles/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await query("DELETE FROM benevoles WHERE id = $1", [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/admin/forains
router.get("/admin/forains", requireAdmin, async (req, res) => {
  try {
    const { rows } = await query("SELECT * FROM forains ORDER BY id");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/admin/forains
router.post("/admin/forains", requireAdmin, async (req, res) => {
  const { nom, contact, emplacement } = req.body;
  if (!nom) return res.status(400).json({ error: "Nom requis" });
  try {
    const { rows } = await query("INSERT INTO forains (nom, contact, emplacement) VALUES ($1, $2, $3) RETURNING *", [nom, contact, emplacement]);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PATCH /api/admin/forains/:id
router.patch("/admin/forains/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { paye } = req.body;
  try {
    await query("UPDATE forains SET paye = $1 WHERE id = $2", [paye, id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// DELETE /api/admin/forains/:id
router.delete("/admin/forains/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await query("DELETE FROM forains WHERE id = $1", [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/admin/alertes
router.get("/admin/alertes", requireAdmin, async (req, res) => {
  try {
    const { rows } = await query("SELECT * FROM alertes ORDER BY time DESC");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PATCH /api/admin/alertes/:id/lu
router.patch("/admin/alertes/:id/lu", requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await query("UPDATE alertes SET lu = true WHERE id = $1", [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/admin/chariots
router.get("/admin/chariots", requireAdmin, async (req, res) => {
  try {
    const { rows } = await query("SELECT * FROM chariots ORDER BY created_at DESC");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/admin/chariots
router.post("/admin/chariots", requireAdmin, async (req, res) => {
  const { nom, description } = req.body;
  if (!nom) return res.status(400).json({ error: "Nom requis" });
  try {
    const { rows } = await query("INSERT INTO chariots (nom, description) VALUES ($1, $2) RETURNING *", [nom, description]);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// DELETE /api/admin/chariots/:id
router.delete("/admin/chariots/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await query("DELETE FROM chariots WHERE id = $1", [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/admin/stats", requireAdmin, async (_, res) => {
  try {
    const [chars, benv, forains, inscr, alertes, votes, photos] = await Promise.all([
      query("SELECT COUNT(*) FILTER (WHERE statut='actif') AS actifs, COUNT(*) AS total FROM chars"),
      query("SELECT COUNT(*) FROM benevoles"),
      query("SELECT COUNT(*) FROM forains"),
      query("SELECT COUNT(*) FROM inscriptions"),
      query("SELECT COUNT(*) FILTER (WHERE lu=FALSE) AS non_lues FROM alertes"),
      query("SELECT COUNT(*) FROM votes"),
      query("SELECT COUNT(*) FROM photos"),
    ]);
    res.json({
      chars_actifs:  parseInt(chars.rows[0].actifs),
      chars_total:   parseInt(chars.rows[0].total),
      benevoles:     parseInt(benv.rows[0].count),
      forains:       parseInt(forains.rows[0].count),
      inscriptions:  parseInt(inscr.rows[0].count),
      alertes:       parseInt(alertes.rows[0].non_lues),
      votes_total:   parseInt(votes.rows[0].count),
      photos:        parseInt(photos.rows[0].count),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Bénévoles ──────────────────────────────────────────────
router.get("/admin/benevoles", requireAdmin, async (_, res) => {
  try { res.json((await query("SELECT * FROM benevoles ORDER BY nom")).rows); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/admin/benevoles", requireAdmin, async (req, res) => {
  const { nom, role, zone } = req.body;
  if (!nom) return res.status(400).json({ error: "nom requis" });
  try {
    const { rows } = await query(
      "INSERT INTO benevoles (nom, role, zone) VALUES ($1,$2,$3) RETURNING *",
      [nom, role || "", zone || ""]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/admin/benevoles/:id", requireAdmin, async (req, res) => {
  const { nom, role, zone, present } = req.body;
  try {
    const { rows } = await query(
      `UPDATE benevoles SET
        nom     = COALESCE($1, nom),
        role    = COALESCE($2, role),
        zone    = COALESCE($3, zone),
        present = COALESCE($4, present)
       WHERE id = $5 RETURNING *`,
      [nom, role, zone, present, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Introuvable" });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/admin/benevoles/:id", requireAdmin, async (req, res) => {
  try {
    const { rowCount } = await query("DELETE FROM benevoles WHERE id = $1", [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: "Introuvable" });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Forains ────────────────────────────────────────────────
router.get("/admin/forains", requireAdmin, async (_, res) => {
  try { res.json((await query("SELECT * FROM forains ORDER BY nom")).rows); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/admin/forains", requireAdmin, async (req, res) => {
  const { nom, contact, emplacement } = req.body;
  if (!nom) return res.status(400).json({ error: "nom requis" });
  try {
    const { rows } = await query(
      "INSERT INTO forains (nom, contact, emplacement) VALUES ($1,$2,$3) RETURNING *",
      [nom, contact || "", emplacement || ""]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/admin/forains/:id", requireAdmin, async (req, res) => {
  const { nom, contact, emplacement, paye } = req.body;
  try {
    const { rows } = await query(
      `UPDATE forains SET
        nom         = COALESCE($1, nom),
        contact     = COALESCE($2, contact),
        emplacement = COALESCE($3, emplacement),
        paye        = COALESCE($4, paye)
       WHERE id = $5 RETURNING *`,
      [nom, contact, emplacement, paye, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Introuvable" });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/admin/forains/:id", requireAdmin, async (req, res) => {
  try {
    const { rowCount } = await query("DELETE FROM forains WHERE id = $1", [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: "Introuvable" });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Inscriptions ───────────────────────────────────────────
router.get("/admin/inscriptions", requireAdmin, async (_, res) => {
  try { res.json((await query("SELECT * FROM inscriptions ORDER BY created_at DESC")).rows); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/admin/inscriptions/:id", requireAdmin, async (req, res) => {
  const { statut } = req.body;
  try {
    const { rows } = await query(
      "UPDATE inscriptions SET statut = COALESCE($1, statut) WHERE id = $2 RETURNING *",
      [statut, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Introuvable" });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Chars (admin) ──────────────────────────────────────────
router.patch("/admin/chars/:id", requireAdmin, async (req, res) => {
  const { statut, vitesse, batterie, gps_signal, participants } = req.body;
  try {
    const { rows } = await query(
      `UPDATE chars SET
        statut       = COALESCE($1, statut),
        vitesse      = COALESCE($2, vitesse),
        batterie     = COALESCE($3, batterie),
        gps_signal   = COALESCE($4, gps_signal),
        participants = COALESCE($5, participants),
        updated_at   = NOW()
       WHERE id = $6 RETURNING *`,
      [statut, vitesse, batterie, gps_signal, participants, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Introuvable" });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Alertes ────────────────────────────────────────────────
router.get("/admin/alertes", requireAdmin, async (_, res) => {
  try { res.json((await query("SELECT * FROM alertes ORDER BY created_at DESC")).rows); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/admin/alertes/:id/lu", requireAdmin, async (req, res) => {
  try {
    const { rows } = await query(
      "UPDATE alertes SET lu = TRUE WHERE id = $1 RETURNING *", [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Introuvable" });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Votes reset ────────────────────────────────────────────
router.post("/admin/votes/reset", requireAdmin, async (_, res) => {
  try { await query("DELETE FROM votes"); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Gestion utilisateurs ───────────────────────────────────
router.get("/admin/users", requireAdmin, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Réservé à l'admin" });
  try {
    const { rows } = await query(
      "SELECT id, username, role, display_name AS \"displayName\", created_at FROM users ORDER BY id"
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/admin/users", requireAdmin, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Réservé à l'admin" });
  const { username, password, role, displayName } = req.body;
  if (!username || !password) return res.status(400).json({ error: "username et password requis" });
  try {
    const hashed = password;
    const { rows } = await query(
      "INSERT INTO users (username, password, role, display_name) VALUES ($1,$2,$3,$4) RETURNING id, username, role, display_name AS \"displayName\"",
      [username, hashed, role || "comite", displayName || username]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Utilisateur déjà existant" });
    res.status(500).json({ error: err.message });
  }
});

router.delete("/admin/users/:id", requireAdmin, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Réservé à l'admin" });
  if (parseInt(req.params.id) === req.user.id)
    return res.status(400).json({ error: "Impossible de se supprimer soi-même" });
  try {
    const { rowCount } = await query("DELETE FROM users WHERE id = $1", [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: "Introuvable" });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
//  SÉCU
// ═══════════════════════════════════════════════════════════

router.post("/secu/login", (req, res) => {
  const { password } = req.body || {};
  if (password !== SECU_PASSWORD)
    return res.status(401).json({ error: "Mot de passe incorrect" });
  const token = jwt.sign({ role: "secu" }, JWT_SECRET, { expiresIn: "12h" });
  res.json({ token });
});

router.get("/secu/positions", requireSecu, async (_, res) => {
  try { res.json((await query("SELECT * FROM secu_positions ORDER BY id")).rows); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/secu/positions/:id", requireSecu, async (req, res) => {
  const { latitude, longitude, actif } = req.body;
  try {
    const { rows } = await query(
      `UPDATE secu_positions SET
        latitude  = COALESCE($1, latitude),
        longitude = COALESCE($2, longitude),
        actif     = COALESCE($3, actif),
        updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [latitude, longitude, actif, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Introuvable" });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/secu/alertes", requireSecu, async (_, res) => {
  try { res.json((await query("SELECT * FROM alertes ORDER BY created_at DESC")).rows); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/secu/alertes", requireSecu, async (req, res) => {
  const { message, expediteur, latitude, longitude } = req.body;
  if (!message) return res.status(400).json({ error: "message requis" });
  try {
    const { rows } = await query(
      "INSERT INTO alertes (message, expediteur, latitude, longitude) VALUES ($1,$2,$3,$4) RETURNING *",
      [message, expediteur || "SECU", latitude || null, longitude || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/secu/alertes/:id/lu", requireSecu, async (req, res) => {
  try {
    const { rows } = await query(
      "UPDATE alertes SET lu = TRUE WHERE id = $1 RETURNING *", [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Introuvable" });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
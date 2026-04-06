import { Router } from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

import { query } from "./db.js";

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const JWT_SECRET = process.env.JWT_SECRET || "carnaval_rio_secret_2026_change_me";
const SECU_PASSWORD = process.env.SECU_PASSWORD || "secu2026";

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, path.join(__dirname, "uploads")),
  filename: (_, file, cb) => cb(null, `${Date.now()}_${file.originalname.replace(/\s+/g, "_")}`),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token manquant" });
  }

  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Token invalide ou expire" });
  }
}

function requireSecu(req, res, next) {
  const token = req.headers["x-secu-token"] || "";
  if (!token) {
    return res.status(401).json({ error: "Token securite manquant" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!["secu", "admin", "comite"].includes(payload.role)) {
      return res.status(403).json({ error: "Acces refuse" });
    }
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Token securite invalide ou expire" });
  }
}

function formatAlert(row) {
  return {
    id: row.id,
    message: row.message,
    expediteur: row.expediteur,
    time: row.time ? new Date(row.time).toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" }) : "--:--",
    latitude: row.latitude,
    longitude: row.longitude,
    lu: row.lu,
  };
}

function chapiteauActor(req) {
  return req.user?.displayName || req.user?.username || "SYSTÈME";
}

async function logKegHistory(kegId, action, actor, details) {
  await query(
    "INSERT INTO beer_keg_history (keg_id, action, actor, details) VALUES ($1, $2, $3, $4)",
    [kegId, action, actor, details]
  );
}

async function createUnreadAlertIfMissing(message) {
  const { rows } = await query(
    "SELECT id FROM alertes WHERE expediteur = $1 AND message = $2 AND lu = false LIMIT 1",
    ["SYSTÈME CHAPITEAU", message]
  );
  if (!rows[0]) {
    await query(
      "INSERT INTO alertes (message, expediteur) VALUES ($1, $2)",
      [message, "SYSTÈME CHAPITEAU"]
    );
  }
}

async function ensureChapiteauAlerts() {
  const [settingsResult, beerStatsResult, stockItemsResult] = await Promise.all([
    query("SELECT * FROM chapiteau_settings ORDER BY id ASC LIMIT 1"),
    query(`
      SELECT
        COUNT(*) FILTER (WHERE statut = 'plein')::int AS futs_pleins,
        COALESCE(SUM(restant_litres), 0)::float AS litres_restants
      FROM beer_kegs
    `),
    query("SELECT nom, stock_actuel, seuil_alerte, unite FROM drink_stock_items"),
  ]);

  const settings = settingsResult.rows[0];
  const beerStats = beerStatsResult.rows[0];
  if (!settings) {
    return;
  }

  if (beerStats.litres_restants < settings.seuil_litres_alerte) {
    await createUnreadAlertIfMissing("Chapiteau: stock bière sous le seuil litres");
  }

  if (beerStats.futs_pleins < settings.seuil_futs_pleins_alerte) {
    await createUnreadAlertIfMissing("Chapiteau: nombre de fûts pleins sous le seuil");
  }

  for (const item of stockItemsResult.rows) {
    if (item.stock_actuel <= item.seuil_alerte) {
      await createUnreadAlertIfMissing(`Chapiteau: stock bas pour ${item.nom}`);
    }
  }
}

async function getCharList() {
  const { rows } = await query(`
    SELECT id, nom, description, statut, vitesse, participants, latitude, longitude, batterie, gps_signal, updated_at, created_at
    FROM chariots
    ORDER BY id
  `);
  return rows;
}

async function getCharPositions() {
  const chars = await getCharList();
  await Promise.all(chars.map(async (char) => {
    const { rows: historique } = await query(
      `SELECT latitude, longitude
       FROM char_historique
       WHERE char_id = $1
       ORDER BY recorded_at DESC
       LIMIT 50`,
      [char.id]
    );
    char.historique = historique.reverse();
  }));
  return chars;
}

router.post("/auth/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "username et password requis" });
  }

  try {
    const { rows } = await query("SELECT * FROM users WHERE username = $1", [username]);
    const user = rows[0];
    if (!user) {
      return res.status(401).json({ error: "Identifiants incorrects" });
    }

    const isHashed = user.password.startsWith("$2");
    const passwordOk = isHashed ? await bcrypt.compare(password, user.password) : password === user.password;
    if (!passwordOk) {
      return res.status(401).json({ error: "Identifiants incorrects" });
    }

    if (!isHashed) {
      const upgraded = await bcrypt.hash(password, 10);
      await query("UPDATE users SET password = $1 WHERE id = $2", [upgraded, user.id]);
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, displayName: user.display_name },
      JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({ token, role: user.role, displayName: user.display_name });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/auth/me", requireAdmin, (req, res) => {
  res.json({ username: req.user.username, role: req.user.role, displayName: req.user.displayName });
});

router.post("/auth/logout", (_, res) => res.json({ ok: true }));

router.patch("/auth/password", requireAdmin, async (req, res) => {
  const { current, newPassword } = req.body || {};
  if (!current || !newPassword) {
    return res.status(400).json({ error: "Mot de passe actuel et nouveau requis" });
  }

  try {
    const { rows } = await query("SELECT * FROM users WHERE id = $1", [req.user.id]);
    const user = rows[0];
    if (!user) {
      return res.status(404).json({ error: "Utilisateur introuvable" });
    }

    const isHashed = user.password.startsWith("$2");
    const currentOk = isHashed ? await bcrypt.compare(current, user.password) : current === user.password;
    if (!currentOk) {
      return res.status(401).json({ error: "Mot de passe actuel incorrect" });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await query("UPDATE users SET password = $1 WHERE id = $2", [hashed, user.id]);
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/chars", async (_, res) => {
  try {
    res.json(await getCharList());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/chars/positions", async (_, res) => {
  try {
    res.json(await getCharPositions());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/chars/:id/position", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const { latitude, longitude, vitesse, batterie, gps_signal, statut } = req.body || {};

  try {
    const { rows: currentRows } = await query(
      "SELECT latitude, longitude FROM chariots WHERE id = $1",
      [id]
    );
    const current = currentRows[0];
    if (!current) {
      return res.status(404).json({ error: "Char introuvable" });
    }

    if (current.latitude !== null && current.longitude !== null) {
      await query(
        "INSERT INTO char_historique (char_id, latitude, longitude) VALUES ($1, $2, $3)",
        [id, current.latitude, current.longitude]
      );
      await query(
        `DELETE FROM char_historique
         WHERE char_id = $1
         AND id NOT IN (
           SELECT id FROM char_historique WHERE char_id = $1 ORDER BY recorded_at DESC LIMIT 50
         )`,
        [id]
      );
    }

    await query(
      `UPDATE chariots SET
        latitude = COALESCE($1, latitude),
        longitude = COALESCE($2, longitude),
        vitesse = COALESCE($3, vitesse),
        batterie = COALESCE($4, batterie),
        gps_signal = COALESCE($5, gps_signal),
        statut = COALESCE($6, statut),
        updated_at = NOW()
      WHERE id = $7`,
      [latitude, longitude, vitesse, batterie, gps_signal, statut, id]
    );

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/vote", async (req, res) => {
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  const { char_id } = req.body || {};

  try {
    const { rows: already } = await query("SELECT id FROM votes WHERE voter_ip = $1", [ip]);
    if (already.length > 0) {
      return res.status(409).json({ error: "Deja vote" });
    }

    const { rows: existingChar } = await query("SELECT id FROM chariots WHERE id = $1", [char_id]);
    if (!existingChar[0]) {
      return res.status(404).json({ error: "Char introuvable" });
    }

    await query("INSERT INTO votes (char_id, voter_ip) VALUES ($1, $2)", [char_id, ip]);
    const { rows: countRows } = await query(
      "SELECT COUNT(*)::int AS count FROM votes WHERE char_id = $1",
      [char_id]
    );
    res.json({ ok: true, votes: countRows[0].count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/votes", async (_, res) => {
  try {
    const { rows } = await query(
      "SELECT char_id, COUNT(*)::int AS count FROM votes GROUP BY char_id ORDER BY char_id"
    );
    const result = {};
    rows.forEach((row) => {
      result[row.char_id] = row.count;
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/photos", async (_, res) => {
  try {
    const { rows } = await query(
      "SELECT id, COALESCE(url, CONCAT('/uploads/', filename)) AS url, uploaded_at FROM photos ORDER BY uploaded_at DESC"
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/photos", upload.single("photo"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Aucun fichier" });
  }

  try {
    const url = `/uploads/${req.file.filename}`;
    const { rows } = await query(
      "INSERT INTO photos (filename, url) VALUES ($1, $2) RETURNING id, url, uploaded_at",
      [req.file.filename, url]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/admin/stats", requireAdmin, async (_, res) => {
  try {
    const [chars, benevoles, forains, alertes, votes, photos] = await Promise.all([
      query("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE statut = 'actif')::int AS actifs FROM chariots"),
      query("SELECT COUNT(*)::int AS count FROM benevoles"),
      query("SELECT COUNT(*)::int AS count FROM forains"),
      query("SELECT COUNT(*)::int AS count FROM alertes WHERE lu = false"),
      query("SELECT COUNT(*)::int AS count FROM votes"),
      query("SELECT COUNT(*)::int AS count FROM photos"),
    ]);

    res.json({
      chars_actifs: chars.rows[0].actifs,
      chars_total: chars.rows[0].total,
      benevoles: benevoles.rows[0].count,
      forains: forains.rows[0].count,
      inscriptions: chars.rows[0].total,
      alertes: alertes.rows[0].count,
      votes_total: votes.rows[0].count,
      photos: photos.rows[0].count,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/admin/chapiteau", requireAdmin, async (_, res) => {
  try {
    await ensureChapiteauAlerts();

    const [settingsResult, kegsResult, statsResult, historyResult, stockResult] = await Promise.all([
      query("SELECT * FROM chapiteau_settings ORDER BY id ASC LIMIT 1"),
      query("SELECT * FROM beer_kegs ORDER BY created_at DESC, id DESC"),
      query(`
        SELECT
          COUNT(*) FILTER (WHERE statut = 'plein')::int AS futs_pleins,
          COUNT(*) FILTER (WHERE statut = 'entame')::int AS futs_entames,
          COUNT(*) FILTER (WHERE statut = 'vide')::int AS futs_vides,
          COUNT(*) FILTER (WHERE statut = 'vide')::int AS futs_utilises,
          COALESCE(SUM(restant_litres), 0)::float AS litres_restants,
          COALESCE(SUM(volume_litres - restant_litres), 0)::float AS litres_servis
        FROM beer_kegs
      `),
      query(`
        SELECT h.id, h.keg_id, h.action, h.actor, h.details, h.created_at, k.type, k.volume_litres
        FROM beer_keg_history h
        JOIN beer_kegs k ON k.id = h.keg_id
        ORDER BY h.created_at DESC
        LIMIT 20
      `),
      query("SELECT * FROM drink_stock_items ORDER BY categorie ASC, nom ASC"),
    ]);

    res.json({
      settings: settingsResult.rows[0] || null,
      stats: statsResult.rows[0],
      kegs: kegsResult.rows,
      history: historyResult.rows,
      stockItems: stockResult.rows,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.patch("/admin/chapiteau/settings", requireAdmin, async (req, res) => {
  const { nom, capacite_max, personnel_service, responsable, seuil_litres_alerte, seuil_futs_pleins_alerte } = req.body || {};

  try {
    const current = await query("SELECT id FROM chapiteau_settings ORDER BY id ASC LIMIT 1");
    if (!current.rows[0]) {
      const created = await query(
        `INSERT INTO chapiteau_settings (nom, capacite_max, personnel_service, responsable, seuil_litres_alerte, seuil_futs_pleins_alerte)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [nom || "Chapiteau principal", capacite_max ?? 300, personnel_service ?? 6, responsable || "Equipe buvette", seuil_litres_alerte ?? 40, seuil_futs_pleins_alerte ?? 2]
      );
      return res.json(created.rows[0]);
    }

    const { rows } = await query(
      `UPDATE chapiteau_settings SET
        nom = COALESCE($1, nom),
        capacite_max = COALESCE($2, capacite_max),
        personnel_service = COALESCE($3, personnel_service),
        responsable = COALESCE($4, responsable),
        seuil_litres_alerte = COALESCE($5, seuil_litres_alerte),
        seuil_futs_pleins_alerte = COALESCE($6, seuil_futs_pleins_alerte),
        updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [nom, capacite_max, personnel_service, responsable, seuil_litres_alerte, seuil_futs_pleins_alerte, current.rows[0].id]
    );
    await ensureChapiteauAlerts();
    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/admin/chapiteau/kegs", requireAdmin, async (req, res) => {
  const { type, volume_litres, emplacement, notes } = req.body || {};

  try {
    const totalVolume = Number.parseInt(volume_litres, 10) || 50;
    const { rows } = await query(
      `INSERT INTO beer_kegs (type, volume_litres, restant_litres, statut, emplacement, notes)
       VALUES ($1, $2, $2, 'plein', $3, $4)
       RETURNING *`,
      [type || "Blonde", totalVolume, emplacement || "Réserve chapiteau", notes || null]
    );
    await logKegHistory(rows[0].id, "création", chapiteauActor(req), `Ajout d'un fût ${rows[0].type} ${rows[0].volume_litres}L`);
    await ensureChapiteauAlerts();
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.patch("/admin/chapiteau/kegs/:id", requireAdmin, async (req, res) => {
  const { type, volume_litres, restant_litres, statut, emplacement, notes } = req.body || {};

  try {
    const { rows: existingRows } = await query("SELECT * FROM beer_kegs WHERE id = $1", [req.params.id]);
    const existing = existingRows[0];
    if (!existing) {
      return res.status(404).json({ error: "Fut introuvable" });
    }

    const nextStatus = statut ?? existing.statut;
    const nextVolume = volume_litres ?? existing.volume_litres;
    const nextRemaining = restant_litres ?? existing.restant_litres;
    const openedAt = nextStatus === "entame" && !existing.opened_at ? new Date() : existing.opened_at;
    const closedAt = nextStatus === "vide" ? new Date() : null;

    const { rows } = await query(
      `UPDATE beer_kegs SET
        type = COALESCE($1, type),
        volume_litres = COALESCE($2, volume_litres),
        restant_litres = COALESCE($3, restant_litres),
        statut = COALESCE($4, statut),
        emplacement = COALESCE($5, emplacement),
        notes = COALESCE($6, notes),
        opened_at = COALESCE($7, opened_at),
        closed_at = $8,
        updated_at = NOW()
       WHERE id = $9
       RETURNING *`,
      [type, nextVolume, nextRemaining, nextStatus, emplacement, notes, openedAt, closedAt, req.params.id]
    );
    const actor = chapiteauActor(req);
    const details = `Statut ${existing.statut} -> ${rows[0].statut}, ${existing.restant_litres}L -> ${rows[0].restant_litres}L`;
    await logKegHistory(rows[0].id, "mise à jour", actor, details);
    await ensureChapiteauAlerts();
    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/admin/chapiteau/stock", requireAdmin, async (req, res) => {
  const { nom, categorie, unite, stock_actuel, seuil_alerte, emplacement } = req.body || {};
  if (!nom) {
    return res.status(400).json({ error: "Nom requis" });
  }

  try {
    const { rows } = await query(
      `INSERT INTO drink_stock_items (nom, categorie, unite, stock_actuel, seuil_alerte, emplacement)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [nom, categorie || "soft", unite || "unités", stock_actuel ?? 0, seuil_alerte ?? 0, emplacement || "Réserve chapiteau"]
    );
    await ensureChapiteauAlerts();
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.patch("/admin/chapiteau/stock/:id", requireAdmin, async (req, res) => {
  const { nom, categorie, unite, stock_actuel, seuil_alerte, emplacement } = req.body || {};

  try {
    const { rows } = await query(
      `UPDATE drink_stock_items SET
        nom = COALESCE($1, nom),
        categorie = COALESCE($2, categorie),
        unite = COALESCE($3, unite),
        stock_actuel = COALESCE($4, stock_actuel),
        seuil_alerte = COALESCE($5, seuil_alerte),
        emplacement = COALESCE($6, emplacement),
        updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [nom, categorie, unite, stock_actuel, seuil_alerte, emplacement, req.params.id]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: "Article introuvable" });
    }
    await ensureChapiteauAlerts();
    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/admin/chariots", requireAdmin, async (_, res) => {
  try {
    const { rows } = await query(
      `SELECT id, nom, description, statut, vitesse, participants, latitude, longitude, batterie, gps_signal, updated_at, created_at
       FROM chariots
       ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/chariots", async (_, res) => {
  try {
    const { rows } = await query(
      "SELECT id, nom, description, statut, created_at FROM chariots ORDER BY created_at DESC"
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/admin/chariots", requireAdmin, async (req, res) => {
  const { nom, description, statut, vitesse, participants, latitude, longitude, batterie, gps_signal } = req.body || {};
  if (!nom) {
    return res.status(400).json({ error: "Nom requis" });
  }

  try {
    const { rows } = await query(
      `INSERT INTO chariots (nom, description, statut, vitesse, participants, latitude, longitude, batterie, gps_signal)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, nom, description, statut, vitesse, participants, latitude, longitude, batterie, gps_signal, updated_at, created_at`,
      [nom, description || "", statut || "actif", vitesse ?? 0, participants ?? 0, latitude ?? null, longitude ?? null, batterie ?? null, gps_signal ?? true]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.patch("/admin/chars/:id", requireAdmin, async (req, res) => {
  const { statut, vitesse, batterie, gps_signal, participants, latitude, longitude, description, nom } = req.body || {};

  try {
    const { rows } = await query(
      `UPDATE chariots SET
        nom = COALESCE($1, nom),
        description = COALESCE($2, description),
        statut = COALESCE($3, statut),
        vitesse = COALESCE($4, vitesse),
        batterie = COALESCE($5, batterie),
        gps_signal = COALESCE($6, gps_signal),
        participants = COALESCE($7, participants),
        latitude = COALESCE($8, latitude),
        longitude = COALESCE($9, longitude),
        updated_at = NOW()
       WHERE id = $10
       RETURNING id, nom, description, statut, vitesse, participants, latitude, longitude, batterie, gps_signal, updated_at, created_at`,
      [nom, description, statut, vitesse, batterie, gps_signal, participants, latitude, longitude, req.params.id]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: "Char introuvable" });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.delete("/admin/chariots/:id", requireAdmin, async (req, res) => {
  try {
    await query("DELETE FROM chariots WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/admin/benevoles", requireAdmin, async (_, res) => {
  try {
    const { rows } = await query("SELECT * FROM benevoles ORDER BY nom");
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/admin/benevoles", requireAdmin, async (req, res) => {
  const { nom, role, zone } = req.body || {};
  if (!nom) {
    return res.status(400).json({ error: "Nom requis" });
  }

  try {
    const { rows } = await query(
      "INSERT INTO benevoles (nom, role, zone) VALUES ($1, $2, $3) RETURNING *",
      [nom, role || "", zone || ""]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.patch("/admin/benevoles/:id", requireAdmin, async (req, res) => {
  const { nom, role, zone, present } = req.body || {};

  try {
    const { rows } = await query(
      `UPDATE benevoles SET
        nom = COALESCE($1, nom),
        role = COALESCE($2, role),
        zone = COALESCE($3, zone),
        present = COALESCE($4, present)
       WHERE id = $5
       RETURNING *`,
      [nom, role, zone, present, req.params.id]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: "Benevole introuvable" });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.delete("/admin/benevoles/:id", requireAdmin, async (req, res) => {
  try {
    await query("DELETE FROM benevoles WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/admin/forains", requireAdmin, async (_, res) => {
  try {
    const { rows } = await query("SELECT * FROM forains ORDER BY nom");
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/admin/forains", requireAdmin, async (req, res) => {
  const { nom, contact, emplacement } = req.body || {};
  if (!nom) {
    return res.status(400).json({ error: "Nom requis" });
  }

  try {
    const { rows } = await query(
      "INSERT INTO forains (nom, contact, emplacement) VALUES ($1, $2, $3) RETURNING *",
      [nom, contact || "", emplacement || ""]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.patch("/admin/forains/:id", requireAdmin, async (req, res) => {
  const { nom, contact, emplacement, paye } = req.body || {};

  try {
    const { rows } = await query(
      `UPDATE forains SET
        nom = COALESCE($1, nom),
        contact = COALESCE($2, contact),
        emplacement = COALESCE($3, emplacement),
        paye = COALESCE($4, paye)
       WHERE id = $5
       RETURNING *`,
      [nom, contact, emplacement, paye, req.params.id]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: "Forain introuvable" });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.delete("/admin/forains/:id", requireAdmin, async (req, res) => {
  try {
    await query("DELETE FROM forains WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/admin/alertes", requireAdmin, async (_, res) => {
  try {
    const { rows } = await query("SELECT * FROM alertes ORDER BY time DESC");
    res.json(rows.map(formatAlert));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.patch("/admin/alertes/:id/lu", requireAdmin, async (req, res) => {
  try {
    const { rows } = await query(
      "UPDATE alertes SET lu = true WHERE id = $1 RETURNING *",
      [req.params.id]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: "Alerte introuvable" });
    }
    res.json(formatAlert(rows[0]));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/secu/login", async (req, res) => {
  const { password } = req.body || {};
  if (password !== SECU_PASSWORD) {
    return res.status(401).json({ error: "Mot de passe incorrect" });
  }

  const token = jwt.sign(
    { username: "secu", role: "secu", displayName: "Equipe securite" },
    JWT_SECRET,
    { expiresIn: "8h" }
  );

  res.json({ token });
});

router.get("/secu/positions", requireSecu, async (_, res) => {
  try {
    const { rows } = await query(
      "SELECT id, nom, role, latitude, longitude, actif FROM secu_positions ORDER BY id"
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/secu/positions/:id", requireSecu, async (req, res) => {
  const { latitude, longitude, actif } = req.body || {};

  try {
    const { rows } = await query(
      `UPDATE secu_positions SET
        latitude = COALESCE($1, latitude),
        longitude = COALESCE($2, longitude),
        actif = COALESCE($3, actif),
        updated_at = NOW()
       WHERE id = $4
       RETURNING id, nom, role, latitude, longitude, actif`,
      [latitude, longitude, actif, req.params.id]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: "Position securite introuvable" });
    }
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/secu/alertes", requireSecu, async (_, res) => {
  try {
    const { rows } = await query("SELECT * FROM alertes ORDER BY time DESC");
    res.json(rows.map(formatAlert));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/secu/alertes", requireSecu, async (req, res) => {
  const { message, expediteur, latitude, longitude } = req.body || {};
  if (!message) {
    return res.status(400).json({ error: "Message requis" });
  }

  try {
    const { rows } = await query(
      "INSERT INTO alertes (message, expediteur, latitude, longitude) VALUES ($1, $2, $3, $4) RETURNING *",
      [message, expediteur || req.user.displayName || req.user.username, latitude ?? null, longitude ?? null]
    );
    res.status(201).json(formatAlert(rows[0]));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch("/secu/alertes/:id/lu", requireSecu, async (req, res) => {
  try {
    const { rows } = await query(
      "UPDATE alertes SET lu = true WHERE id = $1 RETURNING *",
      [req.params.id]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: "Alerte introuvable" });
    }
    res.json(formatAlert(rows[0]));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

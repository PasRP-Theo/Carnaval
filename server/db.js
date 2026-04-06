import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pg;

// ── Pool de connexion ──────────────────────────────────────
const pool = new Pool({
  host:     process.env.DB_HOST     || "localhost",
  port:     parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME     || "carnaval",
  user:     process.env.DB_USER     || "postgres",
  password: String(process.env.DB_PASSWORD || "admin"),
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => {
  console.error("❌ Erreur pool PostgreSQL :", err.message);
});

// ── Helper query ───────────────────────────────────────────
export async function query(sql, params = []) {
  const client = await pool.connect();
  try {
    const res = await client.query(sql, params);
    return res;
  } finally {
    client.release();
  }
}

// ── Créer tables si elles n'existent pas ──────────────────
export async function createTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL,
      display_name VARCHAR(100)
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS chariots (
      id SERIAL PRIMARY KEY,
      nom VARCHAR(100) NOT NULL,
      description TEXT,
      statut VARCHAR(20) DEFAULT 'inscrit',
      vitesse FLOAT,
      participants INTEGER,
      latitude FLOAT,
      longitude FLOAT,
      batterie FLOAT,
      gps_signal BOOLEAN DEFAULT true,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await query(`
    ALTER TABLE chariots
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS char_historique (
      id SERIAL PRIMARY KEY,
      char_id INTEGER NOT NULL REFERENCES chariots(id) ON DELETE CASCADE,
      latitude DOUBLE PRECISION NOT NULL,
      longitude DOUBLE PRECISION NOT NULL,
      recorded_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS benevoles (
      id SERIAL PRIMARY KEY,
      nom VARCHAR(100) NOT NULL,
      role VARCHAR(50),
      zone VARCHAR(50),
      present BOOLEAN DEFAULT false
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS forains (
      id SERIAL PRIMARY KEY,
      nom VARCHAR(100) NOT NULL,
      contact VARCHAR(100),
      emplacement VARCHAR(100),
      paye BOOLEAN DEFAULT false
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS alertes (
      id SERIAL PRIMARY KEY,
      message TEXT NOT NULL,
      expediteur VARCHAR(100),
      time TIMESTAMP DEFAULT NOW(),
      latitude FLOAT,
      longitude FLOAT,
      lu BOOLEAN DEFAULT false
    );
  `);
  await query(`
    ALTER TABLE alertes
    ADD COLUMN IF NOT EXISTS time TIMESTAMP DEFAULT NOW();
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS votes (
      id SERIAL PRIMARY KEY,
      char_id INTEGER REFERENCES chariots(id),
      voter_ip VARCHAR(45),
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS photos (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255),
      url VARCHAR(255),
      uploaded_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await query(`
    ALTER TABLE photos
    ADD COLUMN IF NOT EXISTS url VARCHAR(255);
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS secu_positions (
      id SERIAL PRIMARY KEY,
      nom VARCHAR(100) NOT NULL,
      role VARCHAR(50) NOT NULL,
      latitude DOUBLE PRECISION NOT NULL,
      longitude DOUBLE PRECISION NOT NULL,
      actif BOOLEAN DEFAULT true,
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS chapiteau_settings (
      id SERIAL PRIMARY KEY,
      nom VARCHAR(120) NOT NULL DEFAULT 'Chapiteau principal',
      capacite_max INTEGER NOT NULL DEFAULT 300,
      personnel_service INTEGER NOT NULL DEFAULT 6,
      responsable VARCHAR(120) DEFAULT 'Equipe buvette',
      seuil_litres_alerte INTEGER NOT NULL DEFAULT 40,
      seuil_futs_pleins_alerte INTEGER NOT NULL DEFAULT 2,
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await query(`
    ALTER TABLE chapiteau_settings
    ADD COLUMN IF NOT EXISTS seuil_litres_alerte INTEGER NOT NULL DEFAULT 40;
  `);
  await query(`
    ALTER TABLE chapiteau_settings
    ADD COLUMN IF NOT EXISTS seuil_futs_pleins_alerte INTEGER NOT NULL DEFAULT 2;
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS beer_kegs (
      id SERIAL PRIMARY KEY,
      type VARCHAR(60) NOT NULL DEFAULT 'Blonde',
      volume_litres INTEGER NOT NULL DEFAULT 50,
      restant_litres NUMERIC(8,2) NOT NULL DEFAULT 50,
      statut VARCHAR(20) NOT NULL DEFAULT 'plein',
      emplacement VARCHAR(100) DEFAULT 'Réserve chapiteau',
      notes TEXT,
      opened_at TIMESTAMP,
      closed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS beer_keg_history (
      id SERIAL PRIMARY KEY,
      keg_id INTEGER NOT NULL REFERENCES beer_kegs(id) ON DELETE CASCADE,
      action VARCHAR(60) NOT NULL,
      actor VARCHAR(120) NOT NULL,
      details TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS drink_stock_items (
      id SERIAL PRIMARY KEY,
      nom VARCHAR(120) NOT NULL,
      categorie VARCHAR(40) NOT NULL DEFAULT 'soft',
      unite VARCHAR(40) NOT NULL DEFAULT 'bouteilles',
      stock_actuel INTEGER NOT NULL DEFAULT 0,
      seuil_alerte INTEGER NOT NULL DEFAULT 0,
      emplacement VARCHAR(120) DEFAULT 'Réserve chapiteau',
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log("✓ Tables créées ou déjà existantes");
}

// ── Seed utilisateurs (mots de passe en clair) ────────────
const INITIAL_USERS = [
  { username: "admin",  password: "carnaval2026", role: "admin",  displayName: "Administrateur"  },
  { username: "comite", password: "comite2026",   role: "comite", displayName: "Comité carnaval" },
  { username: "secu",   password: "secu2026",     role: "secu",   displayName: "Sécurité"        },
];

export async function seedUsers() {
  for (const u of INITIAL_USERS) {
    const { rows } = await query("SELECT id FROM users WHERE username = $1", [u.username]);
    if (rows.length === 0) {
      const hashedPassword = await bcrypt.hash(u.password, 10);
      await query(
        "INSERT INTO users (username, password, role, display_name) VALUES ($1,$2,$3,$4)",
        [u.username, hashedPassword, u.role, u.displayName]
      );
      console.log(`🌱 Utilisateur créé : ${u.username} / ${u.password}`);
    }
  }
}

// ── Seed chariots ────────────────────────────────────────
const INITIAL_CHARIOTS = [
  { nom: "Char de Rio", description: "Char principal du carnaval", statut: "actif", vitesse: 5.2, participants: 50, latitude: 50.4680, longitude: 4.8690, batterie: 85.0, gps_signal: true },
  { nom: "Char Samba", description: "Char de danse samba", statut: "actif", vitesse: 3.8, participants: 30, latitude: 50.4645, longitude: 4.8655, batterie: 92.0, gps_signal: true },
  { nom: "Char Tropical", description: "Char avec thème tropical", statut: "arrêté", vitesse: 0.0, participants: 25, latitude: 50.4630, longitude: 4.8620, batterie: 45.0, gps_signal: false },
];

export async function seedChariots() {
  for (const c of INITIAL_CHARIOTS) {
    const { rows } = await query("SELECT id FROM chariots WHERE nom = $1", [c.nom]);
    if (rows.length === 0) {
      await query(`
        INSERT INTO chariots (nom, description, statut, vitesse, participants, latitude, longitude, batterie, gps_signal)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [c.nom, c.description, c.statut, c.vitesse, c.participants, c.latitude, c.longitude, c.batterie, c.gps_signal]);
      console.log(`🌱 Char créé : ${c.nom}`);
    }
  }
}

const INITIAL_BENEVOLES = [
  { nom: "Luc Martin", role: "Accueil", zone: "Place centrale", present: true },
  { nom: "Sarah Dupont", role: "Logistique", zone: "Rue du Moulin", present: false },
];

const INITIAL_FORAINS = [
  { nom: "Gaufres du Parc", contact: "0499 11 22 33", emplacement: "Stand A3", paye: true },
  { nom: "Manège Samba", contact: "0488 44 55 66", emplacement: "Stand B1", paye: false },
];

const INITIAL_ALERTES = [
  { message: "Foule dense près de la Grand-Place", expediteur: "CENTRE OPS", latitude: 50.4665, longitude: 4.8666 },
];

const INITIAL_SECU_POSITIONS = [
  { nom: "Poste Secours A", role: "Secours", latitude: 50.4680, longitude: 4.8690, actif: true },
  { nom: "Signaleur - Rue du Moulin", role: "Signaleur", latitude: 50.4645, longitude: 4.8655, actif: true },
  { nom: "Signaleur - Place du Marche", role: "Signaleur", latitude: 50.4630, longitude: 4.8620, actif: false },
];

const INITIAL_CHAPITEAU_SETTINGS = {
  nom: "Chapiteau principal",
  capacite_max: 320,
  personnel_service: 8,
  responsable: "Equipe buvette",
  seuil_litres_alerte: 45,
  seuil_futs_pleins_alerte: 2,
};

const INITIAL_BEER_KEGS = [
  { type: "Blonde", volume_litres: 50, restant_litres: 50, statut: "plein", emplacement: "Réserve froide", notes: "Arrivage du matin" },
  { type: "Ambrée", volume_litres: 30, restant_litres: 18, statut: "entame", emplacement: "Bar principal", notes: "Service en cours" },
  { type: "Blonde", volume_litres: 50, restant_litres: 0, statut: "vide", emplacement: "Zone retour", notes: "A remplacer", opened_at: new Date(Date.now() - 4 * 60 * 60 * 1000), closed_at: new Date(Date.now() - 30 * 60 * 1000) },
];

const INITIAL_DRINK_STOCK = [
  { nom: "Eau plate", categorie: "eau", unite: "bouteilles", stock_actuel: 120, seuil_alerte: 24, emplacement: "Réserve froide" },
  { nom: "Eau pétillante", categorie: "eau", unite: "bouteilles", stock_actuel: 48, seuil_alerte: 12, emplacement: "Réserve froide" },
  { nom: "Coca-Cola", categorie: "soft", unite: "canettes", stock_actuel: 96, seuil_alerte: 18, emplacement: "Bar principal" },
  { nom: "Fanta", categorie: "soft", unite: "canettes", stock_actuel: 36, seuil_alerte: 12, emplacement: "Bar principal" },
  { nom: "Jus d'orange", categorie: "soft", unite: "briques", stock_actuel: 20, seuil_alerte: 6, emplacement: "Back office" },
];

export async function seedSupportData() {
  const { rows: benevoleRows } = await query("SELECT COUNT(*)::int AS count FROM benevoles");
  if (benevoleRows[0].count === 0) {
    for (const benevole of INITIAL_BENEVOLES) {
      await query(
        "INSERT INTO benevoles (nom, role, zone, present) VALUES ($1, $2, $3, $4)",
        [benevole.nom, benevole.role, benevole.zone, benevole.present]
      );
    }
  }

  const { rows: forainRows } = await query("SELECT COUNT(*)::int AS count FROM forains");
  if (forainRows[0].count === 0) {
    for (const forain of INITIAL_FORAINS) {
      await query(
        "INSERT INTO forains (nom, contact, emplacement, paye) VALUES ($1, $2, $3, $4)",
        [forain.nom, forain.contact, forain.emplacement, forain.paye]
      );
    }
  }

  const { rows: alerteRows } = await query("SELECT COUNT(*)::int AS count FROM alertes");
  if (alerteRows[0].count === 0) {
    for (const alerte of INITIAL_ALERTES) {
      await query(
        "INSERT INTO alertes (message, expediteur, latitude, longitude) VALUES ($1, $2, $3, $4)",
        [alerte.message, alerte.expediteur, alerte.latitude, alerte.longitude]
      );
    }
  }

  const { rows: secuRows } = await query("SELECT COUNT(*)::int AS count FROM secu_positions");
  if (secuRows[0].count === 0) {
    for (const position of INITIAL_SECU_POSITIONS) {
      await query(
        "INSERT INTO secu_positions (nom, role, latitude, longitude, actif) VALUES ($1, $2, $3, $4, $5)",
        [position.nom, position.role, position.latitude, position.longitude, position.actif]
      );
    }
  }

  const { rows: chapiteauRows } = await query("SELECT COUNT(*)::int AS count FROM chapiteau_settings");
  if (chapiteauRows[0].count === 0) {
    await query(
      "INSERT INTO chapiteau_settings (nom, capacite_max, personnel_service, responsable, seuil_litres_alerte, seuil_futs_pleins_alerte) VALUES ($1, $2, $3, $4, $5, $6)",
      [
        INITIAL_CHAPITEAU_SETTINGS.nom,
        INITIAL_CHAPITEAU_SETTINGS.capacite_max,
        INITIAL_CHAPITEAU_SETTINGS.personnel_service,
        INITIAL_CHAPITEAU_SETTINGS.responsable,
        INITIAL_CHAPITEAU_SETTINGS.seuil_litres_alerte,
        INITIAL_CHAPITEAU_SETTINGS.seuil_futs_pleins_alerte,
      ]
    );
  }

  const { rows: kegRows } = await query("SELECT COUNT(*)::int AS count FROM beer_kegs");
  if (kegRows[0].count === 0) {
    for (const keg of INITIAL_BEER_KEGS) {
      const inserted = await query(
        `INSERT INTO beer_kegs (type, volume_litres, restant_litres, statut, emplacement, notes, opened_at, closed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          keg.type,
          keg.volume_litres,
          keg.restant_litres,
          keg.statut,
          keg.emplacement,
          keg.notes,
          keg.opened_at ?? null,
          keg.closed_at ?? null,
        ]
      );
      await query(
        "INSERT INTO beer_keg_history (keg_id, action, actor, details) VALUES ($1, $2, $3, $4)",
        [inserted.rows[0].id, "création", "SYSTÈME", `Fût initial ${keg.type} ${keg.volume_litres}L ajouté au stock`]
      );
    }
  }

  const { rows: stockRows } = await query("SELECT COUNT(*)::int AS count FROM drink_stock_items");
  if (stockRows[0].count === 0) {
    for (const item of INITIAL_DRINK_STOCK) {
      await query(
        `INSERT INTO drink_stock_items (nom, categorie, unite, stock_actuel, seuil_alerte, emplacement)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [item.nom, item.categorie, item.unite, item.stock_actuel, item.seuil_alerte, item.emplacement]
      );
    }
  }
}

// ── Test connexion ─────────────────────────────────────────
export async function testConnection() {
  try {
    const { rows } = await query("SELECT NOW() AS now");
    console.log(`✓ PostgreSQL connecté — ${rows[0].now}`);
    return true;
  } catch (err) {
    console.error("❌ Connexion PostgreSQL échouée :", err.message);
    process.exit(1);
  }
}

export default pool;
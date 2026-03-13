import pg from "pg";

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
      filename VARCHAR(255) NOT NULL,
      uploaded_at TIMESTAMP DEFAULT NOW()
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
      await query(
        "INSERT INTO users (username, password, role, display_name) VALUES ($1,$2,$3,$4)",
        [u.username, u.password, u.role, u.displayName]
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
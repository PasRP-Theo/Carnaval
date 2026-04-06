import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { testConnection, seedUsers, createTables, seedChariots, seedSupportData } from "./db.js";
import apiRoutes from "./routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app  = express();
const PORT = process.env.PORT || 3001;

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

app.use(cors({ origin: ["http://localhost:5173", "http://localhost:4173"], credentials: true }));
app.use(express.json());
app.use("/uploads", express.static(uploadsDir));
app.use("/api", apiRoutes);
app.get("/health", (_, res) => res.json({ status: "ok", ts: new Date().toISOString() }));
app.use((_, res) => res.status(404).json({ error: "Route introuvable" }));

// Démarrage : test DB puis seed puis écoute
await testConnection();
await createTables();
await seedUsers();
await seedChariots();
await seedSupportData();

app.listen(PORT, () => {
  console.log(`\n🎠  Carnaval API  →  http://localhost:${PORT}`);
  console.log(`   Comptes : admin/carnaval2026  |  comite/comite2026  |  secu: secu2026\n`);
});
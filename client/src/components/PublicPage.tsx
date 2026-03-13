import { useEffect, useState } from "react";
import MapChars from "./MapChars";

interface Char {
  id: number; nom: string; description?: string;
  statut: "actif" | "arrêté"; vitesse?: number; participants?: number;
  latitude: number; longitude: number;
}

const COLORS = ["#60a5fa", "#ef4444", "#22c55e", "#f59e0b", "#a78bfa", "#34d399"];

const DEMO_CHARS: Char[] = [
  { id: 1, nom: "Char des Lions", description: "Le char officiel de l'association Les Lions", statut: "actif", vitesse: 4, participants: 12, latitude: 50.4672, longitude: 4.8678 },
  { id: 2, nom: "Char des Aigles", description: "Char des jeunes du village", statut: "actif", vitesse: 3, participants: 8, latitude: 50.4655, longitude: 4.8650 },
  { id: 3, nom: "Char des Fous", description: "Le char le plus décoré du carnaval !", statut: "arrêté", vitesse: 0, participants: 15, latitude: 50.4640, longitude: 4.8630 },
];

export default function PublicPage() {
  const [chars, setChars] = useState<Char[]>(DEMO_CHARS);
  const [votes, setVotes] = useState<Record<number, number>>({});
  const [voted, setVoted] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [uploadMsg, setUploadMsg] = useState("");
  const [photos, setPhotos] = useState<{ url: string }[]>([]);
  const [currentTab, setCurrentTab] = useState(0);

  const TABS = ["CARTE", "CAMÉRAS", "INTERACTION"];

  useEffect(() => {
    fetch("/api/chars").then(r => r.ok ? r.json() : null).then(d => d && setChars(d)).catch(() => {});
    fetch("/api/photos").then(r => r.ok ? r.json() : []).then(setPhotos).catch(() => {});
  }, []);

  const handleVote = async (charId: number) => {
    if (voted) return;
    try { await fetch("/api/vote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ char_id: charId }) }); } catch {}
    setVotes(v => ({ ...v, [charId]: (v[charId] || 0) + 1 }));
    setVoted(true);
  };

  const handlePhotoUpload = async () => {
    if (!photoFile) return;
    const form = new FormData();
    form.append("photo", photoFile);
    try { await fetch("/api/photos", { method: "POST", body: form }); setUploadMsg("✓ Photo envoyée"); setPhotoFile(null); }
    catch { setUploadMsg("✗ Erreur envoi"); }
  };

  const tag = (label: string) => (
    <span className="camera-tag">{label}</span>
  );

  return (
    <div className="page-container">

      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">CARNAVAL // LIVE</div>
          <div className="page-subtitle">Suivi public du cortège en temps réel</div>
        </div>
        <div className="page-actions">
          <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--accent-success)", boxShadow: "0 0 6px var(--accent-success)", animation: "pulse 2s ease-in-out infinite" }} />
          <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.15em", color: "var(--accent-success)" }}>EN DIRECT</span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav className="app-nav" style={{ borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>
        {TABS.map((tab, i) => (
          <button key={i} onClick={() => setCurrentTab(i)}
            className={`app-nav-link${currentTab === i ? " active" : ""}`}
            style={{ background: "none", fontFamily: "var(--font-mono)", cursor: "pointer" }}>
            {tab}
          </button>
        ))}
      </nav>

      {/* CARTE Tab */}
      {currentTab === 0 && (
        <>
          <div className="sensor-wrapper">
            <div className="sensor-header">
              <span className="sensor-title">GPS // POSITIONS</span>
              {tag(`${chars.filter(c => c.statut === "actif").length} ACTIFS`)}
            </div>
            <div className="map-wrapper">
              <MapChars />
            </div>
          </div>

          <div className="sensor-wrapper">
            <div className="sensor-header">
              <span className="sensor-title">CHARS // DÉTAILS</span>
              {tag(`${chars.length} CHARS`)}
            </div>
            {chars.length === 0 ? (
              <div style={{ padding: "16px", fontSize: "10px", color: "var(--text-muted)", letterSpacing: "0.08em" }}>— AUCUN CHAR —</div>
            ) : (
              <table className="sensor-table">
                <thead>
                  <tr>
                    { ["NOM", "DESCRIPTION", "PARTICIPANTS", "STATUT"].map(h => (
                      <th key={h} className="sensor-th">{h}</th>
                    )) }
                  </tr>
                </thead>
                <tbody>
                  {chars.map((char, i) => (
                    <tr key={char.id} className={i % 2 === 0 ? "sensor-tr--odd" : "sensor-tr--even"}>
                      <td className="sensor-td">
                        <div className="sensor-name" style={{ fontWeight: 600 }}>{char.nom}</div>
                      </td>
                      <td className="sensor-td">
                        <div style={{ fontSize: "10px", color: "var(--text-muted)", letterSpacing: "0.04em" }}>{char.description || "—"}</div>
                      </td>
                      <td className="sensor-td">
                        <span className="sensor-value">{char.participants ?? "—"}</span>
                      </td>
                      <td className="sensor-td">
                        <span className={`sensor-badge ${char.statut === "actif" ? "sensor-badge--ok" : "sensor-badge--alert"}`}>
                          <span className="sensor-badge-dot" />
                          {char.statut === "actif" ? "ACTIF" : "ARRÊTÉ"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* CAMÉRAS Tab */}
      {currentTab === 1 && (
        <div className="flex-column">
          {/* Flux vidéo principal */}
          <div className="sensor-wrapper">
            <div className="sensor-header">
              <span className="sensor-title">CAMERA // CHAR_01</span>
              <div style={{ display: "flex", gap: "6px" }}>{tag("HLS")}{tag("720P")}</div>
            </div>
            <div className="camera-card-screen" style={{ height: "360px" }}>
              <div className="camera-corner camera-corner--tl" />
              <div className="camera-corner camera-corner--tr" />
              <div className="camera-corner camera-corner--bl" />
              <div className="camera-corner camera-corner--br" />
              <video src="/api/stream/char1" autoPlay muted controls style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </div>
          </div>

          {/* Chars */}
          <div className="sensor-wrapper">
            <div className="sensor-header">
              <span className="sensor-title">CHARS // CORTÈGE</span>
              {tag(`${chars.length} CHARS`)}
            </div>
            <table className="sensor-table">
              <thead>
                <tr>
                  {["#", "NOM", "PARTICIPANTS", "STATUT"].map(h => (
                    <th key={h} className="sensor-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chars.map((char, i) => (
                  <tr key={char.id} className={i % 2 === 0 ? "sensor-tr--odd" : "sensor-tr--even"}>
                    <td className="sensor-td">
                      <span style={{ color: COLORS[i % COLORS.length], fontWeight: 700, fontSize: "12px" }}>{String(i + 1).padStart(2, "0")}</span>
                    </td>
                    <td className="sensor-td">
                      <div className="sensor-name" style={{ fontWeight: 600 }}>{char.nom}</div>
                      <div style={{ fontSize: "10px", color: "var(--text-muted)", letterSpacing: "0.04em" }}>{char.description}</div>
                    </td>
                    <td className="sensor-td">
                      <span className="sensor-value">{char.participants}</span>
                    </td>
                    <td className="sensor-td">
                      <span className={`sensor-badge ${char.statut === "actif" ? "sensor-badge--ok" : "sensor-badge--alert"}`}>
                        <span className="sensor-badge-dot" />
                        {char.statut === "actif" ? "ACTIF" : "ARRÊTÉ"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* INTERACTION Tab */}
      {currentTab === 2 && (
        <div className="flex-column">
          {/* Vote Section */}
          <div className="sensor-wrapper">
            <div className="sensor-header">
              <span className="sensor-title">VOTE // POPULAIRE</span>
              {tag("CHAR FAVORI")}
            </div>
            <div style={{ padding: "16px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
                {chars.map((char, i) => (
                  <div key={char.id} style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "4px", padding: "12px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 600, marginBottom: "8px", color: COLORS[i % COLORS.length] }}>{char.nom}</div>
                    <div style={{ fontSize: "10px", color: "var(--text-muted)", marginBottom: "12px" }}>{char.description}</div>
                    <button
                      onClick={() => handleVote(char.id)}
                      disabled={voted}
                      className="btn btn-primary"
                      style={{ width: "100%" }}
                    >
                      {voted ? `✓ VOTÉ (${votes[char.id] || 0})` : `VOTER (${votes[char.id] || 0})`}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Galerie photos */}
          <div className="sensor-wrapper">
            <div className="sensor-header">
              <span className="sensor-title">GALERIE // PARTICIPATIVE</span>
              {tag(`${photos.length} PHOTOS`)}
            </div>
            <div className="gallery-section">
              <div className="gallery-upload">
                <input type="file" accept="image/*" onChange={e => setPhotoFile(e.target.files?.[0] ?? null)}
                  className="vote-input" />
                <button onClick={handlePhotoUpload}
                  className="btn btn-primary">
                  ENVOYER →
                </button>
                {uploadMsg && <span className="vote-message" style={{ color: uploadMsg.startsWith("✓") ? "var(--accent-success)" : "var(--accent-error)" }}>{uploadMsg}</span>}
              </div>
              {photos.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: "8px" }}>
                  {photos.map((p, i) => <img key={i} src={p.url} alt="" style={{ width: "100%", borderRadius: "3px", aspectRatio: "1", objectFit: "cover", border: "1px solid var(--border)" }} />)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
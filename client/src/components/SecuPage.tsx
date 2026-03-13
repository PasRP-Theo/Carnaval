import { useEffect, useState } from "react";
import MapChars from "./MapChars";

interface SecuPosition { id: number; nom: string; role: string; latitude: number; longitude: number; actif: boolean; }
interface Alerte { id: number; message: string; expediteur: string; time: string; latitude?: number; longitude?: number; lu: boolean; }
interface Char {
  id: number; nom: string; description?: string;
  statut: "actif" | "arrêté"; vitesse?: number; participants?: number;
  latitude: number; longitude: number; batterie?: number;
  gps_signal?: boolean; updated_at?: string; historique?: { latitude: number; longitude: number; }[];
}

const DEMO_SECU: SecuPosition[] = [
  { id: 1, nom: "Poste Secours A", role: "Secours", latitude: 50.4680, longitude: 4.8690, actif: true },
  { id: 2, nom: "Signaleur — Rue du Moulin", role: "Signaleur", latitude: 50.4645, longitude: 4.8655, actif: true },
  { id: 3, nom: "Signaleur — Place du Marché", role: "Signaleur", latitude: 50.4630, longitude: 4.8620, actif: false },
];

export default function SecuPage() {
  const [auth, setAuth] = useState(false);
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [secu, setSecu] = useState<SecuPosition[]>(DEMO_SECU);
  const [chars, setChars] = useState<Char[]>([]);
  const [alertes, setAlertes] = useState<Alerte[]>([
    { id: 1, message: "Foule dense — passage difficile", expediteur: "SIGN_01", time: "14:32", latitude: 50.4645, longitude: 4.8655, lu: false },
  ]);
  const [newAlerte, setNewAlerte] = useState("");
  const [myRole, setMyRole] = useState("Comité");

  const handleLogin = async () => {
    try {
      const res = await fetch("/api/secu/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      if (res.ok) { const data = await res.json(); setToken(data.token); setAuth(true); setError(""); }
      else setError("ERR: Mot de passe incorrect");
    } catch {
      if (password === "secu2026") { setAuth(true); setToken("demo"); setError(""); }
      else setError("ERR: Mot de passe incorrect");
    }
  };

  useEffect(() => {
    if (!auth) return;
    const headers = { "x-secu-token": token };
    const load = async () => {
      try {
        const [s, a, c] = await Promise.all([
          fetch("/api/secu/positions", { headers }).then(r => r.json()),
          fetch("/api/secu/alertes", { headers }).then(r => r.json()),
          fetch("/api/chars/positions").then(r => r.json()),
        ]);
        setSecu(s);
        setAlertes(a);
        setChars(c);
      } catch {}
    };
    load();
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, [auth, token]);

  const envoyerAlerte = async () => {
    if (!newAlerte.trim()) return;
    const payload = { message: newAlerte, expediteur: myRole, time: new Date().toLocaleTimeString() };
    try { await fetch("/api/secu/alertes", { method: "POST", headers: { "Content-Type": "application/json", "x-secu-token": token }, body: JSON.stringify(payload) }); } catch {}
    setAlertes(a => [{ ...payload, id: Date.now(), lu: false }, ...a]);
    setNewAlerte("");
  };

  if (!auth) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <div className="auth-title">ACCÈS // SÉCURITÉ</div>
            <div className="auth-subtitle">Zone réservée — authentification requise</div>
          </div>
          <div className="auth-form">
            <div>
              <label className="auth-label">MOT DE PASSE</label>
              <input type="password" placeholder="••••••••" value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleLogin()}
                className="auth-input" />
            </div>
            {error && <div className="auth-error">{error}</div>}
            <button onClick={handleLogin} className="auth-button">
              ACCÉDER →
            </button>
            <div className="auth-hint">démo : secu2026</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">SÉCURITÉ // OPS</div>
          <div className="page-subtitle">Coordination opérationnelle — Confidentiel</div>
        </div>
        <div className="page-actions">
          <select value={myRole} onChange={e => setMyRole(e.target.value)}
            className="form-select">
            <option>Comité</option><option>Signaleur</option><option>Secours</option>
          </select>
          <button onClick={() => { setAuth(false); setToken(""); }}
            style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: "3px", padding: "5px 12px", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "9px", letterSpacing: "0.1em", cursor: "pointer" }}>
            DÉCONNEXION
          </button>
        </div>
      </div>

      {/* Carte */}
      <div className="map-wrapper">
        <div className="sensor-wrapper">
          <div className="sensor-header">
            <span className="sensor-title">CARTE // OPÉRATIONNELLE</span>
            <span className="camera-tag" style={{ color: "var(--accent-error)", borderColor: "rgba(255,68,68,0.3)" }}>CONFIDENTIEL</span>
          </div>
          <div style={{ padding: "12px" }}><MapChars showSecu={true} secu={secu} /></div>
        </div>
      </div>

      {/* Chars */}
      <div className="sensor-wrapper">
        <div className="sensor-header"><span className="sensor-title">CHARS // ÉTAT</span><span className="camera-tag">{chars.length} UNITÉS</span></div>
        {chars.length === 0 ? (
          <div style={{ padding: "16px", fontSize: "10px", color: "var(--text-muted)", letterSpacing: "0.08em" }}>— AUCUN CHAR —</div>
        ) : (
          <table className="sensor-table">
            <thead><tr>{["NOM", "STATUT", "VITESSE", "BATTERIE", "GPS"].map(h => <th key={h} className="sensor-th">{h}</th>)}</tr></thead>
            <tbody>
              {chars.map((char, i) => (
                <tr key={char.id} className={i % 2 === 0 ? "sensor-tr--odd" : "sensor-tr--even"}>
                  <td className="sensor-td"><span className="sensor-name" style={{ fontWeight: 600 }}>{char.nom}</span></td>
                  <td className="sensor-td"><span className={`sensor-badge ${char.statut === "actif" ? "sensor-badge--ok" : "sensor-badge--alert"}`}><span className="sensor-badge-dot" />{char.statut.toUpperCase()}</span></td>
                  <td className="sensor-td"><span className="sensor-name">{char.vitesse ? `${char.vitesse} km/h` : "—"}</span></td>
                  <td className="sensor-td"><span className="sensor-name">{char.batterie ? `${char.batterie}%` : "—"}</span></td>
                  <td className="sensor-td"><span className={`sensor-badge ${char.gps_signal ? "sensor-badge--ok" : "sensor-badge--alert"}`}><span className="sensor-badge-dot" />{char.gps_signal ? "OK" : "ERR"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        {/* Équipes */}
        <div className="sensor-wrapper">
          <div className="sensor-header"><span className="sensor-title">ÉQUIPES // TERRAIN</span></div>
          <table className="sensor-table">
            <thead><tr>{["NOM", "RÔLE", "STATUT"].map(h => <th key={h} className="sensor-th">{h}</th>)}</tr></thead>
            <tbody>
              {secu.map((s, i) => (
                <tr key={s.id} className={i % 2 === 0 ? "sensor-tr--odd" : "sensor-tr--even"}>
                  <td className="sensor-td"><span className="sensor-name" style={{ fontWeight: 600 }}>{s.nom}</span></td>
                  <td className="sensor-td"><span className="sensor-name">{s.role}</span></td>
                  <td className="sensor-td"><span className={`sensor-badge ${s.actif ? "sensor-badge--ok" : "sensor-badge--alert"}`}><span className="sensor-badge-dot" />{s.actif ? "ACTIF" : "INACTIF"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Envoi alerte */}
        <div className="sensor-wrapper">
          <div className="sensor-header">
            <span className="sensor-title">ALERTE // ENVOYER</span>
            <span className="camera-tag" style={{ color: "var(--accent-error)", borderColor: "rgba(255,68,68,0.3)" }}>URGENT</span>
          </div>
          <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <textarea rows={4} placeholder="Décrivez la situation..." value={newAlerte} onChange={e => setNewAlerte(e.target.value)}
              style={{ width: "100%", background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: "3px", padding: "10px 12px", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "12px", resize: "vertical", outline: "none", boxSizing: "border-box" }} />
            <button onClick={envoyerAlerte}
              style={{ background: "rgba(255,68,68,0.08)", border: "1px solid rgba(255,68,68,0.3)", borderRadius: "3px", padding: "10px", color: "var(--accent-error)", fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.15em", cursor: "pointer" }}>
              🚨 ENVOYER L'ALERTE
            </button>
          </div>
        </div>
      </div>

      {/* Journal alertes */}
      <div className="sensor-wrapper">
        <div className="sensor-header"><span className="sensor-title">JOURNAL // ALERTES</span><span className="camera-tag">{alertes.length} ENTRÉES</span></div>
        {alertes.length === 0 && <div style={{ padding: "16px", fontSize: "10px", color: "var(--text-muted)", letterSpacing: "0.08em" }}>— AUCUNE ALERTE —</div>}
        {alertes.map(al => (
          <div key={al.id} style={{ display: "flex", gap: "12px", alignItems: "flex-start", padding: "10px 16px", borderBottom: "1px solid var(--border-subtle)", background: al.lu ? "transparent" : "rgba(255,68,68,0.04)" }}>
            <span style={{ fontSize: "10px", color: "var(--text-muted)", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>[{al.time}]</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "11px", color: al.lu ? "var(--text-muted)" : "var(--text-primary)", marginBottom: "2px" }}>{al.message}</div>
              <div style={{ fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.06em" }}>DE: {al.expediteur}{al.latitude ? ` // GPS: ${al.latitude.toFixed(4)}, ${al.longitude?.toFixed(4)}` : ""}</div>
            </div>
            {!al.lu && (
              <button onClick={() => setAlertes(a => a.map(x => x.id === al.id ? { ...x, lu: true } : x))}
                style={{ background: "rgba(0,255,136,0.08)", border: "1px solid rgba(0,255,136,0.3)", borderRadius: "3px", padding: "3px 10px", color: "var(--accent-success)", fontFamily: "var(--font-mono)", fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em", cursor: "pointer", whiteSpace: "nowrap" }}>
                ACK
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
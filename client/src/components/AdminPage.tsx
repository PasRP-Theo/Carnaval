import { useEffect, useState, useCallback } from "react";
import MapChars from "./MapChars";

// ─── Types ───────────────────────────────────────────────
interface Char { id: number; nom: string; description?: string; statut?: "actif" | "arrêté"; vitesse?: number; participants?: number; latitude?: number; longitude?: number; batterie?: number; gps_signal?: boolean; updated_at?: string; created_at?: string; }
interface Benevole { id: number; nom: string; role: string; zone: string; present: boolean; }
interface Forain { id: number; nom: string; contact: string; emplacement: string; paye: boolean; }
interface Alerte { id: number; message: string; expediteur: string; time: string; lu: boolean; }
interface AdminStats { chars_actifs: number; chars_total: number; benevoles: number; forains: number; inscriptions: number; alertes: number; votes_total: number; photos: number; }
interface AuthUser { username: string; role: string; displayName: string; }

// ─── Constantes ───────────────────────────────────────────
const TABS = ["DASHBOARD", "GPS // CHARS", "BÉNÉVOLES", "INSCRIPTIONS", "FORAINS", "ÉQUIPEMENTS"];
const TOKEN_KEY = "carnaval_admin_token";

const DEMO_CHARS: Char[] = [
  { id: 1, nom: "Char des Lions",  statut: "actif",   vitesse: 4, latitude: 50.4672, longitude: 4.8678, batterie: 87, gps_signal: true  },
  { id: 2, nom: "Char des Aigles", statut: "actif",   vitesse: 3, latitude: 50.4655, longitude: 4.8650, batterie: 62, gps_signal: true  },
  { id: 3, nom: "Char des Fous",   statut: "arrêté",  vitesse: 0, latitude: 50.4640, longitude: 4.8630, batterie: 15, gps_signal: false },
];
const DEMO_STATS: AdminStats = { chars_actifs: 2, chars_total: 3, benevoles: 2, forains: 2, inscriptions: 0, alertes: 1, votes_total: 0, photos: 0 };

const battColor = (v: number) => v > 30 ? "var(--accent-success)" : v > 15 ? "#ffaa00" : "var(--accent-error)";

// ─── Input style ──────────────────────────────────────────
const iStyle: React.CSSProperties = {
  background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: "3px",
  padding: "7px 10px", color: "var(--text-primary)", fontFamily: "var(--font-mono)",
  fontSize: "11px", outline: "none", flex: 1,
};

// ═══════════════════════════════════════════════════════════
//  COMPOSANT LOGIN ADMIN
// ═══════════════════════════════════════════════════════════
function AdminLogin({ onLogin, errorMessage }: { onLogin: (user: AuthUser, token: string) => void; errorMessage?: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  const handleLogin = async () => {
    if (!username || !password) return setError("Tous les champs sont requis");
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Identifiants incorrects"); return; }
      sessionStorage.setItem(TOKEN_KEY, data.token);
      onLogin({ username, role: data.role, displayName: data.displayName }, data.token);
    } catch {
      setError("Serveur inaccessible");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-title">ADMIN // ACCÈS RESTREINT</div>
          <div className="auth-subtitle">Panneau de contrôle — authentification requise</div>
        </div>
        <div className="auth-form">
          <div>
            <label className="auth-label">IDENTIFIANT</label>
            <input value={username} onChange={e => setUsername(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              placeholder="ex: admin" className="auth-input" autoComplete="username" />
          </div>
          <div>
            <label className="auth-label">MOT DE PASSE</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              placeholder="••••••••" className="auth-input" autoComplete="current-password" />
          </div>
          {(error || errorMessage) && <div className="auth-error">{error || errorMessage}</div>}
          <button onClick={handleLogin} className="auth-button" disabled={loading}>
            {loading ? "CONNEXION…" : "ACCÉDER →"}
          </button>
          <div className="auth-hint">admin / carnaval2026 · comite / comite2026</div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  COMPOSANT PRINCIPAL ADMIN
// ═══════════════════════════════════════════════════════════
export default function AdminPage() {
  const [user,      setUser]      = useState<AuthUser | null>(null);
  const [token,     setToken]     = useState<string>("");
  const [tab,       setTab]       = useState(0);
  const [stats,     setStats]     = useState<AdminStats>(DEMO_STATS);
  const [chars,     setChars]     = useState<Char[]>(DEMO_CHARS);
  const [benevoles, setBenevoles] = useState<Benevole[]>([]);
  const [forains,   setForains]   = useState<Forain[]>([]);
  const [alertes,   setAlertes]   = useState<Alerte[]>([]);
  const [authError, setAuthError] = useState("");
  const [newBen,    setNewBen]    = useState({ nom: "", role: "", zone: "" });
  const [newFor,    setNewFor]    = useState({ nom: "", contact: "", emplacement: "" });
  const [newChar,   setNewChar]   = useState({ nom: "", description: "", vitesse: 0, participants: 0 });

  // ── Headers auth ─────────────────────────────────────────
  const ah = useCallback(() => ({
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  }), [token]);

  const handle401 = (message = "Session expirée, reconnectez-vous") => {
    setAuthError(message);
    sessionStorage.removeItem(TOKEN_KEY);
    setToken("");
    setUser(null);
  };

  const parseJson = async (res: Response) => {
    if (res.status === 401) {
      handle401();
      return null;
    }
    return res.json();
  };

  // ── Vérifie token existant au montage ────────────────────
  useEffect(() => {
    const saved = sessionStorage.getItem(TOKEN_KEY);
    if (!saved) return;
    fetch("/api/auth/me", { headers: { "Authorization": `Bearer ${saved}` } })
      .then(async r => {
        if (r.status === 401) {
          handle401();
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then(d => { if (d) { setUser(d); setToken(saved); } })
      .catch(() => { setAuthError("Impossible de contacter le serveur"); });
  }, []);

  // ── Chargement données admin ──────────────────────────────
  useEffect(() => {
    if (!token) return;
    const load = async () => {
      try {
        const headers = ah();
        const [s, c, b, f, a] = await Promise.all([
          fetch("/api/admin/stats",      { headers }).then(parseJson),
          fetch("/api/admin/chariots",   { headers }).then(parseJson),
          fetch("/api/admin/benevoles",  { headers }).then(parseJson),
          fetch("/api/admin/forains",    { headers }).then(parseJson),
          fetch("/api/admin/alertes",    { headers }).then(parseJson),
        ]);
        if (s) setStats(s);
        if (c) setChars(c);
        if (b) setBenevoles(b);
        if (f) setForains(f);
        if (a) setAlertes(a);
      } catch {
        setAuthError("Impossible de charger les données (serveur indisponible)");
      }
    };
    load();
    const iv = setInterval(load, 10000);
    return () => clearInterval(iv);
  }, [token, ah]);

  const handleLogin = (u: AuthUser, t: string) => { setUser(u); setToken(t); setAuthError(""); };

  const handleLogout = async () => {
    try { await fetch("/api/auth/logout", { method: "POST", headers: ah() }); } catch {}
    sessionStorage.removeItem(TOKEN_KEY);
    setUser(null); setToken("");
  };

  const tag = (label: string, color?: string) => (
    <span className="camera-tag" style={color ? { color, borderColor: color } : {}}>{label}</span>
  );

  // ── Login screen ─────────────────────────────────────────
  if (!user) return <AdminLogin onLogin={handleLogin} errorMessage={authError} />;

  // ── Panel principal ───────────────────────────────────────
  return (
    <div className="page-container">

      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">ADMIN // CARNAVAL</div>
          <div className="page-subtitle">Connecté : {user.displayName} · rôle {user.role}</div>
        </div>
        <div className="page-actions">
          {alertes.filter(a => !a.lu).length > 0 &&
            <span className="sensor-badge sensor-badge--alert">{alertes.filter(a => !a.lu).length} ALERTE(S)</span>}
          <button onClick={handleLogout}
            style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: "3px", padding: "5px 12px", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "9px", letterSpacing: "0.1em", cursor: "pointer" }}>
            DÉCONNEXION
          </button>
        </div>
      </div>

      {/* Tabs */}
      <nav className="app-nav" style={{ borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>
        {TABS.map((t, i) => (
          <button key={i} onClick={() => setTab(i)}
            className={`app-nav-link${tab === i ? " active" : ""}`}
            style={{ background: "none", fontFamily: "var(--font-mono)", cursor: "pointer" }}>
            {t}
          </button>
        ))}
      </nav>

      {/* ── DASHBOARD ── */}
      {tab === 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div className="stats-grid">
            {[
              { label: "CHARS ACTIFS",  value: `${stats.chars_actifs}/${stats.chars_total}`, color: "var(--accent-success)"   },
              { label: "BÉNÉVOLES",     value: stats.benevoles,    color: "var(--accent-primary)"  },
              { label: "FORAINS",       value: stats.forains,      color: "var(--accent-secondary)" },
              { label: "INSCRIPTIONS",  value: stats.inscriptions, color: "#9f72df"                },
              { label: "VOTES",         value: stats.votes_total,  color: "var(--accent-warning)"  },
              { label: "ALERTES",       value: stats.alertes,      color: "var(--accent-error)"    },
            ].map((s, i) => (
              <div key={i} className="stat-card" style={{ borderLeft: `3px solid ${s.color}` }}>
                <div className="stat-label">{s.label}</div>
                <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
          <div className="sensor-wrapper">
            <div className="sensor-header"><span className="sensor-title">ALERTES // LOG</span></div>
            {alertes.length === 0 && <div style={{ padding: "16px", fontSize: "10px", color: "var(--text-muted)" }}>— AUCUNE ALERTE —</div>}
            {alertes.map(al => (
              <div key={al.id} className={`alert-item${al.lu ? "" : " alert-item--unread"}`}>
                <span className="alert-time" style={{ color: al.lu ? "var(--text-muted)" : "var(--accent-error)" }}>[{al.time}]</span>
                <span className="alert-message" style={{ flex: 1, color: al.lu ? "var(--text-muted)" : "var(--text-primary)" }}>{al.message}</span>
                {!al.lu && (
                  <button onClick={async () => {
                    try { await fetch(`/api/admin/alertes/${al.id}/lu`, { method: "PATCH", headers: ah() }); } catch {}
                    setAlertes(a => a.map(x => x.id === al.id ? { ...x, lu: true } : x));
                  }} className="btn btn-success">ACK</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── GPS CHARS ── */}
      {tab === 1 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div className="sensor-wrapper">
            <div className="sensor-header"><span className="sensor-title">CARTE // GPS</span></div>
            <div style={{ padding: "12px" }}><MapChars /></div>
          </div>
          <div className="sensor-wrapper">
            <div className="sensor-header"><span className="sensor-title">ÉTAT // CHARS</span></div>
            <table className="sensor-table">
              <thead><tr>{["CHAR", "GPS", "BATTERIE", "VITESSE", "STATUT", ""].map(h => <th key={h} className="sensor-th">{h}</th>)}</tr></thead>
              <tbody>
                {chars.map((c, i) => (
                  <tr key={c.id} className={i % 2 === 0 ? "sensor-tr--odd" : "sensor-tr--even"}>
                    <td className="sensor-td"><span className="sensor-name" style={{ fontWeight: 600 }}>{c.nom}</span></td>
                    <td className="sensor-td"><span className={`sensor-badge ${c.gps_signal ? "sensor-badge--ok" : "sensor-badge--alert"}`}><span className="sensor-badge-dot" />{c.gps_signal ? "OK" : "KO"}</span></td>
                    <td className="sensor-td">
                      <div className="battery-container">
                        <div className="battery-bar"><div className="battery-fill" style={{ width: `${c.batterie}%`, background: battColor(c.batterie ?? 0) }} /></div>
                        <span className="battery-percent" style={{ color: battColor(c.batterie ?? 0) }}>{c.batterie}%</span>
                      </div>
                    </td>
                    <td className="sensor-td"><span className="sensor-value">{c.vitesse} km/h</span></td>
                    <td className="sensor-td"><span className={`sensor-badge ${c.statut === "actif" ? "sensor-badge--ok" : "sensor-badge--alert"}`}><span className="sensor-badge-dot" />{c.statut ? c.statut.toUpperCase() : "—"}</span></td>
                    <td className="sensor-td">
                      <button onClick={async () => {
                        const newStatut = c.statut === "actif" ? "arrêté" : "actif";
                        try { await fetch(`/api/admin/chars/${c.id}`, { method: "PATCH", headers: ah(), body: JSON.stringify({ statut: newStatut }) }); } catch {}
                        setChars(prev => prev.map(x => x.id === c.id ? { ...x, statut: newStatut } : x));
                      }} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: "3px", padding: "4px 10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "9px", cursor: "pointer" }}>
                        {c.statut === "actif" ? "ARRÊTER" : "ACTIVER"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── BÉNÉVOLES ── */}
      {tab === 2 && (
        <div className="sensor-wrapper">
          <div className="sensor-header"><span className="sensor-title">BÉNÉVOLES // GESTION</span>{tag(`${benevoles.length} BÉNÉVOLES`)}</div>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <input placeholder="Nom" value={newBen.nom} onChange={e => setNewBen(b => ({ ...b, nom: e.target.value }))} style={iStyle} />
            <input placeholder="Rôle" value={newBen.role} onChange={e => setNewBen(b => ({ ...b, role: e.target.value }))} style={iStyle} />
            <input placeholder="Zone" value={newBen.zone} onChange={e => setNewBen(b => ({ ...b, zone: e.target.value }))} style={iStyle} />
            <button onClick={async () => {
              if (!newBen.nom) return;
              try {
                const res = await fetch("/api/admin/benevoles", { method: "POST", headers: ah(), body: JSON.stringify(newBen) });
                const b = await res.json();
                setBenevoles(prev => [...prev, b]);
              } catch { setBenevoles(prev => [...prev, { ...newBen, id: Date.now(), present: false }]); }
              setNewBen({ nom: "", role: "", zone: "" });
            }} className="btn btn-primary">+ AJOUTER</button>
          </div>
          <table className="sensor-table">
            <thead><tr>{["NOM", "RÔLE", "ZONE", "PRÉSENCE", ""].map(h => <th key={h} className="sensor-th">{h}</th>)}</tr></thead>
            <tbody>
              {benevoles.map((b, i) => (
                <tr key={b.id} className={i % 2 === 0 ? "sensor-tr--odd" : "sensor-tr--even"}>
                  <td className="sensor-td"><span className="sensor-name" style={{ fontWeight: 600 }}>{b.nom}</span></td>
                  <td className="sensor-td"><span className="sensor-name">{b.role}</span></td>
                  <td className="sensor-td"><span className="sensor-name">{b.zone}</span></td>
                  <td className="sensor-td">
                    <button onClick={async () => {
                      try { await fetch(`/api/admin/benevoles/${b.id}`, { method: "PATCH", headers: ah(), body: JSON.stringify({ present: !b.present }) }); } catch {}
                      setBenevoles(prev => prev.map(x => x.id === b.id ? { ...x, present: !x.present } : x));
                    }} className={`sensor-badge ${b.present ? "sensor-badge--ok" : "sensor-badge--alert"}`} style={{ cursor: "pointer", background: "none" }}>
                      <span className="sensor-badge-dot" />{b.present ? "PRÉSENT" : "ABSENT"}
                    </button>
                  </td>
                  <td className="sensor-td">
                    <button onClick={async () => {
                      try { await fetch(`/api/admin/benevoles/${b.id}`, { method: "DELETE", headers: ah() }); } catch {}
                      setBenevoles(prev => prev.filter(x => x.id !== b.id));
                    }} style={{ background: "transparent", border: "1px solid rgba(255,68,68,0.3)", borderRadius: "3px", padding: "3px 8px", color: "var(--accent-error)", fontFamily: "var(--font-mono)", fontSize: "9px", cursor: "pointer" }}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── INSCRIPTIONS ── */}
      {tab === 3 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Chariots */}
          <div className="sensor-wrapper">
            <div className="sensor-header"><span className="sensor-title">CHARIOTS // INSCRIPTIONS</span>{tag(`${chars.length} CHARS`)}</div>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "grid", gap: "12px", maxWidth: "400px" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--text-primary)", marginBottom: "4px" }}>
                  NOM DU CHAR * (requis) — Identifiant principal du chariot
                </label>
                <input placeholder="ex: Char des Lions" value={newChar.nom} onChange={e => setNewChar(c => ({ ...c, nom: e.target.value }))} style={iStyle} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--text-primary)", marginBottom: "4px" }}>
                  DESCRIPTION (optionnel) — Brève description du thème ou du char
                </label>
                <input placeholder="ex: Thème samba tropical" value={newChar.description} onChange={e => setNewChar(c => ({ ...c, description: e.target.value }))} style={iStyle} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--text-primary)", marginBottom: "4px" }}>
                  VITESSE (optionnel) — Vitesse actuelle en km/h pour le suivi
                </label>
                <input type="number" placeholder="ex: 4" value={newChar.vitesse} onChange={e => setNewChar(c => ({ ...c, vitesse: Number(e.target.value) }))} style={iStyle} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--text-primary)", marginBottom: "4px" }}>
                  PARTICIPANTS (optionnel) — Nombre de personnes sur le char
                </label>
                <input type="number" placeholder="ex: 12" value={newChar.participants} onChange={e => setNewChar(c => ({ ...c, participants: Number(e.target.value) }))} style={iStyle} />
              </div>
              <button onClick={async () => {
                if (!newChar.nom) return;
                try {
                  const res = await fetch("/api/admin/chariots", { method: "POST", headers: ah(), body: JSON.stringify(newChar) });
                  const c = await res.json();
                  setChars(prev => [...prev, c]);
                } catch {
                  setChars(prev => [...prev, { ...newChar, id: Date.now(), updated_at: new Date().toISOString() }]);
                }
                setNewChar({ nom: "", description: "", vitesse: 0, participants: 0 });
              }} className="btn btn-primary">+ INSCRIRE</button>
            </div>
            <table className="sensor-table">
              <thead><tr>{["NOM", "DESCRIPTION", "DATE INSCRIPTION", ""].map(h => <th key={h} className="sensor-th">{h}</th>)}</tr></thead>
              <tbody>
                {chars.map((c, i) => (
                  <tr key={c.id} className={i % 2 === 0 ? "sensor-tr--odd" : "sensor-tr--even"}>
                    <td className="sensor-td"><span className="sensor-name" style={{ fontWeight: 600 }}>{c.nom}</span></td>
                    <td className="sensor-td"><span className="sensor-name">{c.description || "—"}</span></td>
                          <td className="sensor-td"><span className="sensor-name">{c.updated_at ? new Date(c.updated_at).toLocaleDateString() : "—"}</span></td>
                    <td className="sensor-td">
                      <button onClick={async () => {
                        try { await fetch(`/api/admin/chariots/${c.id}`, { method: "DELETE", headers: ah() }); } catch {}
                        setChars(prev => prev.filter(x => x.id !== c.id));
                      }} style={{ background: "transparent", border: "1px solid rgba(255,68,68,0.3)", borderRadius: "3px", padding: "3px 8px", color: "var(--accent-error)", fontFamily: "var(--font-mono)", fontSize: "9px", cursor: "pointer" }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── FORAINS ── */}
      {tab === 4 && (
        <div className="sensor-wrapper">
          <div className="sensor-header"><span className="sensor-title">FORAINS // GESTION</span>{tag(`${forains.length} FORAINS`)}</div>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <input placeholder="Nom" value={newFor.nom} onChange={e => setNewFor(f => ({ ...f, nom: e.target.value }))} style={iStyle} />
            <input placeholder="Contact" value={newFor.contact} onChange={e => setNewFor(f => ({ ...f, contact: e.target.value }))} style={iStyle} />
            <input placeholder="Emplacement" value={newFor.emplacement} onChange={e => setNewFor(f => ({ ...f, emplacement: e.target.value }))} style={iStyle} />
            <button onClick={async () => {
              if (!newFor.nom) return;
              try {
                const res = await fetch("/api/admin/forains", { method: "POST", headers: ah(), body: JSON.stringify(newFor) });
                const f = await res.json();
                setForains(prev => [...prev, f]);
              } catch { setForains(prev => [...prev, { ...newFor, id: Date.now(), paye: false }]); }
              setNewFor({ nom: "", contact: "", emplacement: "" });
            }} className="btn btn-primary">+ AJOUTER</button>
          </div>
          <table className="sensor-table">
            <thead><tr>{["NOM", "CONTACT", "EMPLACEMENT", "PAIEMENT", ""].map(h => <th key={h} className="sensor-th">{h}</th>)}</tr></thead>
            <tbody>
              {forains.map((f, i) => (
                <tr key={f.id} className={i % 2 === 0 ? "sensor-tr--odd" : "sensor-tr--even"}>
                  <td className="sensor-td"><span className="sensor-name" style={{ fontWeight: 600 }}>{f.nom}</span></td>
                  <td className="sensor-td"><span className="sensor-name">{f.contact}</span></td>
                  <td className="sensor-td"><span className="sensor-name">{f.emplacement}</span></td>
                  <td className="sensor-td">
                    <button onClick={async () => {
                      try { await fetch(`/api/admin/forains/${f.id}`, { method: "PATCH", headers: ah(), body: JSON.stringify({ paye: !f.paye }) }); } catch {}
                      setForains(prev => prev.map(x => x.id === f.id ? { ...x, paye: !x.paye } : x));
                    }} className={`sensor-badge ${f.paye ? "sensor-badge--ok" : "sensor-badge--alert"}`} style={{ cursor: "pointer", background: "none" }}>
                      <span className="sensor-badge-dot" />{f.paye ? "PAYÉ" : "EN ATTENTE"}
                    </button>
                  </td>
                  <td className="sensor-td">
                    <button onClick={async () => {
                      try { await fetch(`/api/admin/forains/${f.id}`, { method: "DELETE", headers: ah() }); } catch {}
                      setForains(prev => prev.filter(x => x.id !== f.id));
                    }} style={{ background: "transparent", border: "1px solid rgba(255,68,68,0.3)", borderRadius: "3px", padding: "3px 8px", color: "var(--accent-error)", fontFamily: "var(--font-mono)", fontSize: "9px", cursor: "pointer" }}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── ÉQUIPEMENTS ── */}
      {tab === 5 && (
        <div className="sensor-wrapper">
          <div className="sensor-header"><span className="sensor-title">ÉQUIPEMENTS // EMBARQUÉS</span></div>
          <table className="sensor-table">
            <thead><tr>{["CHAR", "GPS", "CAMÉRA", "BATTERIE", "RÉSEAU 4G"].map(h => <th key={h} className="sensor-th">{h}</th>)}</tr></thead>
            <tbody>
              {chars.map((c, i) => (
                <tr key={c.id} className={i % 2 === 0 ? "sensor-tr--odd" : "sensor-tr--even"}>
                  <td className="sensor-td"><span className="sensor-name" style={{ fontWeight: 600 }}>{c.nom}</span></td>
                  {[
                    { ok: c.gps_signal ?? false },
                    { ok: c.statut === "actif" },
                    { ok: (c.batterie ?? 0) > 20, label: `${c.batterie}%` },
                    { ok: c.gps_signal ?? false },
                  ].map((eq, j) => (
                    <td key={j} className="sensor-td">
                      <span className={`sensor-badge ${eq.ok ? "sensor-badge--ok" : "sensor-badge--alert"}`}>
                        <span className="sensor-badge-dot" />{eq.label ?? (eq.ok ? "OK" : "KO")}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Formulaire inscription ───────────────────────────────
function InscriptionForm({ token }: { token: string }) {
  const [form, setForm] = useState({ nom: "", contact: "", nb_personnes: "", description: "", journee: "" });
  const [submitted, setSubmitted] = useState(false);

  const fStyle: React.CSSProperties = {
    background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: "3px",
    padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-mono)",
    fontSize: "12px", outline: "none", width: "100%", boxSizing: "border-box",
  };

  const handleSubmit = async () => {
    if (!form.nom) return;
    try { await fetch("/api/inscriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); } catch {}
    setSubmitted(true);
  };

  if (submitted) return <div className="success-message">✓ INSCRIPTION ENREGISTRÉE</div>;

  return (
    <div style={{ display: "grid", gap: "12px", maxWidth: "480px" }}>
      {[
        { key: "nom",         label: "NOM DU GROUPE",    placeholder: "ex: Association Les Lions" },
        { key: "contact",     label: "CONTACT",          placeholder: "ex: 0470 12 34 56"         },
        { key: "nb_personnes",label: "NB. PARTICIPANTS", placeholder: "ex: 12", type: "number"    },
        { key: "journee",     label: "JOURNÉE",          placeholder: "ex: 15/03/2026"            },
        { key: "description", label: "DESCRIPTION",      placeholder: "Thème du char..."          },
      ].map(f => (
        <div key={f.key}>
          <label className="form-label">{f.label}</label>
          {f.key === "description"
            ? <textarea rows={3} placeholder={f.placeholder} value={(form as any)[f.key]} onChange={e => setForm(x => ({ ...x, [f.key]: e.target.value }))} style={{ ...fStyle, resize: "vertical" }} />
            : <input type={f.type ?? "text"} placeholder={f.placeholder} value={(form as any)[f.key]} onChange={e => setForm(x => ({ ...x, [f.key]: e.target.value }))} style={fStyle} />
          }
        </div>
      ))}
      <button onClick={handleSubmit} className="form-submit">SOUMETTRE L'INSCRIPTION →</button>
    </div>
  );
}
*/
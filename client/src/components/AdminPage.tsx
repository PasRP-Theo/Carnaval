import { useEffect, useState, useCallback } from "react";
import MapChars from "./MapChars";

// ─── Types ───────────────────────────────────────────────
interface Char { id: number; nom: string; description?: string; statut?: "actif" | "arrêté"; vitesse?: number; participants?: number; latitude?: number; longitude?: number; batterie?: number; gps_signal?: boolean; updated_at?: string; created_at?: string; }
interface Benevole { id: number; nom: string; role: string; zone: string; present: boolean; }
interface Forain { id: number; nom: string; contact: string; emplacement: string; paye: boolean; }
interface Alerte { id: number; message: string; expediteur: string; time: string; lu: boolean; }
interface AdminStats { chars_actifs: number; chars_total: number; benevoles: number; forains: number; inscriptions: number; alertes: number; votes_total: number; photos: number; }
interface AuthUser { username: string; role: string; displayName: string; }
interface ChapiteauSettings { id?: number; nom: string; capacite_max: number; personnel_service: number; responsable: string; seuil_litres_alerte: number; seuil_futs_pleins_alerte: number; updated_at?: string; }
interface BeerKeg { id: number; type: string; volume_litres: number; restant_litres: number; statut: "plein" | "entame" | "vide"; emplacement: string; notes?: string; opened_at?: string; closed_at?: string; updated_at?: string; }
interface ChapiteauStats { futs_pleins: number; futs_entames: number; futs_vides: number; futs_utilises: number; litres_restants: number; litres_servis: number; }
interface KegHistoryEntry { id: number; keg_id: number; action: string; actor: string; details?: string; created_at: string; type: string; volume_litres: number; }
interface DrinkStockItem { id: number; nom: string; categorie: string; unite: string; stock_actuel: number; seuil_alerte: number; emplacement: string; updated_at?: string; }

// ─── Constantes ───────────────────────────────────────────
const TABS = ["DASHBOARD", "GPS // CHARS", "BÉNÉVOLES", "INSCRIPTIONS", "FORAINS", "CHAPITEAU", "ÉQUIPEMENTS"];
const TOKEN_KEY = "carnaval_admin_token";

const DEMO_CHARS: Char[] = [
  { id: 1, nom: "Char des Lions",  statut: "actif",   vitesse: 4, latitude: 50.4672, longitude: 4.8678, batterie: 87, gps_signal: true  },
  { id: 2, nom: "Char des Aigles", statut: "actif",   vitesse: 3, latitude: 50.4655, longitude: 4.8650, batterie: 62, gps_signal: true  },
  { id: 3, nom: "Char des Fous",   statut: "arrêté",  vitesse: 0, latitude: 50.4640, longitude: 4.8630, batterie: 15, gps_signal: false },
];
const DEMO_STATS: AdminStats = { chars_actifs: 2, chars_total: 3, benevoles: 2, forains: 2, inscriptions: 0, alertes: 1, votes_total: 0, photos: 0 };
const DEMO_CHAPITEAU_SETTINGS: ChapiteauSettings = { nom: "Chapiteau principal", capacite_max: 320, personnel_service: 8, responsable: "Equipe buvette", seuil_litres_alerte: 45, seuil_futs_pleins_alerte: 2 };
const DEMO_CHAPITEAU_STATS: ChapiteauStats = { futs_pleins: 1, futs_entames: 1, futs_vides: 1, futs_utilises: 1, litres_restants: 68, litres_servis: 62 };
const DEMO_KEGS: BeerKeg[] = [
  { id: 1, type: "Blonde", volume_litres: 50, restant_litres: 50, statut: "plein", emplacement: "Réserve froide" },
  { id: 2, type: "Ambrée", volume_litres: 30, restant_litres: 18, statut: "entame", emplacement: "Bar principal" },
  { id: 3, type: "Blonde", volume_litres: 50, restant_litres: 0, statut: "vide", emplacement: "Zone retour" },
];
const DEMO_KEG_HISTORY: KegHistoryEntry[] = [
  { id: 1, keg_id: 3, action: "remplacement", actor: "Equipe buvette", details: "Fût vidé puis envoyé en retour", created_at: new Date().toISOString(), type: "Blonde", volume_litres: 50 },
];
const DEMO_DRINK_STOCK: DrinkStockItem[] = [
  { id: 1, nom: "Eau plate", categorie: "eau", unite: "bouteilles", stock_actuel: 120, seuil_alerte: 24, emplacement: "Réserve froide" },
  { id: 2, nom: "Coca-Cola", categorie: "soft", unite: "canettes", stock_actuel: 96, seuil_alerte: 18, emplacement: "Bar principal" },
];

const batteryLevel = (value?: number) => {
  if ((value ?? 0) > 30) return "high";
  if ((value ?? 0) > 15) return "medium";
  return "low";
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
  const [chapiteauSettings, setChapiteauSettings] = useState<ChapiteauSettings>(DEMO_CHAPITEAU_SETTINGS);
  const [chapiteauStats, setChapiteauStats] = useState<ChapiteauStats>(DEMO_CHAPITEAU_STATS);
  const [kegs, setKegs] = useState<BeerKeg[]>(DEMO_KEGS);
  const [kegHistory, setKegHistory] = useState<KegHistoryEntry[]>(DEMO_KEG_HISTORY);
  const [drinkStock, setDrinkStock] = useState<DrinkStockItem[]>(DEMO_DRINK_STOCK);
  const [newKeg, setNewKeg] = useState({ type: "Blonde", volume_litres: 50, emplacement: "Réserve chapiteau", notes: "" });
  const [newDrink, setNewDrink] = useState({ nom: "", categorie: "soft", unite: "bouteilles", stock_actuel: 24, seuil_alerte: 6, emplacement: "Réserve chapiteau" });

  // ── Headers auth ─────────────────────────────────────────
  const ah = useCallback(() => ({
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  }), [token]);

  const handle401 = useCallback((message = "Session expirée, reconnectez-vous") => {
    setAuthError(message);
    sessionStorage.removeItem(TOKEN_KEY);
    setToken("");
    setUser(null);
  }, []);

  const parseJson = useCallback(async (res: Response) => {
    if (res.status === 401) {
      handle401();
      return null;
    }
    return res.json();
  }, [handle401]);

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
  }, [handle401]);

  // ── Chargement données admin ──────────────────────────────
  useEffect(() => {
    if (!token) return;
    const load = async () => {
      try {
        const headers = ah();
        const [s, c, b, f, a, chapiteau] = await Promise.all([
          fetch("/api/admin/stats",      { headers }).then(parseJson),
          fetch("/api/admin/chariots",   { headers }).then(parseJson),
          fetch("/api/admin/benevoles",  { headers }).then(parseJson),
          fetch("/api/admin/forains",    { headers }).then(parseJson),
          fetch("/api/admin/alertes",    { headers }).then(parseJson),
          fetch("/api/admin/chapiteau",  { headers }).then(parseJson),
        ]);
        if (s) setStats(s);
        if (c) setChars(c);
        if (b) setBenevoles(b);
        if (f) setForains(f);
        if (a) setAlertes(a);
        if (chapiteau?.settings) setChapiteauSettings(chapiteau.settings);
        if (chapiteau?.stats) setChapiteauStats(chapiteau.stats);
        if (chapiteau?.kegs) setKegs(chapiteau.kegs);
        if (chapiteau?.history) setKegHistory(chapiteau.history);
        if (chapiteau?.stockItems) setDrinkStock(chapiteau.stockItems);
      } catch {
        setAuthError("Impossible de charger les données (serveur indisponible)");
      }
    };
    load();
    const iv = setInterval(load, 10000);
    return () => clearInterval(iv);
  }, [token, ah, parseJson]);

  const handleLogin = (u: AuthUser, t: string) => { setUser(u); setToken(t); setAuthError(""); };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", headers: ah() });
    } catch {
      setAuthError("Déconnexion locale effectuée, serveur indisponible");
    }
    sessionStorage.removeItem(TOKEN_KEY);
    setUser(null); setToken("");
  };

  const tag = (label: string) => (
    <span className="camera-tag">{label}</span>
  );

  const refreshChapiteau = async () => {
    try {
      const res = await fetch("/api/admin/chapiteau", { headers: ah() });
      const data = await parseJson(res);
      if (data?.settings) setChapiteauSettings(data.settings);
      if (data?.stats) setChapiteauStats(data.stats);
      if (data?.kegs) setKegs(data.kegs);
      if (data?.history) setKegHistory(data.history);
      if (data?.stockItems) setDrinkStock(data.stockItems);
    } catch {
      setAuthError("Impossible d'actualiser le chapiteau");
    }
  };

  const cycleKegStatus = async (keg: BeerKeg) => {
    const nextStatus = keg.statut === "plein" ? "entame" : keg.statut === "entame" ? "vide" : "plein";
    const nextRemaining = nextStatus === "plein" ? keg.volume_litres : nextStatus === "vide" ? 0 : Math.max(1, Math.round(keg.volume_litres * 0.5));
    try {
      await fetch(`/api/admin/chapiteau/kegs/${keg.id}`, {
        method: "PATCH",
        headers: ah(),
        body: JSON.stringify({ statut: nextStatus, restant_litres: nextRemaining }),
      });
      await refreshChapiteau();
    } catch {
      setAuthError("Mise à jour du fût impossible");
    }
  };

  const saveChapiteauSettings = async () => {
    try {
      await fetch("/api/admin/chapiteau/settings", {
        method: "PATCH",
        headers: ah(),
        body: JSON.stringify(chapiteauSettings),
      });
      await refreshChapiteau();
    } catch {
      setAuthError("Enregistrement du chapiteau impossible");
    }
  };

  const addKeg = async () => {
    try {
      await fetch("/api/admin/chapiteau/kegs", {
        method: "POST",
        headers: ah(),
        body: JSON.stringify(newKeg),
      });
      setNewKeg({ type: "Blonde", volume_litres: 50, emplacement: "Réserve chapiteau", notes: "" });
      await refreshChapiteau();
    } catch {
      setAuthError("Ajout du fût impossible");
    }
  };

  const addDrinkItem = async () => {
    if (!newDrink.nom) return;
    try {
      await fetch("/api/admin/chapiteau/stock", {
        method: "POST",
        headers: ah(),
        body: JSON.stringify(newDrink),
      });
      setNewDrink({ nom: "", categorie: "soft", unite: "bouteilles", stock_actuel: 24, seuil_alerte: 6, emplacement: "Réserve chapiteau" });
      await refreshChapiteau();
    } catch {
      setAuthError("Ajout du stock boisson impossible");
    }
  };

  const adjustDrinkStock = async (item: DrinkStockItem, delta: number) => {
    try {
      await fetch(`/api/admin/chapiteau/stock/${item.id}`, {
        method: "PATCH",
        headers: ah(),
        body: JSON.stringify({ stock_actuel: Math.max(0, item.stock_actuel + delta) }),
      });
      await refreshChapiteau();
    } catch {
      setAuthError("Mise à jour du stock boisson impossible");
    }
  };

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
          <button onClick={handleLogout} className="admin-ghost-btn">
            DÉCONNEXION
          </button>
        </div>
      </div>

      {/* Tabs */}
      <nav className="app-nav section-nav">
        {TABS.map((t, i) => (
          <button key={i} onClick={() => setTab(i)}
            className={`app-nav-link section-nav-link${tab === i ? " active" : ""}`}>
            {t}
          </button>
        ))}
      </nav>

      {/* ── DASHBOARD ── */}
      {tab === 0 && (
        <div className="admin-stack">
          <div className="stats-grid">
            {[
              { label: "CHARS ACTIFS",  value: `${stats.chars_actifs}/${stats.chars_total}`, tone: "success"   },
              { label: "BÉNÉVOLES",     value: stats.benevoles,    tone: "primary"  },
              { label: "FORAINS",       value: stats.forains,      tone: "secondary" },
              { label: "INSCRIPTIONS",  value: stats.inscriptions, tone: "violet"    },
              { label: "VOTES",         value: stats.votes_total,  tone: "warning"   },
              { label: "ALERTES",       value: stats.alertes,      tone: "error"     },
            ].map((s, i) => (
              <div key={i} className={`stat-card admin-stat-card admin-stat-card--${s.tone}`}>
                <div className="stat-label">{s.label}</div>
                <div className="stat-value admin-stat-value">{s.value}</div>
              </div>
            ))}
          </div>
          <div className="sensor-wrapper">
            <div className="sensor-header"><span className="sensor-title">ALERTES // LOG</span></div>
            {alertes.length === 0 && <div className="admin-empty-state">— AUCUNE ALERTE —</div>}
            {alertes.map(al => (
              <div key={al.id} className={`alert-item${al.lu ? "" : " alert-item--unread"}`}>
                <span className={`alert-time ${al.lu ? "admin-alert-time--read" : "admin-alert-time--unread"}`}>[{al.time}]</span>
                <span className={`alert-message admin-alert-message ${al.lu ? "admin-alert-message--read" : "admin-alert-message--unread"}`}>{al.message}</span>
                {!al.lu && (
                  <button onClick={async () => {
                    try {
                      await fetch(`/api/admin/alertes/${al.id}/lu`, { method: "PATCH", headers: ah() });
                    } catch {
                      setAuthError("Synchronisation des alertes impossible");
                    }
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
        <div className="admin-stack">
          <div className="sensor-wrapper">
            <div className="sensor-header"><span className="sensor-title">CARTE // GPS</span></div>
            <div className="admin-map-wrap"><MapChars /></div>
          </div>
          <div className="sensor-wrapper">
            <div className="sensor-header"><span className="sensor-title">ÉTAT // CHARS</span></div>
            <table className="sensor-table">
              <thead><tr>{["CHAR", "GPS", "BATTERIE", "VITESSE", "STATUT", ""].map(h => <th key={h} className="sensor-th">{h}</th>)}</tr></thead>
              <tbody>
                {chars.map((c, i) => (
                  <tr key={c.id} className={i % 2 === 0 ? "sensor-tr--odd" : "sensor-tr--even"}>
                    <td className="sensor-td"><span className="sensor-name admin-name-strong">{c.nom}</span></td>
                    <td className="sensor-td"><span className={`sensor-badge ${c.gps_signal ? "sensor-badge--ok" : "sensor-badge--alert"}`}><span className="sensor-badge-dot" />{c.gps_signal ? "OK" : "KO"}</span></td>
                    <td className="sensor-td">
                      <div className="battery-container">
                        <progress className={`battery-progress battery-progress--${batteryLevel(c.batterie)}`} max={100} value={c.batterie ?? 0} />
                        <span className={`battery-percent battery-percent--${batteryLevel(c.batterie)}`}>{c.batterie ?? 0}%</span>
                      </div>
                    </td>
                    <td className="sensor-td"><span className="sensor-value">{c.vitesse} km/h</span></td>
                    <td className="sensor-td"><span className={`sensor-badge ${c.statut === "actif" ? "sensor-badge--ok" : "sensor-badge--alert"}`}><span className="sensor-badge-dot" />{c.statut ? c.statut.toUpperCase() : "—"}</span></td>
                    <td className="sensor-td">
                      <button onClick={async () => {
                        const newStatut = c.statut === "actif" ? "arrêté" : "actif";
                        try {
                          await fetch(`/api/admin/chars/${c.id}`, { method: "PATCH", headers: ah(), body: JSON.stringify({ statut: newStatut }) });
                        } catch {
                          setAuthError("Impossible de mettre à jour le statut du char");
                        }
                        setChars(prev => prev.map(x => x.id === c.id ? { ...x, statut: newStatut } : x));
                      }} className="admin-ghost-btn admin-ghost-btn--small">
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
          <div className="admin-toolbar">
            <input placeholder="Nom" value={newBen.nom} onChange={e => setNewBen(b => ({ ...b, nom: e.target.value }))} className="admin-inline-input" />
            <input placeholder="Rôle" value={newBen.role} onChange={e => setNewBen(b => ({ ...b, role: e.target.value }))} className="admin-inline-input" />
            <input placeholder="Zone" value={newBen.zone} onChange={e => setNewBen(b => ({ ...b, zone: e.target.value }))} className="admin-inline-input" />
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
                  <td className="sensor-td"><span className="sensor-name admin-name-strong">{b.nom}</span></td>
                  <td className="sensor-td"><span className="sensor-name">{b.role}</span></td>
                  <td className="sensor-td"><span className="sensor-name">{b.zone}</span></td>
                  <td className="sensor-td">
                    <button onClick={async () => {
                      try {
                        await fetch(`/api/admin/benevoles/${b.id}`, { method: "PATCH", headers: ah(), body: JSON.stringify({ present: !b.present }) });
                      } catch {
                        setAuthError("Impossible de mettre à jour le bénévole");
                      }
                      setBenevoles(prev => prev.map(x => x.id === b.id ? { ...x, present: !x.present } : x));
                    }} className={`sensor-badge admin-chip-button ${b.present ? "sensor-badge--ok" : "sensor-badge--alert"}`}>
                      <span className="sensor-badge-dot" />{b.present ? "PRÉSENT" : "ABSENT"}
                    </button>
                  </td>
                  <td className="sensor-td">
                    <button onClick={async () => {
                      try {
                        await fetch(`/api/admin/benevoles/${b.id}`, { method: "DELETE", headers: ah() });
                      } catch {
                        setAuthError("Suppression du bénévole non confirmée par le serveur");
                      }
                      setBenevoles(prev => prev.filter(x => x.id !== b.id));
                    }} className="admin-delete-btn">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── INSCRIPTIONS ── */}
      {tab === 3 && (
        <div className="admin-stack">
          {/* Chariots */}
          <div className="sensor-wrapper">
            <div className="sensor-header"><span className="sensor-title">CHARIOTS // INSCRIPTIONS</span>{tag(`${chars.length} CHARS`)}</div>
            <div className="admin-form-grid">
              <div>
                <label className="admin-field-label">
                  NOM DU CHAR * (requis) — Identifiant principal du chariot
                </label>
                <input placeholder="ex: Char des Lions" value={newChar.nom} onChange={e => setNewChar(c => ({ ...c, nom: e.target.value }))} className="admin-inline-input" />
              </div>
              <div>
                <label className="admin-field-label">
                  DESCRIPTION (optionnel) — Brève description du thème ou du char
                </label>
                <input placeholder="ex: Thème samba tropical" value={newChar.description} onChange={e => setNewChar(c => ({ ...c, description: e.target.value }))} className="admin-inline-input" />
              </div>
              <div>
                <label className="admin-field-label">
                  VITESSE (optionnel) — Vitesse actuelle en km/h pour le suivi
                </label>
                <input type="number" placeholder="ex: 4" value={newChar.vitesse} onChange={e => setNewChar(c => ({ ...c, vitesse: Number(e.target.value) }))} className="admin-inline-input" />
              </div>
              <div>
                <label className="admin-field-label">
                  PARTICIPANTS (optionnel) — Nombre de personnes sur le char
                </label>
                <input type="number" placeholder="ex: 12" value={newChar.participants} onChange={e => setNewChar(c => ({ ...c, participants: Number(e.target.value) }))} className="admin-inline-input" />
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
                    <td className="sensor-td"><span className="sensor-name admin-name-strong">{c.nom}</span></td>
                    <td className="sensor-td"><span className="sensor-name">{c.description || "—"}</span></td>
                    <td className="sensor-td"><span className="sensor-name">{c.updated_at ? new Date(c.updated_at).toLocaleDateString() : "—"}</span></td>
                    <td className="sensor-td">
                      <button onClick={async () => {
                        try {
                          await fetch(`/api/admin/chariots/${c.id}`, { method: "DELETE", headers: ah() });
                        } catch {
                          setAuthError("Suppression du char non confirmée par le serveur");
                        }
                        setChars(prev => prev.filter(x => x.id !== c.id));
                      }} className="admin-delete-btn">✕</button>
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
          <div className="admin-toolbar">
            <input placeholder="Nom" value={newFor.nom} onChange={e => setNewFor(f => ({ ...f, nom: e.target.value }))} className="admin-inline-input" />
            <input placeholder="Contact" value={newFor.contact} onChange={e => setNewFor(f => ({ ...f, contact: e.target.value }))} className="admin-inline-input" />
            <input placeholder="Emplacement" value={newFor.emplacement} onChange={e => setNewFor(f => ({ ...f, emplacement: e.target.value }))} className="admin-inline-input" />
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
                  <td className="sensor-td"><span className="sensor-name admin-name-strong">{f.nom}</span></td>
                  <td className="sensor-td"><span className="sensor-name">{f.contact}</span></td>
                  <td className="sensor-td"><span className="sensor-name">{f.emplacement}</span></td>
                  <td className="sensor-td">
                    <button onClick={async () => {
                      try {
                        await fetch(`/api/admin/forains/${f.id}`, { method: "PATCH", headers: ah(), body: JSON.stringify({ paye: !f.paye }) });
                      } catch {
                        setAuthError("Impossible de mettre à jour le paiement du forain");
                      }
                      setForains(prev => prev.map(x => x.id === f.id ? { ...x, paye: !x.paye } : x));
                    }} className={`sensor-badge admin-chip-button ${f.paye ? "sensor-badge--ok" : "sensor-badge--alert"}`}>
                      <span className="sensor-badge-dot" />{f.paye ? "PAYÉ" : "EN ATTENTE"}
                    </button>
                  </td>
                  <td className="sensor-td">
                    <button onClick={async () => {
                      try {
                        await fetch(`/api/admin/forains/${f.id}`, { method: "DELETE", headers: ah() });
                      } catch {
                        setAuthError("Suppression du forain non confirmée par le serveur");
                      }
                      setForains(prev => prev.filter(x => x.id !== f.id));
                    }} className="admin-delete-btn">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── CHAPITEAU ── */}
      {tab === 5 && (
        <div className="admin-stack">
          <div className="stats-grid">
            {[
              { label: "FÛTS UTILISÉS", value: chapiteauStats.futs_utilises, tone: "warning" },
              { label: "FÛTS PLEINS", value: chapiteauStats.futs_pleins, tone: "success" },
              { label: "FÛTS ENTAMÉS", value: chapiteauStats.futs_entames, tone: "primary" },
              { label: "LITRES RESTANTS", value: `${Math.round(chapiteauStats.litres_restants)} L`, tone: "secondary" },
              { label: "LITRES SERVIS", value: `${Math.round(chapiteauStats.litres_servis)} L`, tone: "error" },
              { label: "CAPACITÉ", value: `${chapiteauSettings.capacite_max} pers.`, tone: "violet" },
            ].map((s, i) => (
              <div key={i} className={`stat-card admin-stat-card admin-stat-card--${s.tone}`}>
                <div className="stat-label">{s.label}</div>
                <div className="stat-value admin-stat-value">{s.value}</div>
              </div>
            ))}
          </div>

          <div className="sensor-wrapper">
            <div className="sensor-header"><span className="sensor-title">CHAPITEAU // PARAMÈTRES</span>{tag(chapiteauSettings.nom)}</div>
            <div className="admin-form-grid admin-form-grid--wide">
              <div>
                <label className="admin-field-label">Nom du chapiteau</label>
                <input value={chapiteauSettings.nom} onChange={e => setChapiteauSettings(current => ({ ...current, nom: e.target.value }))} placeholder="Nom du chapiteau" title="Nom du chapiteau" aria-label="Nom du chapiteau" className="admin-inline-input" />
              </div>
              <div>
                <label className="admin-field-label">Capacité maximale</label>
                <input type="number" value={chapiteauSettings.capacite_max} onChange={e => setChapiteauSettings(current => ({ ...current, capacite_max: Number(e.target.value) }))} placeholder="Capacité maximale" title="Capacité maximale" aria-label="Capacité maximale" className="admin-inline-input" />
              </div>
              <div>
                <label className="admin-field-label">Personnel de service</label>
                <input type="number" value={chapiteauSettings.personnel_service} onChange={e => setChapiteauSettings(current => ({ ...current, personnel_service: Number(e.target.value) }))} placeholder="Personnel de service" title="Personnel de service" aria-label="Personnel de service" className="admin-inline-input" />
              </div>
              <div>
                <label className="admin-field-label">Responsable</label>
                <input value={chapiteauSettings.responsable} onChange={e => setChapiteauSettings(current => ({ ...current, responsable: e.target.value }))} placeholder="Responsable" title="Responsable" aria-label="Responsable du chapiteau" className="admin-inline-input" />
              </div>
              <div>
                <label className="admin-field-label">Seuil litres bière</label>
                <input type="number" value={chapiteauSettings.seuil_litres_alerte} onChange={e => setChapiteauSettings(current => ({ ...current, seuil_litres_alerte: Number(e.target.value) }))} placeholder="Seuil litres bière" title="Seuil litres bière" aria-label="Seuil litres bière" className="admin-inline-input" />
              </div>
              <div>
                <label className="admin-field-label">Seuil fûts pleins</label>
                <input type="number" value={chapiteauSettings.seuil_futs_pleins_alerte} onChange={e => setChapiteauSettings(current => ({ ...current, seuil_futs_pleins_alerte: Number(e.target.value) }))} placeholder="Seuil fûts pleins" title="Seuil fûts pleins" aria-label="Seuil fûts pleins" className="admin-inline-input" />
              </div>
              <button onClick={saveChapiteauSettings} className="btn btn-primary">ENREGISTRER</button>
            </div>
          </div>

          <div className="sensor-wrapper">
            <div className="sensor-header"><span className="sensor-title">BUVETTE // NOUVEAU FÛT</span>{tag("STOCK BIÈRE")}</div>
            <div className="admin-toolbar">
              <input value={newKeg.type} onChange={e => setNewKeg(current => ({ ...current, type: e.target.value }))} placeholder="Type de bière" className="admin-inline-input" />
              <input type="number" value={newKeg.volume_litres} onChange={e => setNewKeg(current => ({ ...current, volume_litres: Number(e.target.value) }))} placeholder="Volume" className="admin-inline-input" />
              <input value={newKeg.emplacement} onChange={e => setNewKeg(current => ({ ...current, emplacement: e.target.value }))} placeholder="Emplacement" className="admin-inline-input" />
              <input value={newKeg.notes} onChange={e => setNewKeg(current => ({ ...current, notes: e.target.value }))} placeholder="Notes" className="admin-inline-input" />
              <button onClick={addKeg} className="btn btn-primary">+ AJOUTER UN FÛT</button>
            </div>
          </div>

          <div className="sensor-wrapper">
            <div className="sensor-header"><span className="sensor-title">FÛTS // SUIVI D'EXPLOITATION</span>{tag(`${kegs.length} FÛTS`)}</div>
            <table className="sensor-table">
              <thead><tr>{["TYPE", "STATUT", "RESTANT", "EMPLACEMENT", "ACTION"].map(h => <th key={h} className="sensor-th">{h}</th>)}</tr></thead>
              <tbody>
                {kegs.map((keg, i) => (
                  <tr key={keg.id} className={i % 2 === 0 ? "sensor-tr--odd" : "sensor-tr--even"}>
                    <td className="sensor-td">
                      <div className="sensor-name admin-name-strong">{keg.type}</div>
                      <div className="public-char-description">{keg.volume_litres} L · {keg.notes || "sans note"}</div>
                    </td>
                    <td className="sensor-td"><span className={`sensor-badge ${keg.statut === "vide" ? "sensor-badge--alert" : keg.statut === "entame" ? "sensor-badge--gold" : "sensor-badge--ok"}`}>{keg.statut.toUpperCase()}</span></td>
                    <td className="sensor-td"><span className="sensor-value">{Math.round(keg.restant_litres)} / {keg.volume_litres} L</span></td>
                    <td className="sensor-td"><span className="sensor-name">{keg.emplacement}</span></td>
                    <td className="sensor-td"><button onClick={() => cycleKegStatus(keg)} className="admin-ghost-btn admin-ghost-btn--small">{keg.statut === "plein" ? "PASSER EN SERVICE" : keg.statut === "entame" ? "MARQUER VIDE" : "RÉAPPROVISIONNER"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="sensor-wrapper">
            <div className="sensor-header"><span className="sensor-title">FÛTS // HISTORIQUE HORODATÉ</span>{tag(`${kegHistory.length} ÉVÉNEMENTS`)}</div>
            <div className="admin-history-list">
              {kegHistory.map(entry => (
                <div key={entry.id} className="admin-history-item">
                  <div className="admin-history-time">{new Date(entry.created_at).toLocaleString()}</div>
                  <div className="admin-history-main">
                    <div className="admin-history-title">{entry.action} · {entry.type} {entry.volume_litres}L</div>
                    <div className="admin-history-copy">Quand: {new Date(entry.created_at).toLocaleString()} · Par: {entry.actor}</div>
                    {entry.details && <div className="public-char-description">{entry.details}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="sensor-wrapper">
            <div className="sensor-header"><span className="sensor-title">SOFTS // EAU</span>{tag(`${drinkStock.length} RÉFÉRENCES`)}</div>
            <div className="admin-toolbar">
              <input value={newDrink.nom} onChange={e => setNewDrink(current => ({ ...current, nom: e.target.value }))} placeholder="Nom boisson" className="admin-inline-input" />
              <select value={newDrink.categorie} onChange={e => setNewDrink(current => ({ ...current, categorie: e.target.value }))} title="Catégorie boisson" aria-label="Catégorie boisson" className="admin-inline-input">
                <option value="soft">Soft</option>
                <option value="eau">Eau</option>
              </select>
              <input value={newDrink.unite} onChange={e => setNewDrink(current => ({ ...current, unite: e.target.value }))} placeholder="Unité" className="admin-inline-input" />
              <input type="number" value={newDrink.stock_actuel} onChange={e => setNewDrink(current => ({ ...current, stock_actuel: Number(e.target.value) }))} placeholder="Stock" className="admin-inline-input" />
              <input type="number" value={newDrink.seuil_alerte} onChange={e => setNewDrink(current => ({ ...current, seuil_alerte: Number(e.target.value) }))} placeholder="Seuil" className="admin-inline-input" />
              <input value={newDrink.emplacement} onChange={e => setNewDrink(current => ({ ...current, emplacement: e.target.value }))} placeholder="Emplacement" className="admin-inline-input" />
              <button onClick={addDrinkItem} className="btn btn-primary">+ AJOUTER BOISSON</button>
            </div>
            <table className="sensor-table">
              <thead><tr>{["ARTICLE", "CATÉGORIE", "STOCK", "SEUIL", "EMPLACEMENT", "ACTIONS"].map(h => <th key={h} className="sensor-th">{h}</th>)}</tr></thead>
              <tbody>
                {drinkStock.map((item, i) => (
                  <tr key={item.id} className={i % 2 === 0 ? "sensor-tr--odd" : "sensor-tr--even"}>
                    <td className="sensor-td"><span className="sensor-name admin-name-strong">{item.nom}</span></td>
                    <td className="sensor-td"><span className="sensor-name">{item.categorie.toUpperCase()}</span></td>
                    <td className="sensor-td"><span className="sensor-value">{item.stock_actuel} {item.unite}</span></td>
                    <td className="sensor-td"><span className={`sensor-badge ${item.stock_actuel <= item.seuil_alerte ? "sensor-badge--alert" : "sensor-badge--ok"}`}>{item.seuil_alerte} {item.unite}</span></td>
                    <td className="sensor-td"><span className="sensor-name">{item.emplacement}</span></td>
                    <td className="sensor-td">
                      <div className="admin-inline-actions">
                        <button onClick={() => adjustDrinkStock(item, -1)} className="admin-delete-btn">-1</button>
                        <button onClick={() => adjustDrinkStock(item, 1)} className="admin-ghost-btn admin-ghost-btn--small">+1</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── ÉQUIPEMENTS ── */}
      {tab === 6 && (
        <div className="sensor-wrapper">
          <div className="sensor-header"><span className="sensor-title">ÉQUIPEMENTS // EMBARQUÉS</span></div>
          <table className="sensor-table">
            <thead><tr>{["CHAR", "GPS", "CAMÉRA", "BATTERIE", "RÉSEAU 4G"].map(h => <th key={h} className="sensor-th">{h}</th>)}</tr></thead>
            <tbody>
              {chars.map((c, i) => (
                <tr key={c.id} className={i % 2 === 0 ? "sensor-tr--odd" : "sensor-tr--even"}>
                  <td className="sensor-td"><span className="sensor-name admin-name-strong">{c.nom}</span></td>
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
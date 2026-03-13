import { useEffect, useState } from "react";
import MapChars from "./MapChars";

interface Char { id: number; nom: string; statut: "actif" | "arrêté"; vitesse?: number; latitude: number; longitude: number; batterie?: number; gps_signal?: boolean; }
interface Benevole { id: number; nom: string; role: string; zone: string; present: boolean; }
interface Forain { id: number; nom: string; contact: string; emplacement: string; paye: boolean; }
interface Alerte { id: number; message: string; expediteur: string; time: string; lu: boolean; }
interface AdminStats { chars_actifs: number; chars_total: number; benevoles: number; forains: number; alertes: number; }

const TABS = ["DASHBOARD", "GPS // CHARS", "BÉNÉVOLES", "INSCRIPTIONS", "FORAINS", "ÉQUIPEMENTS"];
const DEMO_STATS: AdminStats = { chars_actifs: 2, chars_total: 3, benevoles: 2, forains: 2, alertes: 1 };
const DEMO_CHARS: Char[] = [
  { id: 1, nom: "Char des Lions", statut: "actif", vitesse: 4, latitude: 50.4672, longitude: 4.8678, batterie: 87, gps_signal: true },
  { id: 2, nom: "Char des Aigles", statut: "actif", vitesse: 3, latitude: 50.4655, longitude: 4.8650, batterie: 62, gps_signal: true },
  { id: 3, nom: "Char des Fous", statut: "arrêté", vitesse: 0, latitude: 50.4640, longitude: 4.8630, batterie: 15, gps_signal: false },
];
const DEMO_BENEVOLES: Benevole[] = [
  { id: 1, nom: "Marie Dupont", role: "Signaleur", zone: "Rue du Centre", present: true },
  { id: 2, nom: "Jean Martin", role: "Secours", zone: "Place du Marché", present: false },
];
const DEMO_FORAINS: Forain[] = [
  { id: 1, nom: "Manège Étoile", contact: "0470 12 34 56", emplacement: "Place A1", paye: true },
  { id: 2, nom: "Friterie Carnaval", contact: "0489 98 76 54", emplacement: "Place B3", paye: false },
];

const battColor = (v: number) => v > 30 ? "var(--accent-success)" : v > 15 ? "#ffaa00" : "var(--accent-error)";

const iStyle: React.CSSProperties = {
  background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: "3px",
  padding: "7px 10px", color: "var(--text-primary)", fontFamily: "var(--font-mono)",
  fontSize: "11px", outline: "none", flex: 1,
};
const btnPrimary = (color = "var(--accent-primary)"): React.CSSProperties => ({
  background: "var(--nav-active-bg)", border: `1px solid var(--nav-active-border)`,
  borderRadius: "3px", padding: "6px 14px", color, fontFamily: "var(--font-mono)",
  fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em", cursor: "pointer",
});

export default function AdminPage() {
  const [tab, setTab] = useState(0);
  const [stats, setStats] = useState<AdminStats>(DEMO_STATS);
  const [chars, setChars] = useState<Char[]>(DEMO_CHARS);
  const [benevoles, setBenevoles] = useState<Benevole[]>(DEMO_BENEVOLES);
  const [forains, setForains] = useState<Forain[]>(DEMO_FORAINS);
  const [alertes, setAlertes] = useState<Alerte[]>([
    { id: 1, message: "Perte signal GPS — Char des Fous", expediteur: "SYS", time: new Date().toLocaleTimeString(), lu: false },
  ]);
  const [newBen, setNewBen] = useState({ nom: "", role: "", zone: "" });
  const [newFor, setNewFor] = useState({ nom: "", contact: "", emplacement: "" });

  useEffect(() => {
    const load = async () => {
      try {
        const [s, c, b, f] = await Promise.all([
          fetch("/api/admin/stats").then(r => r.json()),
          fetch("/api/chars/positions").then(r => r.json()),
          fetch("/api/admin/benevoles").then(r => r.json()),
          fetch("/api/admin/forains").then(r => r.json()),
        ]);
        setStats(s); setChars(c); setBenevoles(b); setForains(f);
      } catch {}
    };
    load();
    const iv = setInterval(load, 10000);
    return () => clearInterval(iv);
  }, []);

  const tag = (label: string, color?: string) => (
    <span className="camera-tag" style={color ? { color, borderColor: color } : {}}>{label}</span>
  );

  return (
    <div className="page-container">

      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">ADMIN // CARNAVAL</div>
          <div className="page-subtitle">Panneau de contrôle — Accès restreint</div>
        </div>
        {alertes.filter(a => !a.lu).length > 0 && (
          <span className="sensor-badge sensor-badge--alert">{alertes.filter(a => !a.lu).length} ALERTE(S)</span>
        )}
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

      {/* DASHBOARD */}
      {tab === 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div className="stats-grid">
            {[
              { label: "CHARS ACTIFS", value: `${stats.chars_actifs}/${stats.chars_total}`, color: "var(--accent-success)" },
              { label: "BÉNÉVOLES", value: stats.benevoles, color: "var(--accent-primary)" },
              { label: "FORAINS", value: stats.forains, color: "var(--accent-secondary)" },
              { label: "ALERTES", value: alertes.filter(a => !a.lu).length, color: "var(--accent-error)" },
            ].map((s, i) => (
              <div key={i} className="stat-card" style={{ borderLeft: `3px solid ${s.color}` }}>
                <div className="stat-label">{s.label}</div>
                <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          <div className="sensor-wrapper">
            <div className="sensor-header"><span className="sensor-title">ALERTES // LOG</span></div>
            {alertes.map(al => (
              <div key={al.id} className={`alert-item${al.lu ? "" : " alert-item--unread"}`}>
                <span className="alert-time" style={{ color: al.lu ? "var(--text-muted)" : "var(--accent-error)" }}>[{al.time}]</span>
                <span className="alert-message" style={{ color: al.lu ? "var(--text-muted)" : "var(--text-primary)" }}>{al.message}</span>
                {!al.lu && <button onClick={() => setAlertes(a => a.map(x => x.id === al.id ? { ...x, lu: true } : x))} className="btn btn-success">ACK</button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* GPS CHARS */}
      {tab === 1 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div className="sensor-wrapper">
            <div className="sensor-header"><span className="sensor-title">CARTE // GPS</span></div>
            <div className="map-wrapper"><MapChars /></div>
          </div>
          <div className="sensor-wrapper">
            <div className="sensor-header"><span className="sensor-title">ÉTAT // CHARS</span></div>
            <table className="sensor-table">
              <thead><tr>{["CHAR", "GPS", "BATTERIE", "VITESSE", "STATUT"].map(h => <th key={h} className="sensor-th">{h}</th>)}</tr></thead>
              <tbody>
                {chars.map((c, i) => (
                  <tr key={c.id} className={i % 2 === 0 ? "sensor-tr--odd" : "sensor-tr--even"}>
                    <td className="sensor-td"><span className="char-name">{c.nom}</span></td>
                    <td className="sensor-td"><span className={`sensor-badge ${c.gps_signal ? "sensor-badge--ok" : "sensor-badge--alert"}`}><span className="sensor-badge-dot" />{c.gps_signal ? "OK" : "KO"}</span></td>
                    <td className="sensor-td">
                      <div className="battery-container">
                        <div className="battery-bar">
                          <div className="battery-fill" style={{ width: `${c.batterie}%`, background: battColor(c.batterie ?? 0) }} />
                        </div>
                        <span className="battery-percent" style={{ color: battColor(c.batterie ?? 0) }}>{c.batterie}%</span>
                      </div>
                    </td>
                    <td className="sensor-td"><span className="sensor-value">{c.vitesse} km/h</span></td>
                    <td className="sensor-td"><span className={`sensor-badge ${c.statut === "actif" ? "sensor-badge--ok" : "sensor-badge--alert"}`}><span className="sensor-badge-dot" />{c.statut.toUpperCase()}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* BÉNÉVOLES */}
      {tab === 2 && (
        <div className="sensor-wrapper">
          <div className="sensor-header"><span className="sensor-title">BÉNÉVOLES // GESTION</span>{tag(`${benevoles.length} INSCRITS`)}</div>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <input placeholder="Nom" value={newBen.nom} onChange={e => setNewBen(b => ({ ...b, nom: e.target.value }))} className="form-input" style={{ flex: 1 }} />
            <input placeholder="Rôle" value={newBen.role} onChange={e => setNewBen(b => ({ ...b, role: e.target.value }))} className="form-input" style={{ flex: 1 }} />
            <input placeholder="Zone" value={newBen.zone} onChange={e => setNewBen(b => ({ ...b, zone: e.target.value }))} className="form-input" style={{ flex: 1 }} />
            <button onClick={async () => {
              if (!newBen.nom) return;
              try { await fetch("/api/admin/benevoles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newBen) }); } catch {}
              setBenevoles(b => [...b, { ...newBen, id: Date.now(), present: false }]);
              setNewBen({ nom: "", role: "", zone: "" });
            }} className="btn btn-primary">+ AJOUTER</button>
          </div>
          <table className="sensor-table">
            <thead><tr>{["NOM", "RÔLE", "ZONE", "PRÉSENCE"].map(h => <th key={h} className="sensor-th">{h}</th>)}</tr></thead>
            <tbody>
              {benevoles.map((b, i) => (
                <tr key={b.id} className={i % 2 === 0 ? "sensor-tr--odd" : "sensor-tr--even"}>
                  <td className="sensor-td"><span className="char-name">{b.nom}</span></td>
                  <td className="sensor-td"><span className="sensor-name">{b.role}</span></td>
                  <td className="sensor-td"><span className="sensor-name">{b.zone}</span></td>
                  <td className="sensor-td"><span className={`sensor-badge ${b.present ? "sensor-badge--ok" : "sensor-badge--alert"}`}><span className="sensor-badge-dot" />{b.present ? "PRÉSENT" : "ABSENT"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* INSCRIPTIONS */}
      {tab === 3 && (
        <div className="sensor-wrapper">
          <div className="sensor-header"><span className="sensor-title">INSCRIPTIONS // PARTICIPANTS</span></div>
          <div style={{ padding: "16px" }}><InscriptionForm /></div>
        </div>
      )}

      {/* FORAINS */}
      {tab === 4 && (
        <div className="sensor-wrapper">
          <div className="sensor-header"><span className="sensor-title">FORAINS // GESTION</span>{tag(`${forains.length} FORAINS`)}</div>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <input placeholder="Nom" value={newFor.nom} onChange={e => setNewFor(f => ({ ...f, nom: e.target.value }))} style={iStyle} />
            <input placeholder="Contact" value={newFor.contact} onChange={e => setNewFor(f => ({ ...f, contact: e.target.value }))} style={iStyle} />
            <input placeholder="Emplacement" value={newFor.emplacement} onChange={e => setNewFor(f => ({ ...f, emplacement: e.target.value }))} style={iStyle} />
            <button onClick={async () => {
              if (!newFor.nom) return;
              try { await fetch("/api/admin/forains", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newFor) }); } catch {}
              setForains(f => [...f, { ...newFor, id: Date.now(), paye: false }]);
              setNewFor({ nom: "", contact: "", emplacement: "" });
            }} style={btnPrimary("#a78bfa")}>+ AJOUTER</button>
          </div>
          <table className="sensor-table">
            <thead><tr>{["NOM", "CONTACT", "EMPLACEMENT", "PAIEMENT", ""].map(h => <th key={h} className="sensor-th">{h}</th>)}</tr></thead>
            <tbody>
              {forains.map((f, i) => (
                <tr key={f.id} className={i % 2 === 0 ? "sensor-tr--odd" : "sensor-tr--even"}>
                  <td className="sensor-td"><span className="sensor-name" style={{ fontWeight: 600 }}>{f.nom}</span></td>
                  <td className="sensor-td"><span className="sensor-name">{f.contact}</span></td>
                  <td className="sensor-td"><span className="sensor-name">{f.emplacement}</span></td>
                  <td className="sensor-td"><span className={`sensor-badge ${f.paye ? "sensor-badge--ok" : "sensor-badge--alert"}`}><span className="sensor-badge-dot" />{f.paye ? "PAYÉ" : "EN ATTENTE"}</span></td>
                  <td className="sensor-td">
                    <button onClick={async () => {
                      try { await fetch(`/api/admin/forains/${f.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paye: !f.paye }) }); } catch {}
                      setForains(prev => prev.map(x => x.id === f.id ? { ...x, paye: !x.paye } : x));
                    }} style={btnPrimary(f.paye ? "var(--text-muted)" : "var(--accent-success)")}>
                      {f.paye ? "ANNULER" : "MARQUER PAYÉ"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ÉQUIPEMENTS */}
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
                        <span className="sensor-badge-dot" />
                        {eq.label ?? (eq.ok ? "OK" : "KO")}
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

function InscriptionForm() {
  const [form, setForm] = useState({ nom: "", contact: "", nb_personnes: "", description: "", journee: "" });
  const [submitted, setSubmitted] = useState(false);
  const handleSubmit = async () => {
    if (!form.nom) return;
    try { await fetch("/api/inscriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); } catch {}
    setSubmitted(true);
  };
  const fStyle: React.CSSProperties = { background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: "3px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "12px", outline: "none", width: "100%", boxSizing: "border-box" };
  if (submitted) return <div style={{ padding: "16px", color: "var(--accent-success)", fontSize: "11px", letterSpacing: "0.1em" }}>✓ INSCRIPTION ENREGISTRÉE</div>;
  return (
    <div style={{ display: "grid", gap: "12px", maxWidth: "480px" }}>
      {[
        { key: "nom", label: "NOM DU GROUPE", placeholder: "ex: Association Les Lions" },
        { key: "contact", label: "CONTACT", placeholder: "ex: 0470 12 34 56" },
        { key: "nb_personnes", label: "NB. PARTICIPANTS", placeholder: "ex: 12", type: "number" },
        { key: "journee", label: "JOURNÉE", placeholder: "ex: 15/03/2026" },
        { key: "description", label: "DESCRIPTION", placeholder: "Thème du char..." },
      ].map(f => (
        <div key={f.key}>
          <label style={{ display: "block", fontSize: "9px", letterSpacing: "0.15em", color: "var(--text-muted)", marginBottom: "5px" }}>{f.label}</label>
          {f.key === "description"
            ? <textarea rows={3} placeholder={f.placeholder} value={(form as any)[f.key]} onChange={e => setForm(x => ({ ...x, [f.key]: e.target.value }))} style={{ ...fStyle, resize: "vertical" }} />
            : <input type={f.type ?? "text"} placeholder={f.placeholder} value={(form as any)[f.key]} onChange={e => setForm(x => ({ ...x, [f.key]: e.target.value }))} style={fStyle} />
          }
        </div>
      ))}
      <button onClick={handleSubmit} style={{ background: "var(--nav-active-bg)", border: "1px solid var(--nav-active-border)", borderRadius: "3px", padding: "10px", color: "var(--accent-primary)", fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.15em", cursor: "pointer" }}>
        SOUMETTRE L'INSCRIPTION →
      </button>
    </div>
  );
}
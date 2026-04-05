import { useEffect, useState } from "react";
import PublicPage from "./components/PublicPage";
import AdminPage from "./components/AdminPage";
import SecuPage from "./components/SecuPage";

type View = "public" | "admin" | "secu" | "chariots";

const VIEWS: { key: View; label: string }[] = [
  { key: "public", label: "PUBLIC" },
  { key: "admin", label: "ADMIN" },
  { key: "secu", label: "SÉCURITÉ" },
];

export default function App() {
  const [view, setView] = useState<View>("public");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    const storedTheme = localStorage.getItem("carnaval_theme");
    const nextTheme = storedTheme === "light" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme === "light" ? "light" : "");
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("carnaval_theme", next);
    document.documentElement.setAttribute("data-theme", next === "light" ? "light" : "");
  };

  // Display a short GDPR/camera notice on first visit
  useEffect(() => {
    const stored = localStorage.getItem("carnaval_consent");
    if (stored === "ok") setConsent(true);
  }, []);

  const acceptConsent = () => {
    localStorage.setItem("carnaval_consent", "ok");
    setConsent(true);
  };

  if (!consent) {
    return (
      <div className="consent-overlay">
        <div className="consent-modal">
          <div className="consent-kicker">Information visiteur</div>
          <h2>Captation vidéo pendant l'événement</h2>
          <p>
            Salut ! En participant à cet événement, tu peux être <strong>potentiellement filmé</strong> par les caméras embarquées sur les chars.
            En cliquant ci-dessous, tu acceptes cette captation et cet usage limité à la supervision et à la communication de l'événement.
          </p>
          <p style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Si tu ne veux pas être filmé, tu peux fermer cette page.
          </p>
          <button className="btn btn-primary" onClick={acceptConsent} style={{ marginTop: "1.2rem" }}>
            J'ai compris, afficher le site
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="app-backdrop" aria-hidden="true">
        <div className="app-orb app-orb--one" />
        <div className="app-orb app-orb--two" />
        <div className="app-orb app-orb--three" />
        <div className="app-grid" />
      </div>

      <div className="app">
        <header className="app-header">
          <div className="app-header-inner">
            <div className="app-brand-block">
              <div className="app-logo">
                <span className="app-logo-icon">C</span>
                <div>
                  <div className="app-logo-text">Carnaval Operations</div>
                  <div className="app-logo-version">Plateforme temps réel · édition 2026</div>
                </div>
              </div>

              <div className="app-strapline">
                Pilotage public, sécurité et coordination dans une seule interface.
            </div>
            </div>

            <nav className="app-nav" aria-label="Navigation principale">
              {VIEWS.map(v => (
                <button
                  key={v.key}
                  onClick={() => setView(v.key)}
                  className={`app-nav-link${view === v.key ? " active" : ""}`}
                  style={{ background: "none", fontFamily: "var(--font-mono)", cursor: "pointer" }}
                >
                  {v.label}
                </button>
              ))}
            </nav>

            <div className="app-tools">
              <div className="app-status">
                <div className="app-status-dot" />
                <div>
                  <div className="app-status-label">Système en ligne</div>
                  <div className="app-status-meta">Flux et données synchronisés</div>
                </div>
              </div>

              <button className="app-theme-btn" onClick={toggleTheme} title="Changer le thème">
                <span>{theme === "dark" ? "Clair" : "Sombre"}</span>
              </button>
            </div>
          </div>
        </header>

        <section className="app-banner">
          <div>
            <div className="app-banner-kicker">Centre de supervision</div>
            <h1 className="app-banner-title">Une interface plus claire, plus structurée, plus crédible.</h1>
          </div>
          <p className="app-banner-copy">
            Suivi du cortège, caméras embarquées, gestion terrain et pilotage comité avec une présentation orientée exploitation.
          </p>
        </section>

        <main className="app-main">
          {view === "public" && <PublicPage />}
          {view === "admin" && <AdminPage />}
          {view === "secu" && <SecuPage />}
        </main>
      </div>
    </div>
  );
}
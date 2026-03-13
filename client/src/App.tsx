import { useEffect, useState } from "react";
import PublicPage from "./components/PublicPage";
import AdminPage from "./components/AdminPage";
import SecuPage from "./components/SecuPage";

type View = "public" | "admin" | "secu";

const VIEWS: { key: View; label: string }[] = [
  { key: "public", label: "PUBLIC" },
  { key: "admin", label: "ADMIN" },
  { key: "secu", label: "SÉCURITÉ" },
];

export default function App() {
  const [view, setView] = useState<View>("public");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [consent, setConsent] = useState(false);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
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
          <h2>Information RGPD / Vidéo</h2>
          <p>
            Ce service est diffusé en direct et des images/vidéos peuvent être captées lors de l'événement.
            En continuant, vous acceptez que ces images puissent être utilisées à des fins de supervision et de communication.
          </p>
          <p style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Vous pouvez quitter à tout moment si vous ne souhaitez pas participer.
          </p>
          <button className="btn btn-primary" onClick={acceptConsent} style={{ marginTop: "1.2rem" }}>
            J'ai compris, afficher le site
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-logo">
            <span className="app-logo-icon">◈</span>
            <div>
              <div className="app-logo-text">CARNAVAL</div>
              <div className="app-logo-version">v1.0.0 // 2026</div>
            </div>
          </div>

          <nav className="app-nav">
            {VIEWS.map(v => (
              <button key={v.key} onClick={() => setView(v.key)}
                className={`app-nav-link${view === v.key ? " active" : ""}`}
                style={{ background: "none", fontFamily: "var(--font-mono)", cursor: "pointer" }}>
                {v.label}
              </button>
            ))}
          </nav>

          <div className="app-status">
            <div className="app-status-dot" />
            ONLINE
          </div>

          <button className="app-theme-btn" onClick={toggleTheme} title="Changer le thème">
            {theme === "dark" ? "☀" : "◑"}
          </button>
        </div>
      </header>

      <main className="app-main">
        {view === "public" && <PublicPage />}
        {view === "admin" && <AdminPage />}
        {view === "secu" && <SecuPage />}
      </main>
    </div>
  );
}
import { useEffect, useId, useState } from "react";
import MapChars from "./MapChars";

interface Char {
  id: number; nom: string; description?: string;
  statut: "actif" | "arrêté"; vitesse?: number; participants?: number;
  latitude: number; longitude: number;
}

const ACCENT_CLASSES = ["accent-0", "accent-1", "accent-2", "accent-3", "accent-4", "accent-5"];

const DEMO_CHARS: Char[] = [
  { id: 1, nom: "Char des Lions", description: "Le char officiel de l'association Les Lions", statut: "actif", vitesse: 4, participants: 12, latitude: 50.4672, longitude: 4.8678 },
  { id: 2, nom: "Char des Aigles", description: "Char des jeunes du village", statut: "actif", vitesse: 3, participants: 8, latitude: 50.4655, longitude: 4.8650 },
  { id: 3, nom: "Char des Fous", description: "Le char le plus décoré du carnaval !", statut: "arrêté", vitesse: 0, participants: 15, latitude: 50.4640, longitude: 4.8630 },
];

export default function PublicPage() {
  const fileInputId = useId();
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
    fetch("/api/votes").then(r => r.ok ? r.json() : {}).then(setVotes).catch(() => {});
    fetch("/api/photos").then(r => r.ok ? r.json() : []).then(setPhotos).catch(() => {});
  }, []);

  const handleVote = async (charId: number) => {
    if (voted) return;
    try {
      const res = await fetch("/api/vote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ char_id: charId }) });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.votes !== undefined) {
        setVotes(v => ({ ...v, [charId]: data.votes }));
      } else if (res.status === 409) {
        setVoted(true);
        return;
      } else {
        setVotes(v => ({ ...v, [charId]: (v[charId] || 0) + 1 }));
      }
    } catch {
      setVotes(v => ({ ...v, [charId]: (v[charId] || 0) + 1 }));
    }
    setVoted(true);
  };

  const handlePhotoUpload = async () => {
    if (!photoFile) return;
    const form = new FormData();
    form.append("photo", photoFile);
    try {
      const res = await fetch("/api/photos", { method: "POST", body: form });
      const photo = await res.json();
      if (!res.ok) throw new Error();
      setPhotos(current => [photo, ...current]);
      setUploadMsg("✓ Photo envoyée");
      setPhotoFile(null);
    }
    catch { setUploadMsg("✗ Erreur envoi"); }
  };

  const tag = (label: string) => (
    <span className="camera-tag">{label}</span>
  );

  const accentClass = (index: number) => `public-${ACCENT_CLASSES[index % ACCENT_CLASSES.length]}`;

  return (
    <div className="page-container">

      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">CARNAVAL // LIVE</div>
          <div className="page-subtitle">Suivi public du cortège en temps réel</div>
        </div>
        <div className="page-actions">
          <div className="public-live-dot" />
          <span className="public-live-label">EN DIRECT</span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav className="app-nav section-nav">
        {TABS.map((tab, i) => (
          <button key={i} onClick={() => setCurrentTab(i)}
            className={`app-nav-link section-nav-link${currentTab === i ? " active" : ""}`}>
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
              <div className="admin-empty-state">— AUCUN CHAR —</div>
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
                        <div className="sensor-name admin-name-strong">{char.nom}</div>
                      </td>
                      <td className="sensor-td">
                        <div className="public-char-description">{char.description || "—"}</div>
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
              <div className="public-camera-tags">{tag("SIMULATION")}{tag("UI")}</div>
            </div>
            <div className="camera-card-screen public-camera-screen">
              <div className="camera-corner camera-corner--tl" />
              <div className="camera-corner camera-corner--tr" />
              <div className="camera-corner camera-corner--bl" />
              <div className="camera-corner camera-corner--br" />
              <div className="public-camera-placeholder">
                <div>
                  <div className="public-camera-placeholder-title">FLUX VIDÉO NON CONNECTÉ</div>
                  <div className="public-camera-placeholder-copy">
                    L'interface caméra est prête, mais aucun backend de streaming n'est branché dans ce projet pour le moment.
                  </div>
                </div>
              </div>
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
                      <span className={`public-char-index ${accentClass(i)}`}>{String(i + 1).padStart(2, "0")}</span>
                    </td>
                    <td className="sensor-td">
                      <div className="sensor-name admin-name-strong">{char.nom}</div>
                      <div className="public-char-description">{char.description}</div>
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
            <div className="public-vote-section">
              <div className="public-vote-grid">
                {chars.map((char, i) => (
                  <div key={char.id} className="public-vote-card">
                    <div className={`public-vote-card-title ${accentClass(i)}`}>{char.nom}</div>
                    <div className="public-vote-card-copy">{char.description}</div>
                    <button
                      onClick={() => handleVote(char.id)}
                      disabled={voted}
                      className="btn btn-primary public-full-width-btn"
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
              <div className="gallery-upload public-gallery-upload">
                <input id={fileInputId} type="file" accept="image/*" title="Ajouter une photo" aria-label="Ajouter une photo"
                  onChange={e => setPhotoFile(e.target.files?.[0] ?? null)}
                  className="public-file-input" />
                <label htmlFor={fileInputId} className="public-file-picker">
                  <span className="public-file-picker-kicker">GALERIE</span>
                  <span className="public-file-picker-title">Choisir une photo</span>
                  <span className="public-file-picker-meta">JPG, PNG, WEBP</span>
                </label>
                <div className="public-file-selected">
                  <span className="public-file-selected-label">Fichier</span>
                  <span className="public-file-selected-name">{photoFile?.name || "Aucun fichier sélectionné"}</span>
                </div>
                <button onClick={handlePhotoUpload}
                  className="btn btn-primary">
                  ENVOYER →
                </button>
                {uploadMsg && <span className={`vote-message ${uploadMsg.startsWith("✓") ? "public-upload-message--success" : "public-upload-message--error"}`}>{uploadMsg}</span>}
              </div>
              {photos.length > 0 && (
                <div className="public-photo-grid">
                  {photos.map((p, i) => <img key={i} src={p.url} alt="" className="public-photo-thumb" />)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
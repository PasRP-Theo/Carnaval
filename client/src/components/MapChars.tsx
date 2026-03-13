import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface GpsPoint { latitude: number; longitude: number; }
interface Char {
  id: number; nom: string; description?: string;
  statut: "actif" | "arrêté"; vitesse?: number; participants?: number;
  latitude: number; longitude: number; batterie?: number;
  gps_signal?: boolean; updated_at?: string; historique?: GpsPoint[];
}
interface SecuPosition {
  id: number; nom: string; role: string;
  latitude: number; longitude: number; actif: boolean;
}

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const COLORS = ["#60a5fa", "#ef4444", "#22c55e", "#f59e0b", "#a78bfa", "#34d399"];

const createCharIcon = (color: string, label: number) =>
  L.divIcon({
    className: "",
    html: `<div style="background:${color};color:#07080d;border-radius:3px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;font-family:'JetBrains Mono',monospace;border:1px solid rgba(255,255,255,0.2);box-shadow:0 2px 8px rgba(0,0,0,0.5);">${label}</div>`,
    iconSize: [32, 32], iconAnchor: [16, 16],
  });

const createSecuIcon = () =>
  L.divIcon({
    className: "",
    html: `<div style="background:#ef4444;color:#fff;border-radius:3px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:15px;border:1px solid rgba(255,255,255,0.2);box-shadow:0 2px 8px rgba(0,0,0,0.5);">🚑</div>`,
    iconSize: [32, 32], iconAnchor: [16, 16],
  });

const DEMO_CHARS: Char[] = [
  { id: 1, nom: "Char des Lions", statut: "actif", vitesse: 4, latitude: 50.4672, longitude: 4.8678, batterie: 87, gps_signal: true, updated_at: new Date().toISOString(), historique: [{ latitude: 50.4660, longitude: 4.8660 }, { latitude: 50.4665, longitude: 4.8668 }] },
  { id: 2, nom: "Char des Aigles", statut: "actif", vitesse: 3, latitude: 50.4655, longitude: 4.8650, batterie: 62, gps_signal: true, updated_at: new Date().toISOString(), historique: [{ latitude: 50.4645, longitude: 4.8635 }] },
  { id: 3, nom: "Char des Fous", statut: "arrêté", vitesse: 0, latitude: 50.4640, longitude: 4.8630, batterie: 15, gps_signal: false, updated_at: new Date().toISOString(), historique: [] },
];

interface Props {
  centreVille?: [number, number];
  showSecu?: boolean;
  secu?: SecuPosition[];
}

export default function MapChars({ centreVille = [50.4669, 4.8674], showSecu = false, secu = [] }: Props) {
  const [chars, setChars] = useState<Char[]>(DEMO_CHARS);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/chars/positions");
        if (!res.ok) throw new Error();
        setChars(await res.json());
      } catch {}
    };
    fetchData();
    const iv = setInterval(fetchData, 5000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div style={{ width: "100%", height: "320px", borderRadius: "4px", overflow: "hidden", border: "1px solid var(--border)" }}>
      <MapContainer center={centreVille} zoom={15} style={{ width: "100%", height: "100%" }}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {chars.map((char, i) => {
          const color = COLORS[i % COLORS.length];
          return (
            <div key={char.id}>
              {(char.historique?.length ?? 0) > 1 && (
                <Polyline positions={char.historique!.map(p => [p.latitude, p.longitude] as [number, number])} color={color} weight={2} opacity={0.6} dashArray="4,4" />
              )}
              <Marker position={[char.latitude, char.longitude]} icon={createCharIcon(color, i + 1)}>
                <Popup>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", minWidth: "160px" }}>
                    <div style={{ fontWeight: 700, marginBottom: "6px" }}>🎠 {char.nom}</div>
                    <div style={{ color: "#666" }}>📍 {char.latitude.toFixed(5)}, {char.longitude.toFixed(5)}</div>
                    {char.vitesse !== undefined && <div style={{ color: "#666" }}>🚗 {char.vitesse} km/h</div>}
                    <div style={{ marginTop: "4px" }}>
                      <span style={{ background: char.statut === "actif" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)", color: char.statut === "actif" ? "#16a34a" : "#dc2626", padding: "1px 6px", borderRadius: "2px", fontSize: "10px", fontWeight: 700 }}>{char.statut}</span>
                    </div>
                    {char.updated_at && <div style={{ color: "#999", fontSize: "10px", marginTop: "4px" }}>Màj : {new Date(char.updated_at).toLocaleTimeString()}</div>}
                  </div>
                </Popup>
              </Marker>
            </div>
          );
        })}
        {showSecu && secu.map(s => (
          <Marker key={s.id} position={[s.latitude, s.longitude]} icon={createSecuIcon()}>
            <Popup>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px" }}>
                <div style={{ fontWeight: 700 }}>🚑 {s.nom}</div>
                <div style={{ color: "#666" }}>{s.role}</div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
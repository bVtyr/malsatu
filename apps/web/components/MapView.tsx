"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import "leaflet/dist/leaflet.css";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

const MapContainer = dynamic(() => import("react-leaflet").then((m) => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then((m) => m.TileLayer), { ssr: false });
const CircleMarker = dynamic(() => import("react-leaflet").then((m) => m.CircleMarker), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then((m) => m.Popup), { ssr: false });
const Circle = dynamic(() => import("react-leaflet").then((m) => m.Circle), { ssr: false });
const TILES = process.env.NEXT_PUBLIC_MAP_TILES ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ZoomWatcher = dynamic(() => import("react-leaflet").then((m) => { const { useMapEvents } = m; return function ZW({ onZoom }: { onZoom: (z: number) => void }) { useMapEvents({ zoomend: (e) => onZoom(e.target.getZoom()) }); return null; }; }), { ssr: false });

/** Карта объявлений: серверные кластеры по zoom. */
export function ListingsMap({ query, center }: { query: Record<string, unknown>; center?: { lat: number; lng: number } }) {
  const { lf, href, money } = useI18n();
  const [zoom, setZoom] = useState(5);
  const [clusters, setClusters] = useState<any[]>([]);
  const c = center ?? { lat: 48.0, lng: 68.0 };
  useEffect(() => { api("/listings/map", { query: { ...query, zoom } }).then((r) => setClusters(r.clusters)).catch(() => undefined); }, [JSON.stringify(query), zoom]);
  return (
    <div className="map-tall">
      <MapContainer center={[c.lat, c.lng]} zoom={zoom} scrollWheelZoom style={{ height: "100%" }}>
        <TileLayer url={TILES} attribution="© OpenStreetMap" />
        <ZoomWatcher onZoom={setZoom} />
        {clusters.map((cl, i) => (
          <CircleMarker key={i} center={[cl.lat, cl.lng]} radius={cl.count > 1 ? Math.min(28, 10 + Math.log2(cl.count) * 4) : 8} pathOptions={{ color: "#141413", fillColor: "#f0c21c", fillOpacity: 0.95, weight: 2 }}>
            <Popup><strong>{cl.count}</strong><ul style={{ paddingLeft: 0, listStyle: "none", margin: "0.3rem 0 0" }}>{cl.items.map((it: any) => <li key={it.id}><a href={href(`/listing/${it.id}`)}>{lf(it, "title")}</a>{it.price_kzt ? ` · ${money(it.price_kzt)}` : ""}</li>)}</ul></Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}

/** Выбор точки на карте (мастер). */
export function PointPicker({ value, onChange }: { value: { lat: number; lng: number } | null; onChange: (p: { lat: number; lng: number }) => void }) {
  const c = value ?? { lat: 48.0, lng: 68.0 };
  const Clicker = useMemo(() => dynamic(() => import("react-leaflet").then((m) => { const { useMapEvents } = m; return function CK() { useMapEvents({ click: (e) => onChange({ lat: e.latlng.lat, lng: e.latlng.lng }) }); return null; }; }), { ssr: false }), [onChange]);
  return (
    <div className="map" style={{ aspectRatio: "3 / 2" }}>
      <MapContainer center={[c.lat, c.lng]} zoom={value ? 10 : 4} style={{ height: "100%" }}>
        <TileLayer url={TILES} attribution="© OpenStreetMap" />
        <Clicker />
        {value && <Circle center={[value.lat, value.lng]} radius={1500} pathOptions={{ color: "#184c2e", fillColor: "#f0c21c", fillOpacity: 0.5 }} />}
      </MapContainer>
    </div>
  );
}

/** Размытая точка в карточке объявления. */
export function MapPreview({ lat, lng }: { lat: number; lng: number }) {
  return (
    <div className="map">
      <MapContainer center={[lat, lng]} zoom={9} style={{ height: "100%" }} dragging={false} scrollWheelZoom={false} zoomControl={false}>
        <TileLayer url={TILES} attribution="© OpenStreetMap" />
        <Circle center={[lat, lng]} radius={2500} pathOptions={{ color: "#184c2e", fillColor: "#f0c21c", fillOpacity: 0.5 }} />
      </MapContainer>
    </div>
  );
}

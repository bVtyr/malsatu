"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
/** Каскадный выбор региона (область → район → село) и определение по геолокации. */
export function RegionPicker({ value, onChange, geo, onRequestGeo }: { value: string | null; onChange: (code: string, region?: any) => void; geo?: { lat: number; lng: number } | null; onRequestGeo?: () => void }) {
  const { name, t, locale } = useI18n();
  const [levels, setLevels] = useState<any[][]>([]);
  const [path, setPath] = useState<string[]>([]);
  useEffect(() => { api("/regions", { query: { parent: "" } }).then((r) => setLevels([r.regions])).catch(() => undefined); }, []);
  const pick = async (depth: number, code: string) => {
    const newPath = [...path.slice(0, depth), code]; setPath(newPath);
    const r = await api("/regions", { query: { parent: code } });
    setLevels([...levels.slice(0, depth + 1), ...(r.regions.length ? [r.regions] : [])]);
    onChange(code, levels[depth]?.find((x) => x.code === code));
  };
  const detect = async () => { if (!geo) { onRequestGeo?.(); return; } const r = await api("/regions/resolve", { query: { lat: geo.lat, lng: geo.lng } }); if (r.region) { onChange(r.region.code, r.region); setPath(r.path.map((p: any) => p.code)); } };
  useEffect(() => { if (geo && !value) detect(); }, [geo?.lat, geo?.lng]);
  return (
    <div className="stack">
      {(geo || onRequestGeo) && <button type="button" onClick={detect} className="btn btn--white btn--wide">{locale === "kk" ? "Орналасқан жерім бойынша анықтау" : "Определить по геолокации"}</button>}
      {levels.map((opts, depth) => (
        <select key={depth} className="field" value={path[depth] ?? ""} onChange={(e) => e.target.value && pick(depth, e.target.value)} aria-label={t.filters.region}>
          <option value="">{depth === 0 ? t.filters.region : (locale === "kk" ? "аудан / ауыл" : "район / село")}</option>
          {opts.map((o) => <option key={o.code} value={o.code}>{name(o)}</option>)}
        </select>
      ))}
      {value && <div className="sub">{value}</div>}
    </div>
  );
}

"use client";
import { useRef } from "react";
import { compressImage } from "@/lib/offline";
import { Camera, Video } from "./Icons";
import { useI18n } from "@/lib/i18n";
export type Shot = { name: string; blob: Blob; url: string; kind: "image" | "video" };
/** Фото и видео с камеры или из галереи; фото сжимаются на клиенте. Первое фото становится обложкой. */
export function PhotoCapture({ items, onChange, max = 10 }: { items: Shot[]; onChange: (v: Shot[]) => void; max?: number }) {
  const { t, locale } = useI18n();
  const ref = useRef<HTMLInputElement>(null); const vref = useRef<HTMLInputElement>(null);
  const add = async (files: FileList | null) => {
    if (!files) return; const out = [...items];
    for (const f of Array.from(files).slice(0, max - items.length)) { const isVideo = f.type.startsWith("video/"); const blob = isVideo ? f : await compressImage(f); out.push({ name: isVideo ? f.name : `${Date.now()}.webp`, blob, url: URL.createObjectURL(blob), kind: isVideo ? "video" : "image" }); }
    onChange(out);
  };
  return (
    <div>
      <div className="photo-grid">
        {items.map((it, i) => (
          <div key={i}>
            {it.kind === "video" ? <video src={it.url} muted /> : <img src={it.url} alt="" />}
            {i === 0 && <span className="mark mark--yellow" style={{ position: "absolute", left: "0.3rem", top: "-0.1rem" }}>1</span>}
            <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="rm" aria-label={t.common.delete}>×</button>
          </div>
        ))}
        {items.length < max && <button type="button" onClick={() => ref.current?.click()} className="add"><Camera size={30} />{t.listing.takePhoto}</button>}
        {items.length < max && !items.some((i) => i.kind === "video") && <button type="button" onClick={() => vref.current?.click()} className="add" style={{ background: "var(--surface)" }}><Video size={30} />{t.listing.video}</button>}
      </div>
      <input ref={ref} type="file" accept="image/*" capture="environment" multiple className="hidden-input" onChange={(e) => add(e.target.files)} />
      <input ref={vref} type="file" accept="video/*" capture="environment" className="hidden-input" onChange={(e) => add(e.target.files)} />
      <p className="sub" style={{ marginTop: "0.5rem" }}>{locale === "kk" ? `Фото: ${items.filter((i) => i.kind === "image").length}, кемінде 3.` : `Фото: ${items.filter((i) => i.kind === "image").length}, нужно минимум 3.`}</p>
    </div>
  );
}

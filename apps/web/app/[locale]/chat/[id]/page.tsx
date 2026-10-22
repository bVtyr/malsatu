"use client";
import { use, useEffect, useRef, useState } from "react";
import { api, getToken, uploadMedia, WS_URL } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { Warning, Camera, Mic, MapPin } from "@/components/Icons";

export default function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, locale } = useI18n(); const { user } = useAuth();
  const [blockAsk, setBlockAsk] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [conv, setConv] = useState<any>(null); const [msgs, setMsgs] = useState<any[]>([]); const [text, setText] = useState(""); const [warn, setWarn] = useState<string[] | null>(null); const [templates, setTemplates] = useState<any[]>([]); const [showOrig, setShowOrig] = useState<Record<string, boolean>>({});
  const bottom = useRef<HTMLDivElement>(null); const ws = useRef<WebSocket | null>(null); const rec = useRef<MediaRecorder | null>(null); const [recording, setRecording] = useState(false);
  const load = () => api(`/conversations/${id}/messages`).then((r) => { setConv(r.conversation); setMsgs(r.messages); }).catch((e) => setErr(e.code));
  useEffect(() => {
    if (!user) return; load(); api("/quick-replies").then((r) => setTemplates(r.items)).catch(() => undefined);
    let alive = true, attempt = 0, timer: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      const s = new WebSocket(`${WS_URL}/api/v1/ws`); ws.current = s; // сессия передаётся cookie, запасной вариант: первое сообщение с токеном
      s.onopen = () => { attempt = 0; const tok = getToken(); if (tok) s.send(JSON.stringify({ type: "auth", token: tok })); };
      s.onmessage = (e) => { try { const m = JSON.parse(e.data); if (m.type === "message" && m.conversationId === id) setMsgs((x) => x.some((y) => y.id === m.message.id) ? x : [...x, m.message]); } catch { /* мусор игнорируем */ } };
      s.onclose = () => { if (!alive) return; attempt++; timer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** attempt)); load(); };
      s.onerror = () => s.close();
    };
    connect();
    return () => { alive = false; clearTimeout(timer); ws.current?.close(); };
  }, [id, user?.id]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length]);
  const send = async (body: any) => { const r = await api(`/conversations/${id}/messages`, { body }); setWarn(r.fraudWarning); setMsgs((x) => x.some((y) => y.id === r.message.id) ? x : [...x, r.message]); };
  const sendText = async () => { if (!text.trim()) return; const tx = text; setText(""); await send({ kind: "text", text: tx }); };
  const sendPhoto = async (f: File | null) => { if (!f) return; const r = await uploadMedia(f, f.name); await send({ kind: f.type.startsWith("video") ? "video" : "photo", mediaId: r.media.id }); };
  const sendLocation = () => navigator.geolocation.getCurrentPosition((p) => send({ kind: "location", lat: p.coords.latitude, lng: p.coords.longitude }));
  const toggleVoice = async () => {
    if (rec.current) { rec.current.stop(); rec.current = null; setRecording(false); return; }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); const chunks: Blob[] = [];
    const r = new MediaRecorder(stream, { mimeType: "audio/webm" }); r.ondataavailable = (e) => chunks.push(e.data);
    r.onstop = async () => { stream.getTracks().forEach((x) => x.stop()); const blob = new Blob(chunks, { type: "audio/webm" }); const up = await uploadMedia(blob, "voice.webm"); await send({ kind: "voice", mediaId: up.media.id }); };
    r.start(); rec.current = r; setRecording(true);
  };
  const block = async () => { if (!blockAsk) { setBlockAsk(true); return; } await api(`/conversations/${id}/block`, { method: "POST", body: {} }); setBlockAsk(false); load(); };
  return (
    <div className="chat-screen">
      <div className="row between"><div className="chat-head"><span className="avatar">{conv ? "M" : "…"}</span><span><b>{conv ? (locale === "kk" ? "Әңгіме" : "Диалог") : t.common.loading}</b><span>{conv?.last_message_preview?.slice(0, 40)}</span></span></div><button onClick={block} className={`chip${blockAsk ? " chip--ink" : ""}`}>{blockAsk ? `${t.chat.block}?` : t.chat.block}</button>{blockAsk && <button type="button" onClick={() => setBlockAsk(false)} className="chip">{t.common.cancel}</button>}</div>
      {err && <p className="text-red small">{err}</p>}
      <div className="msgs">
        {msgs.map((m) => { const mine = m.sender_id === user?.id; const tr = m.text_translated && m.translated_to === locale; const isOffer = m.kind === "offer"; return (
          <div key={m.id} className={`msg${m.kind === "system" ? " msg--sys" : mine ? " msg--mine" : ""}`} style={isOffer ? { background: "var(--accent)", color: "var(--accent-ink)" } : undefined}>
            {isOffer && <b style={{ display: "block" }}>{t.offer.title}</b>}
            {m.kind === "location" && Number.isFinite(Number(m.lat)) && <a className="link" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${Number(m.lat)}&mlon=${Number(m.lng)}#map=12/${Number(m.lat)}/${Number(m.lng)}`}>{Number(m.lat).toFixed(4)}, {Number(m.lng).toFixed(4)}</a>}
            {(m.kind === "photo" || m.kind === "video" || m.kind === "voice") && m.media_id && <MediaById id={m.media_id} kind={m.kind} />}
            {m.text && <span style={{ whiteSpace: "pre-line" }}>{tr && !showOrig[m.id] ? m.text_translated : m.text}</span>}
            {tr && <button onClick={() => setShowOrig({ ...showOrig, [m.id]: !showOrig[m.id] })} className="muted-link" style={{ display: "block", color: "inherit", opacity: 0.8 }}>{showOrig[m.id] ? t.chat.translate : t.common.autoTranslated}</button>}
            {m.fraud_score >= 40 && !mine && <span className="notice notice--red" style={{ marginTop: "0.4rem" }}><Warning />{t.chat.fraudWarning}</span>}
            <time>{new Date(m.created_at).toLocaleTimeString(locale === "kk" ? "kk-KZ" : "ru-KZ", { hour: "2-digit", minute: "2-digit" })}</time>
          </div>); })}
        <div ref={bottom} />
      </div>
      {warn && <div className="notice notice--red"><Warning />{t.chat.fraudWarning}</div>}
      {templates.length > 0 && <div className="chips chips--scroll">{templates.map((q) => <button key={q.id} type="button" onClick={() => setText(q.text)} className="chip">{q.text.slice(0, 32)}</button>)}</div>}
      <form onSubmit={(e) => { e.preventDefault(); sendText(); }} className="chat-form">
        <label className="btn btn--white" aria-label={t.listing.takePhoto}><Camera size={22} /><input type="file" accept="image/*,video/*" capture="environment" className="hidden-input" onChange={(e) => sendPhoto(e.target.files?.[0] ?? null)} /></label>
        <button type="button" onClick={toggleVoice} className="btn btn--white" aria-pressed={recording} aria-label={t.listing.voiceInput}><Mic size={22} /></button>
        <button type="button" onClick={sendLocation} className="btn btn--white" aria-label={t.listing.location}><MapPin size={22} /></button>
        <input className="field" style={{ minHeight: "2.75rem" }} value={text} onChange={(e) => setText(e.target.value)} placeholder={t.chat.placeholder} aria-label={t.chat.placeholder} />
        <button className="btn btn--ink">{t.chat.send}</button>
      </form>
    </div>
  );
}
function MediaById({ id, kind }: { id: string; kind: "photo" | "video" | "voice" }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { api(`/media/${id}`).then((r) => setUrl(r.media.url)).catch(() => undefined); }, [id]);
  if (!url) return <span className="sub">…</span>;
  if (kind === "photo") return <img src={url} alt="" style={{ maxHeight: "16rem" }} />;
  if (kind === "video") return <video src={url} controls style={{ maxHeight: "16rem" }} />;
  return <audio src={url} controls />;
}

"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, setToken } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { formatKzPhone } from "@malsatu/shared";

function LoginInner() {
  const { t, href, locale } = useI18n(); const { refresh } = useAuth(); const router = useRouter(); const sp = useSearchParams();
  const [phone, setPhone] = useState("+7"); const [code, setCode] = useState(""); const [stage, setStage] = useState<"phone" | "code" | "profile">("phone"); const [err, setErr] = useState<string | null>(null); const [dev, setDev] = useState<string | null>(null);
  const [profile, setProfile] = useState({ displayName: "", accountType: "individual" });
  const next = sp.get("next") ?? "/";
  const request = async () => { setErr(null); try { const r = await api("/auth/otp/request", { body: { phone } }); setDev(r.devCode ?? null); setStage("code"); } catch (e: any) { setErr((t.errors as any)[e.code === "validation" ? "invalidPhone" : e.code === "otp_cooldown" ? "rateLimited" : "network"] ?? e.code); } };
  const verify = async () => { setErr(null); try { const r = await api("/auth/otp/verify", { body: { phone, code } }); setToken(r.token); await refresh(); if (r.isNew) setStage("profile"); else router.replace(href(next)); } catch (e: any) { setErr(e.code === "otp_invalid" ? t.errors.otpInvalid : e.code === "otp_expired" ? t.errors.otpExpired : e.code); } };
  const saveProfile = async () => { await api("/users/me", { method: "PATCH", body: { ...profile, locale } }); await refresh(); router.replace(href(next)); };
  return (
    <div className="stack" style={{ maxWidth: "28rem", paddingTop: "1.5rem" }}>
      <h1 className="h-lead" style={{ fontSize: "2rem" }}>{t.auth.welcome}</h1>
      {stage === "phone" && <form onSubmit={(e) => { e.preventDefault(); request(); }} className="stack">
        <label className="label" htmlFor="phone">{t.auth.phone}</label>
        <input id="phone" className="field num" style={{ fontSize: "1.5rem" }} type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 7xx xxx xx xx" />
        <button className="btn btn--wide">{t.auth.sendCode}</button>
      </form>}
      {stage === "code" && <form onSubmit={(e) => { e.preventDefault(); verify(); }} className="stack">
        <p className="sub">{formatKzPhone(phone)}</p>
        <label className="label" htmlFor="code">{t.auth.code}</label>
        <input id="code" className="field num" style={{ fontSize: "2rem", letterSpacing: "0.4em", textAlign: "center" }} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
        {dev && <p className="sub">dev: {dev}</p>}
        <button className="btn btn--wide">{t.auth.confirm}</button>
        <button type="button" onClick={request} className="btn btn--white btn--wide">{t.auth.resend}</button>
      </form>}
      {stage === "profile" && <form onSubmit={(e) => { e.preventDefault(); saveProfile(); }} className="stack">
        <label className="label" htmlFor="nm">{t.auth.name}</label>
        <input id="nm" className="field" value={profile.displayName} onChange={(e) => setProfile({ ...profile, displayName: e.target.value })} />
        <span className="label">{t.auth.accountType}</span>
        <div className="chips">{[["individual", t.auth.individual], ["ip", t.auth.ip], ["kh", t.auth.kh], ["too", t.auth.too]].map(([k, label]) => <button type="button" key={k} onClick={() => setProfile({ ...profile, accountType: k })} className="chip" aria-pressed={profile.accountType === k}>{label}</button>)}</div>
        <button className="btn btn--wide">{t.common.save}</button>
      </form>}
      {err && <p className="text-red">{err}</p>}
      <p className="sub">{locale === "kk" ? "Кіре отырып, сіз пайдаланушы келісімімен келісесіз." : "Входя, вы принимаете пользовательское соглашение и политику конфиденциальности."}</p>
    </div>
  );
}
export default function LoginPage() { return <Suspense><LoginInner /></Suspense>; }

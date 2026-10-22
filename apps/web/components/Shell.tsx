"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { useAuth, hasRole } from "@/lib/auth";
import { Home, Search, Plus, Chat, User, Bell } from "./Icons";
import { api } from "@/lib/api";
import { syncDrafts } from "@/lib/offline";
import { submitDraft } from "./wizard/submit";
import { Motion } from "./Motion";

/** Каркас: белая шапка с логотипом, контент, чёрная нижняя навигация с жёлтой кнопкой «Подать». */
export function Shell({ children }: { children: ReactNode }) {
  const { locale, t, href } = useI18n();
  const { user } = useAuth();
  const path = usePathname();
  const router = useRouter();
  const [online, setOnline] = useState(true);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => { setOnline(true); syncDrafts(submitDraft).catch(() => undefined); };
    const off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    if ("serviceWorker" in navigator) { navigator.serviceWorker.register("/sw.js").catch(() => undefined); navigator.serviceWorker.addEventListener("message", (e) => { if (e.data?.type === "SYNC_DRAFTS") syncDrafts(submitDraft).catch(() => undefined); }); }
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  useEffect(() => { if (user) api("/notifications").then((r) => setUnread(r.unread)).catch(() => undefined); }, [user, path]);

  const switchLocale = () => { const other = locale === "kk" ? "ru" : "kk"; document.cookie = `locale=${other};path=/;max-age=31536000`; router.push(path.replace(/^\/(kk|ru)/, `/${other}`)); };
  const is = (p: string) => path === href(p) || (p !== "/" && path.startsWith(href(p)));
  return (
    <>
      <Motion />
      <header className="app-top">
        <Link href={href("/")} className="logo" aria-label="MalSatu"><span className="logo-mark" aria-hidden="true">M</span>MalSatu</Link>
        <div className="chips">
          {hasRole(user, "admin", "moderator", "arbiter", "finance") && <Link href={href("/admin")} className="chip">{t.nav.admin}</Link>}
          {user && <Link href={href("/notifications")} className="chip" aria-label={locale === "kk" ? "Хабарламалар" : "Уведомления"}><Bell size={18} />{unread > 0 ? unread : ""}</Link>}
          <button type="button" onClick={switchLocale} className="chip" aria-label={locale === "kk" ? "Русский язык" : "Қазақ тілі"}>{locale === "kk" ? "RU" : "ҚАЗ"}</button>
        </div>
      </header>
      {!online && <div className="band band--yellow small" style={{ paddingBlock: 8 }}>{t.common.offline}</div>}
      <main className="page">{children}</main>
      <nav className="app-nav" aria-label={locale === "kk" ? "Негізгі навигация" : "Основная навигация"}>
        <ul>
          <li><Link href={href("/")} aria-current={is("/") ? "page" : undefined}><Home size={24} />{t.nav.home}</Link></li>
          <li><Link href={href("/search")} aria-current={is("/search") ? "page" : undefined}><Search size={24} />{t.nav.search}</Link></li>
          <li><Link href={href("/new")} className="nav-add"><span className="plus"><Plus size={26} /></span>{t.nav.create}</Link></li>
          <li><Link href={href("/chat")} aria-current={is("/chat") ? "page" : undefined}><Chat size={24} />{t.nav.chat}</Link></li>
          <li><Link href={href("/profile")} aria-current={is("/profile") ? "page" : undefined}><User size={24} />{t.nav.profile}</Link></li>
        </ul>
      </nav>
    </>
  );
}

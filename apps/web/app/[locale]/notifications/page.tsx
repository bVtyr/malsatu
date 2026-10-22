"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
export default function NotificationsPage() {
  const { locale, date, href } = useI18n(); const { user } = useAuth(); const [items, setItems] = useState<any[]>([]); const [pushOk, setPushOk] = useState<string | null>(null);
  useEffect(() => { if (user) api("/notifications").then((r) => { setItems(r.items); api("/notifications/read", { method: "POST", body: {} }); }); }, [user]);
  const link = (n: any) => n.data?.conversationId ? href(`/chat/${n.data.conversationId}`) : n.data?.dealId ? href(`/deals/${n.data.dealId}`) : n.data?.listingId ? href(`/listing/${n.data.listingId}`) : n.data?.poolId ? href(`/sogym?pool=${n.data.poolId}`) : href("/profile");
  const subscribePush = async () => { try { const reg = await navigator.serviceWorker.ready; const { vapidPublicKey } = await api("/notifications/settings"); if (!vapidPublicKey) return setPushOk("VAPID"); const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidPublicKey }); await api("/notifications/push-subscribe", { body: sub.toJSON() }); setPushOk("ok"); } catch { setPushOk("err"); } };
  return <>
    <div className="row between"><h1 className="page-title">{locale === "kk" ? "Хабарламалар" : "Уведомления"}</h1><button onClick={subscribePush} className="chip">{pushOk === "ok" ? (locale === "kk" ? "Push қосылды" : "Push включены") : "Push"}</button></div>
    <div className="list-rows">{items.map((n) => <Link key={n.id} href={link(n)} className="rowline" style={{ display: "block" }}><b style={{ fontWeight: 500 }}>{locale === "kk" ? n.title_kk : n.title_ru}</b><span className="sub" style={{ display: "block" }}>{locale === "kk" ? n.body_kk : n.body_ru}</span><span className="sub">{date(n.created_at)}</span></Link>)}</div>
    {items.length === 0 && <div className="panel panel--surface">—</div>}
  </>;
}

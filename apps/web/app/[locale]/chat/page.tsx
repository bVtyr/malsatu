"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
export default function ChatListPage() {
  const { t, lf, href } = useI18n(); const { user, loading } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => { if (user) api("/conversations").then((r) => setItems(r.items)); }, [user]);
  if (!loading && !user) return <Link href={href("/login?next=/chat")} className="btn btn--wide">{t.auth.login}</Link>;
  return (<>
    <h1 className="page-title">{t.nav.chat}</h1>
    {items.length === 0 && <div className="panel panel--surface">{t.common.nothingFound}</div>}
    <div className="list-rows">{items.map((c) => <Link key={c.id} href={href(`/chat/${c.id}`)} className="rowline">
      <span className="avatar">{(c.peer?.farm_name ?? c.peer?.display_name ?? "?")[0]}</span>
      <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: "block", fontWeight: 500 }}>{c.peer?.farm_name ?? c.peer?.display_name}</b><span className="sub" style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lf(c, "title")}</span><span style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.last_message_preview}</span></span>
      {c.unread > 0 && <span className="mark mark--yellow">{c.unread}</span>}
    </Link>)}</div>
  </>);
}

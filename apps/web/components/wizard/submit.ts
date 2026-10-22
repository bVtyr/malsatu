import { api, uploadMedia } from "@/lib/api";
import type { Draft } from "@/lib/offline";
/** Отправка черновика: загрузка фото → создание объявления (идемпотентно по clientDraftId) → публикация. */
export async function submitDraft(d: Draft): Promise<string> {
  const mediaIds: string[] = [];
  for (const p of d.photos) { const r = await uploadMedia(p.blob, p.name); mediaIds.push(r.media.id); }
  const { listing } = await api("/listings", { body: { ...d.payload, mediaIds: [...(d.payload.mediaIds ?? []), ...mediaIds], clientDraftId: d.clientDraftId } });
  if (d.payload.__publish) await api(`/listings/${listing.id}/publish`, { method: "POST", body: {} });
  return listing.id;
}

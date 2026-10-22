/** Офлайн-черновики объявлений: IndexedDB-очередь + отправка при появлении связи (Background Sync или событие online). */
const DB = "malsatu", STORE = "drafts";
function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "clientDraftId" }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
export interface Draft { clientDraftId: string; payload: any; photos: Array<{ name: string; blob: Blob }>; createdAt: number; status: "pending" | "sending" | "sent" | "error"; error?: string; listingId?: string }

export async function saveDraft(d: Draft) { const db = await open(); await new Promise<void>((res, rej) => { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).put(d); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); try { const reg = await navigator.serviceWorker?.ready; await (reg as any)?.sync?.register("sync-drafts"); } catch { /* no bg sync */ } }
export async function listDrafts(): Promise<Draft[]> { const db = await open(); return new Promise((res, rej) => { const r = db.transaction(STORE).objectStore(STORE).getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
export async function deleteDraft(id: string) { const db = await open(); await new Promise<void>((res) => { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).delete(id); tx.oncomplete = () => res(); }); }

/** Отправка всех pending-черновиков. Идемпотентно благодаря clientDraftId на сервере. */
export async function syncDrafts(send: (d: Draft) => Promise<string>) {
  if (!navigator.onLine) return;
  for (const d of await listDrafts()) {
    if (d.status !== "pending" && d.status !== "error") continue;
    try { d.status = "sending"; await saveDraft(d); d.listingId = await send(d); d.status = "sent"; await saveDraft(d); }
    catch (e: any) { d.status = "error"; d.error = e?.message; await saveDraft(d); }
  }
}

/** Сжатие фото на клиенте (до 1600px, webp 0.8) — экономия трафика на слабом интернете. */
export async function compressImage(file: File, maxW = 1600): Promise<Blob> {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const scale = Math.min(1, maxW / bmp.width);
  const canvas = document.createElement("canvas"); canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((res) => canvas.toBlob((b) => res(b ?? file), "image/webp", 0.8));
}

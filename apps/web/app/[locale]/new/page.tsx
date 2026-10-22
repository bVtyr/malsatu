"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useGeo } from "@/lib/geo";
import { saveDraft, syncDrafts } from "@/lib/offline";
import { submitDraft } from "@/components/wizard/submit";
import { CategoryIcon } from "@/components/Icons";
import { RegionPicker } from "@/components/RegionPicker";
import { PointPicker } from "@/components/MapView";
import { PhotoCapture, type Shot } from "@/components/PhotoCapture";
import { VoiceInput } from "@/components/VoiceInput";
import { slaughterYield, SPECIES_OF_CATEGORY } from "@malsatu/shared";

/** Мастер в семь шагов: тип → ряд (категория) → фото → основное → атрибуты → место и доставка → проверка. Черновик живёт в телефоне. */
export default function NewListingPage() {
  const { t, name, locale, money, href } = useI18n(); const { user, loading } = useAuth(); const { pos } = useGeo(); const router = useRouter();
  const [step, setStep] = useState(0);
  const [cats, setCats] = useState<any[]>([]); const [breeds, setBreeds] = useState<any[]>([]);
  const [f, setF] = useState<any>({ kind: "livestock", categoryCode: "", title: "", description: "", priceType: "per_head", priceKzt: "", bargain: false, quantity: 1, avgWeightKg: "", weightMinKg: "", weightMaxKg: "", attributes: {}, tagNumbers: "", regionCode: "", point: null as null | { lat: number; lng: number }, deliveryOptions: ["pickup"], escrowAvailable: true, neededBy: "" });
  const [photos, setPhotos] = useState<Shot[]>([]); const [hint, setHint] = useState<any>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (!loading && !user) router.replace(href("/login?next=/new")); }, [user, loading]);
  useEffect(() => { api("/categories").then((r) => setCats(r.categories)); }, []);
  const cat = cats.find((c) => c.code === f.categoryCode);
  useEffect(() => { if (cat?.species) api("/breeds", { query: { species: cat.species } }).then((r) => setBreeds(r.breeds)); }, [cat?.species]);
  useEffect(() => { if (f.categoryCode && f.regionCode) api("/listings/price-hint", { query: { category: f.categoryCode, region: f.regionCode, unit: f.priceType } }).then((r) => setHint(r.hint)).catch(() => setHint(null)); }, [f.categoryCode, f.regionCode, f.priceType]);
  useEffect(() => { if (pos && !f.point) setF((x: any) => ({ ...x, point: pos })); }, [pos]);
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  const setA = (k: string, v: any) => setF((x: any) => ({ ...x, attributes: { ...x.attributes, [k]: v } }));
  const kinds = [["livestock", t.listing.livestock, "cow"], ["meat", t.listing.meat, "meat"], ["service", t.listing.service, "tools"], ["wanted", t.listing.wanted, "paw"]] as const;
  const catList = useMemo(() => { const kind = f.kind === "wanted" ? null : f.kind; const tops = cats.filter((c) => !c.parent_code && (!kind || c.kind === kind)); return tops.flatMap((tp) => { const subs = cats.filter((c) => c.parent_code === tp.code); return subs.length ? subs : [tp]; }); }, [cats, f.kind]);
  const defs: any[] = cat?.attributes ?? [];
  const species = SPECIES_OF_CATEGORY(f.categoryCode) as any;
  const weight = Number(f.avgWeightKg || f.attributes.live_weight_kg || 0);
  const y = f.kind === "livestock" && weight > 0 && species && species !== "other" ? slaughterYield(species, weight, f.attributes.fatness ?? "medium", !!f.attributes.fat_tailed) : null;
  const titles = [t.listing.kind, t.home.categories, t.listing.photos, t.listing.title, locale === "kk" ? "Сипаттамалары" : "Характеристики", t.listing.location, locale === "kk" ? "Тексеру" : "Проверка"];
  const canNext = [!!f.kind, !!f.categoryCode, f.kind !== "livestock" || photos.filter((p) => p.kind === "image").length >= 3, f.title.length >= 3 && (f.priceType === "negotiable" || Number(f.priceKzt) > 0), true, !!f.regionCode && !!f.point, true][step];
  const priceTypes = f.kind === "meat" ? ["per_kg_meat", "per_lot", "negotiable"] : ["per_head", "per_kg_live", "per_lot", "negotiable"];
  const ptName: Record<string, string> = { per_head: t.common.perHead, per_kg_live: t.common.perKgLive, per_kg_meat: t.common.perKgMeat, per_lot: t.common.perLot, negotiable: t.common.negotiable };

  const payload = () => ({
    kind: f.kind, categoryCode: f.categoryCode, [locale === "kk" ? "titleKk" : "titleRu"]: f.title, [locale === "kk" ? "descriptionKk" : "descriptionRu"]: f.description || undefined, sourceLocale: locale,
    priceType: f.priceType, priceKzt: f.priceType === "negotiable" ? null : Number(f.priceKzt), bargain: f.bargain, quantity: Number(f.quantity) || 1, isLot: Number(f.quantity) > 1,
    avgWeightKg: f.avgWeightKg ? Number(f.avgWeightKg) : null, weightMinKg: f.weightMinKg ? Number(f.weightMinKg) : null, weightMaxKg: f.weightMaxKg ? Number(f.weightMaxKg) : null,
    attributes: f.attributes, tagNumbers: f.tagNumbers.split(/[\s,;]+/).filter(Boolean), regionCode: f.regionCode, lat: f.point.lat, lng: f.point.lng, addressHidden: true, deliveryOptions: f.deliveryOptions, escrowAvailable: f.escrowAvailable,
    neededBy: f.neededBy ? new Date(f.neededBy).toISOString() : null, __publish: true,
  });
  const submit = async () => {
    setBusy(true); setErr(null);
    const draft = { clientDraftId: crypto.randomUUID(), payload: payload(), photos: photos.map((p) => ({ name: p.name, blob: p.blob })), createdAt: Date.now(), status: "pending" as const };
    try { await saveDraft(draft); if (navigator.onLine) await syncDrafts(submitDraft); router.push(href("/profile?tab=listings")); } catch (e: any) { setErr(e?.code ?? e?.message ?? "error"); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="steps" aria-hidden="true">{titles.map((_, i) => <span key={i} className={i < step ? "is-done" : i === step ? "is-now" : ""} />)}</div>
      <div><p className="sub">{locale === "kk" ? `${step + 1}-қадам, барлығы 7` : `Шаг ${step + 1} из 7`}</p><h1 className="h-lead" style={{ fontSize: "2rem" }}>{titles[step]}</h1></div>

      {step === 0 && <div className="wizard-cats">{kinds.map(([k, label, icon]) => <button key={k} type="button" onClick={() => { set("kind", k); set("categoryCode", ""); set("priceType", k === "meat" ? "per_kg_meat" : "per_head"); setStep(1); }} className="tile" style={{ minHeight: "6rem" }}><CategoryIcon icon={icon} /><span className="tile-title" style={{ textTransform: "none", letterSpacing: 0, fontFamily: "var(--font-text)", fontWeight: 500 }}>{label}</span><span className="tile-sub">{k === "livestock" ? "ІҚМ, ұсақ мал, жылқы, түйе, құс" : k === "meat" ? "ет, қазы, шұжық" : k === "service" ? "сою, тасымалдау, мал дәрігері" : "сұраныс"}</span></button>)}</div>}
      {step === 1 && <div className="wizard-cats">{catList.map((c) => <button key={c.code} type="button" onClick={() => { set("categoryCode", c.code); setStep(2); }} className="tile" aria-pressed={f.categoryCode === c.code}><CategoryIcon icon={c.icon} /><span className="tile-title">{c.name_kk}</span><span className="tile-sub">{c.name_ru}</span></button>)}</div>}
      {step === 2 && <><p className="sub">{locale === "kk" ? "Әр жағынан кемінде үш фото. Партия үшін қысқа видео түсіріңіз: сатып алушы бүкіл отараны көреді." : "Минимум три фото с разных сторон. Для партии снимите короткое видео: покупатель видит всю отару."}</p><PhotoCapture items={photos} onChange={setPhotos} /></>}
      {step === 3 && (
        <div className="stack">
          <label className="label" htmlFor="title">{t.listing.title}</label>
          <input id="title" className="field" value={f.title} onChange={(e) => set("title", e.target.value)} maxLength={140} placeholder={locale === "kk" ? "Еділбай қошқарлары, 50 бас, 60–70 кг" : "Едильбаевские бараны, 50 голов, 60–70 кг"} />
          <div className="row between"><label className="label" htmlFor="desc">{t.listing.description}</label><VoiceInput onText={(txt) => set("description", (f.description ? f.description + " " : "") + txt)} /></div>
          <textarea id="desc" className="field" value={f.description} onChange={(e) => set("description", e.target.value)} />
          {f.kind !== "service" && <div className="actions">
            <label><span className="label">{f.kind === "meat" ? `${t.listing.quantity}, ${t.common.kg}` : t.listing.quantity}</span><input className="field" type="number" inputMode="numeric" min={1} value={f.quantity} onChange={(e) => set("quantity", e.target.value)} /></label>
            {f.kind !== "meat" && <label><span className="label">{t.listing.avgWeight}, {t.common.kg}</span><input className="field" type="number" inputMode="numeric" value={f.avgWeightKg} onChange={(e) => set("avgWeightKg", e.target.value)} /></label>}
            {Number(f.quantity) > 1 && f.kind !== "meat" && <><label><span className="label">{t.listing.weightSpread}, {t.common.from}</span><input className="field" type="number" inputMode="numeric" value={f.weightMinKg} onChange={(e) => set("weightMinKg", e.target.value)} /></label><label><span className="label">{t.common.to}</span><input className="field" type="number" inputMode="numeric" value={f.weightMaxKg} onChange={(e) => set("weightMaxKg", e.target.value)} /></label></>}
          </div>}
          <span className="label">{t.listing.priceType}</span>
          <div className="chips">{priceTypes.map((pt) => <button key={pt} type="button" onClick={() => set("priceType", pt)} className="chip" aria-pressed={f.priceType === pt}>{ptName[pt]}</button>)}</div>
          {f.priceType !== "negotiable" && <><label className="label" htmlFor="price">{t.listing.price}, ₸</label><input id="price" className="field num" style={{ fontSize: "1.5rem" }} type="number" inputMode="numeric" value={f.priceKzt} onChange={(e) => set("priceKzt", e.target.value)} /></>}
          {hint && <div className="panel panel--yellow"><b>{t.listing.priceHint}: {money(hint.median_kzt)}</b><br /><span className="small">{money(hint.p25_kzt ?? hint.min_kzt)} – {money(hint.p75_kzt ?? hint.max_kzt)}, {hint.count} {locale === "kk" ? "хабарландыру" : "объявлений"}{hint.scope !== "region" ? ` (${locale === "kk" ? "ел бойынша" : "по стране"})` : ""}</span></div>}
          <label className="check"><input type="checkbox" checked={f.bargain} onChange={(e) => set("bargain", e.target.checked)} />{t.common.bargain}</label>
          {y && <div className="panel panel--surface"><b>{t.listing.yieldCalc}: ≈ {y.carcassKg} {t.common.kg}</b> <span className="small">({Math.round(y.ratio * 100)} %)</span></div>}
          {f.kind === "wanted" && <label><span className="label">{locale === "kk" ? "Қай күнге дейін керек" : "До какой даты нужно"}</span><input className="field" type="date" value={f.neededBy} onChange={(e) => set("neededBy", e.target.value)} /></label>}
        </div>
      )}
      {step === 4 && (
        <div className="stack">
          {defs.length === 0 && <p className="sub">{locale === "kk" ? "Бұл санатта қосымша өрістер жоқ." : "Для этой категории дополнительных полей нет."}</p>}
          {defs.map((d: any) => {
            const label = (locale === "kk" ? d.labelKk : d.labelRu) + (d.required ? " *" : ""); const v = f.attributes[d.code]; const id = `a-${d.code}`;
            if (d.code === "breed") return <label key={d.code}><span className="label">{label}</span><select className="field" value={v ?? ""} onChange={(e) => setA(d.code, e.target.value)}><option value="">—</option>{breeds.map((b) => <option key={b.code} value={b.code}>{name(b)}</option>)}</select></label>;
            if (d.type === "select") return <label key={d.code}><span className="label">{label}</span><select className="field" value={v ?? ""} onChange={(e) => setA(d.code, e.target.value)}><option value="">—</option>{d.options?.map((o: any) => <option key={o.value} value={o.value}>{o[locale]}</option>)}</select></label>;
            if (d.type === "multiselect") return <div key={d.code}><span className="label">{label}</span><div className="chips">{d.options?.map((o: any) => { const arr: string[] = v ?? []; const on = arr.includes(o.value); return <button key={o.value} type="button" onClick={() => setA(d.code, on ? arr.filter((x) => x !== o.value) : [...arr, o.value])} className="chip" aria-pressed={on}>{o[locale]}</button>; })}</div></div>;
            if (d.type === "boolean") return <label key={d.code} className="check"><input type="checkbox" checked={!!v} onChange={(e) => setA(d.code, e.target.checked)} />{label}</label>;
            if (d.type === "number") return <label key={d.code}><span className="label">{label}{d.unit ? `, ${d.unit}` : ""}</span><input className="field" type="number" inputMode="numeric" value={v ?? ""} onChange={(e) => setA(d.code, e.target.value ? Number(e.target.value) : undefined)} /></label>;
            if (d.type === "date") return <label key={d.code}><span className="label">{label}</span><input className="field" type="date" value={v ?? ""} onChange={(e) => setA(d.code, e.target.value)} /></label>;
            return <label key={d.code} htmlFor={id}><span className="label">{label}</span><input id={id} className="field" value={v ?? ""} onChange={(e) => setA(d.code, e.target.value)} /></label>;
          })}
          {f.kind === "livestock" && <label><span className="label">{t.listing.tags}</span><textarea className="field" style={{ minHeight: "4.5rem" }} placeholder="KZ123456789, KZ123456790" value={f.tagNumbers} onChange={(e) => set("tagNumbers", e.target.value)} /></label>}
        </div>
      )}
      {step === 5 && (
        <div className="stack">
          <RegionPicker value={f.regionCode} onChange={(code, r) => { set("regionCode", code); if (r?.lat && !f.point) set("point", { lat: r.lat, lng: r.lng }); }} geo={pos} />
          <p className="sub">{locale === "kk" ? "Картада нүктені белгілеңіз. Сатып алушыға ол 1–2 км дәлдікпен көрсетіледі, нақты мекенжай жасырын." : "Отметьте точку на карте. Покупателю она показывается с точностью 1–2 км, точный адрес скрыт."}</p>
          <PointPicker value={f.point} onChange={(p) => set("point", p)} />
          <span className="label">{t.listing.delivery}</span>
          <div className="chips">{[["pickup", t.listing.pickup], ["seller_delivery", t.listing.sellerDelivery], ["platform_carrier", t.listing.platformCarrier]].map(([k, label]) => { const on = f.deliveryOptions.includes(k); return <button key={k} type="button" onClick={() => set("deliveryOptions", on ? f.deliveryOptions.filter((x: string) => x !== k) : [...f.deliveryOptions, k])} className="chip" aria-pressed={on}>{label}</button>; })}</div>
          <label className="check"><input type="checkbox" checked={f.escrowAvailable} onChange={(e) => set("escrowAvailable", e.target.checked)} />{t.listing.actions.escrow}</label>
        </div>
      )}
      {step === 6 && (
        <div className="panel" style={{ background: "var(--surface)" }}>
          <h2 className="h-lead">{f.title}</h2>
          <dl className="kv" style={{ marginTop: "0.8rem" }}>
            <dt>{t.home.categories}</dt><dd>{name(cat)}</dd>
            <dt>{t.listing.price}</dt><dd>{f.priceType === "negotiable" ? t.common.negotiable : `${money(Number(f.priceKzt))}, ${ptName[f.priceType]}`}</dd>
            <dt>{t.listing.quantity}</dt><dd>{f.quantity}</dd>
            <dt>{t.listing.photos}</dt><dd>{photos.length}</dd>
            <dt>{t.filters.region}</dt><dd>{f.regionCode}</dd>
          </dl>
          {err && <p className="text-red" style={{ marginTop: "0.8rem" }}>{err}</p>}
          <p className="sub" style={{ marginTop: "0.8rem" }}>{locale === "kk" ? "Байланыс болмаса, хабарландыру телефонда сақталып, желі пайда болғанда жіберіледі." : "Если связи нет, объявление сохранится в телефоне и уйдёт, когда появится сеть."}</p>
        </div>
      )}
      <div className="actions" style={{ position: "sticky", bottom: "4.5rem", background: "var(--bg)", paddingBlock: "0.5rem" }}>
        {step > 0 ? <button type="button" onClick={() => setStep(step - 1)} className="btn btn--white">{t.common.back}</button> : <span />}
        {step < 6 ? <button type="button" disabled={!canNext} onClick={() => setStep(step + 1)} className="btn btn--ink">{t.common.next}</button> : <button type="button" disabled={busy} onClick={submit} className="btn">{busy ? t.common.loading : t.common.publish}</button>}
      </div>
    </>
  );
}

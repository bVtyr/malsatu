"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Слой движения приложения: reveal-ы на скролле ([data-reveal]), счётчики ([data-count]), сжатие шапки, тосты. Без JS контент виден. */
export function Motion() {
  const path = usePathname();
  useEffect(() => {
    document.documentElement.classList.add("js");
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } }, { rootMargin: "0px 0px -10% 0px", threshold: 0.08 });
    document.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));
    const co = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { const el = e.target as HTMLElement; const end = Number(el.dataset.count); const suf = el.dataset.suffix ?? ""; co.unobserve(el); if (reduce) { el.textContent = end + suf; continue; } const t0 = performance.now(); const step = (t: number) => { const p = Math.min(1, (t - t0) / 900); el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3))) + suf; if (p < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); } }, { threshold: 0.5 });
    document.querySelectorAll("[data-count]").forEach((el) => co.observe(el));
    const main = document.querySelector(".page"); if (main && !reduce) { main.classList.remove("page-enter"); void (main as HTMLElement).offsetWidth; main.classList.add("page-enter"); }
    const top = document.querySelector(".app-top");
    const onScroll = () => top?.classList.toggle("is-scrolled", scrollY > 24);
    onScroll(); addEventListener("scroll", onScroll, { passive: true });
    return () => { io.disconnect(); co.disconnect(); removeEventListener("scroll", onScroll); };
  }, [path]);
  return null;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
/** Короткое подтверждение действия внизу экрана. */
export function toast(text: string) {
  if (typeof document === "undefined") return;
  let el = document.querySelector<HTMLDivElement>(".toast");
  if (!el) { el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite"); document.body.appendChild(el); }
  el.textContent = text; requestAnimationFrame(() => el!.classList.add("is-on"));
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el!.classList.remove("is-on"), 2400);
}

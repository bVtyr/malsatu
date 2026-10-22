import { NextResponse, type NextRequest } from "next/server";
const LOCALES = ["kk", "ru"];
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api") || pathname.startsWith("/_next") || pathname.includes(".") ) return;
  const has = LOCALES.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`));
  if (has) return;
  const cookie = req.cookies.get("locale")?.value;
  const header = req.headers.get("accept-language") ?? "";
  const locale = cookie && LOCALES.includes(cookie) ? cookie : header.toLowerCase().startsWith("kk") ? "kk" : "ru";
  return NextResponse.redirect(new URL(`/${locale}${pathname === "/" ? "" : pathname}${req.nextUrl.search}`, req.url));
}
export const config = { matcher: ["/((?!_next|api|.*\\..*).*)"] };

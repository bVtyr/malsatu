/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@malsatu/shared"],
  images: { remotePatterns: [{ protocol: "https", hostname: process.env.NEXT_PUBLIC_MEDIA_HOST ?? "picsum.photos" }, { protocol: "http", hostname: "localhost" }], formats: ["image/webp"] },
  experimental: { optimizePackageImports: ["@malsatu/shared"] },
  async headers() {
    const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
    const ws = api.replace(/^http/, "ws");
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      `connect-src 'self' ${api} ${ws} https://tile.openstreetmap.org`,
      "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'",
    ].join("; ");
    const security = [
      { key: "Content-Security-Policy", value: csp },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self), payment=()" },
      { key: "X-Frame-Options", value: "DENY" },
    ];
    return [
      { source: "/(.*)", headers: security },
      { source: "/sw.js", headers: [{ key: "Service-Worker-Allowed", value: "/" }, { key: "Cache-Control", value: "no-cache" }] },
    ];
  },
};
export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@malsatu/shared"],
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }, { protocol: "http", hostname: "localhost" }], formats: ["image/webp"] },
  experimental: { optimizePackageImports: ["@malsatu/shared"], viewTransition: true },
  async headers() { return [{ source: "/sw.js", headers: [{ key: "Service-Worker-Allowed", value: "/" }, { key: "Cache-Control", value: "no-cache" }] }]; },
};
export default nextConfig;

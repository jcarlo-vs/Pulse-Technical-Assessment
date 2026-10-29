import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Only what the app actually loads: our own bundle + Mapbox (tiles, styles,
// fonts, telemetry; it builds its renderer workers from blob: URLs).
// WebRTC media/data and STUN are not governed by connect-src.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.mapbox.com",
  "font-src 'self'",
  `connect-src 'self' https://*.mapbox.com${isDev ? " ws:" : ""}`,
  "worker-src 'self' blob:",
  "child-src blob:",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'", // no clickjacking into camera/mic prompts
].join("; ");

const nextConfig: NextConfig = {
  // Dev only: hosts allowed to load dev assets, e.g. testing on a phone over
  // a tunnel. Set PULSE_DEV_ORIGINS="abc.trycloudflare.com" in .env.local;
  // empty by default, so nothing is opened up unless you ask for it.
  allowedDevOrigins: (process.env.PULSE_DEV_ORIGINS ?? "").split(",").filter(Boolean),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), geolocation=(self), interest-cohort=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ],
      },
      {
        // Coordination API responses are per-user and must never be cached.
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;

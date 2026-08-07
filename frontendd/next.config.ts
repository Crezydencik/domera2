import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/shared/i18n/request.ts");

function trimTrailingSlashes(value: string) {
  return value.replace(/\/+$/, "");
}

function normalizeApiBaseUrl(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimTrailingSlashes(trimmed);
  }

  return undefined;
}

function appendApiPath(value?: string) {
  const baseUrl = normalizeApiBaseUrl(value);
  if (!baseUrl) return undefined;

  return baseUrl.endsWith("/api") ? baseUrl : `${baseUrl}/api`;
}

const backendApiBaseUrl =
  normalizeApiBaseUrl(process.env.API_BASE_URL) ??
  appendApiPath(process.env.BACKEND_URL) ??
  (process.env.NODE_ENV === "production" ? "https://domeraback.vercel.app/api" : "http://127.0.0.1:4000/api");
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID?.trim() || "domera-eb224";

const securityHeaders = [
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  ...(process.env.NODE_ENV === "production"
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
      },
    ],
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
  async rewrites() {
    return [
      {
        source: "/__/auth/:path*",
        destination: `https://${firebaseProjectId}.firebaseapp.com/__/auth/:path*`,
      },
      {
        source: "/api/:path*",
        destination: `${backendApiBaseUrl}/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default withNextIntl(nextConfig);

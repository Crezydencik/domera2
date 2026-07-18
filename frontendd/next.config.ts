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
  (process.env.NODE_ENV === "production" ? "https://domeraback.vercel.app/api" : "http://localhost:4000/api");
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID?.trim() || "domera-eb224";

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
};

export default withNextIntl(nextConfig);

import type { NextConfig } from "next";

/**
 * Content-Security-Policy. `script-src`/`style-src` still need 'unsafe-inline'
 * because Next's App Router injects inline hydration/streaming scripts and the
 * UI (next-themes, recharts) sets inline styles — a nonce-per-request scheme is
 * the only way to drop that, and is easy to get subtly wrong. Even so this is a
 * real gain: `connect-src 'self'` blocks exfiltration to any foreign origin,
 * `object-src 'none'` kills plugin vectors, and `base-uri`/`form-action`/
 * `frame-ancestors` close base-tag, form-hijack, and clickjacking vectors.
 * All browser resources are same-origin (next/font self-hosts Inter at build
 * time; no remote images, scripts, or fetches). Applied in PRODUCTION only —
 * Turbopack dev HMR needs 'unsafe-eval' and a websocket connection.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
].join("; ");

// Baseline security headers for every response.
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Content-Security-Policy", value: contentSecurityPolicy }]
    : []),
];

const nextConfig: NextConfig = {
  // Do not advertise the framework/version.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Native/WASM packages that must load from node_modules at runtime rather
  // than be traced into the bundle: MuPDF (WASM path resolution), sharp
  // (native binary), and tesseract.js (loads its WASM core + worker from
  // node_modules). Keep these external so the server build resolves them.
  serverExternalPackages: ["mupdf", "sharp", "tesseract.js"],
  // The PDF letterheads read the bank logo from public/ with fs.readFile —
  // a dynamic path the serverless file tracer cannot see, so include it
  // explicitly or the deployed function silently falls back to the text
  // wordmark.
  outputFileTracingIncludes: {
    "/api/cases/[caseId]/analysis-pdf": ["./public/bank-logo.*"],
  },
  experimental: {
    // Every request (statement uploads included) passes through the auth
    // middleware, and Next caps middleware-buffered bodies at 10 MiB by
    // default — the exact same value as our own MAX_STATEMENT_FILE_BYTES.
    // A PDF at the advertised 10 MB limit therefore exceeds the cap once
    // multipart overhead is added and fails with an opaque parse error.
    // Give headroom above the app limit so document-service stays the real
    // gate and rejects oversized files with a clear message.
    middlewareClientMaxBodySize: 12 * 1024 * 1024,
  },
};

export default nextConfig;

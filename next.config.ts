import type { NextConfig } from "next";

// Baseline security headers for every response. A strict Content-Security-Policy
// is intentionally deferred (it needs per-request nonces for Next's inline
// runtime and is easy to get subtly wrong); these headers are the safe wins.
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Do not advertise the framework/version.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // MuPDF ships a WASM binary that must be loaded from node_modules by the
  // Node runtime — bundling it breaks the wasm file path resolution.
  serverExternalPackages: ["mupdf"],
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

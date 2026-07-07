import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

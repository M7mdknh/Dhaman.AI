import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // MuPDF ships a WASM binary that must be loaded from node_modules by the
  // Node runtime — bundling it breaks the wasm file path resolution.
  serverExternalPackages: ["mupdf"],
};

export default nextConfig;

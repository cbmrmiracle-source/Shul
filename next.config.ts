import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Loaded from node_modules at runtime rather than bundled.
  serverExternalPackages: ["playwright-core"],
  experimental: {
    // Image uploads go through server actions; allow up to 10 MB plus form overhead.
    serverActions: { bodySizeLimit: "11mb" },
  },
};

export default nextConfig;

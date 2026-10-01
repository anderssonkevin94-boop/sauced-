import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tidy up sends a photo through a server action; the 1 MB default is too tight.
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;

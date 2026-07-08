import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Configures security headers to isolate the classroom page, enabling SharedArrayBuffers.
  // WHY WE SCOPE THIS ONLY TO /classroom:
  // COOP and COEP block cross-origin loading. Applying them globally would break OAuth logins,
  // CDN resources, or external embeds on other pages. Scoping it keeps the login flow and overall site functional.
  allowedDevOrigins: ['10.168.184.121'],
  async headers() {
    return [
      {
        source: "/classroom",
        headers: [
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
      {
        source: "/classroom/:path*",
        headers: [
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;

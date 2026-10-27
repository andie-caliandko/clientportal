import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The brand fonts that PDFs embed (read from disk at run time): downloads, and copies saved to Drive from
  // server actions and background work on many pages, so every route gets them.
  outputFileTracingIncludes: {
    "/**": ["./assets/fonts/*.ttf"],
  },
  async redirects() {
    return [
      // The Schedule page was renamed Calendar; keep old links and bookmarks working.
      { source: "/team/schedule", destination: "/team/calendar", permanent: true },
    ];
  },
};

export default nextConfig;

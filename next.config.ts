import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The brand fonts that downloaded PDFs embed (read from disk at run time).
  outputFileTracingIncludes: {
    "/api/shoots/[id]/plan.pdf": ["./assets/fonts/*.ttf"],
    "/team/clients/[id]/answers.pdf": ["./assets/fonts/*.ttf"],
  },
  async redirects() {
    return [
      // The Schedule page was renamed Calendar; keep old links and bookmarks working.
      { source: "/team/schedule", destination: "/team/calendar", permanent: true },
    ];
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // The Schedule page was renamed Calendar; keep old links and bookmarks working.
      { source: "/team/schedule", destination: "/team/calendar", permanent: true },
    ];
  },
};

export default nextConfig;

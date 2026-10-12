import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Receipt photos for the POS reader (shrunk to 1800px in the browser; the action allows 4 MB).
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;

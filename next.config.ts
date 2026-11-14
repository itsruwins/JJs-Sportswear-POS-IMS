import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a phone or tablet on the shop's Wi-Fi open the dev server by its network address
  // (http://192.168.x.x:3000). Without it the page shows but no button works. Development only.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
  // The design studio's server actions read the blank garments from disk and send them to FLUX.
  outputFileTracingIncludes: {
    "/design": ["./public/design-blanks/**/*"],
  },
  experimental: {
    serverActions: {
      // Receipt photos for the POS reader (shrunk to 1800px in the browser; the action allows 4 MB).
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;

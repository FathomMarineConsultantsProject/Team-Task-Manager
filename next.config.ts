import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
}
// next.config.js
module.exports = {
  allowedDevOrigins: ['192.168.0.8'],
};

export default nextConfig;

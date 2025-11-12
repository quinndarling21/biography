import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;

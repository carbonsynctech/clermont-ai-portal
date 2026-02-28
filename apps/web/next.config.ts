import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    // Point Turbopack at the monorepo root so it finds the root .env.local
    root: path.resolve(__dirname, "../.."),
  },
};

export default nextConfig;

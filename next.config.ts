import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["mssql", "tedious"],
};

export default nextConfig;

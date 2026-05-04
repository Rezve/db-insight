import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["mssql", "tedious", "better-sqlite3"],
};

export default nextConfig;

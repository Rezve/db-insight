import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["mssql", "tedious", "better-sqlite3"],
};

export default nextConfig;

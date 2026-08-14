/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3-free setup: Prisma bundles its own engine.
  serverExternalPackages: ["@prisma/client"],
};

export default nextConfig;

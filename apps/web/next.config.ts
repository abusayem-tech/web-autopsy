import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@web-autopsy/core"],
  serverExternalPackages: ["pg", "drizzle-orm"],
};

export default nextConfig;

import type { NextConfig } from "next";

// Локальный обход самоподписанных/перехватываемых сертификатов на Windows
if (process.env.NODE_ENV !== "production") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
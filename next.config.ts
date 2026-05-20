import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.1.201', 'localhost'],
  serverExternalPackages: ['@lancedb/lancedb'],
  /* config options here */
};

export default withNextIntl(nextConfig);

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@meeting-bingo/types', '@meeting-bingo/config', '@meeting-bingo/validation'],
};

export default nextConfig;

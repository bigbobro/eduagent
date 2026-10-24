/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['framer-motion'],
  experimental: {
    optimizePackageImports: ['framer-motion'],
  },
  // 桌面 App 打包(desktop/scripts/stage.mjs)才开;pnpm dev / 普通 build 不受影响。
  ...(process.env.EDUAGENT_STANDALONE === '1' ? {
    output: 'standalone',
    async rewrites() {
      return [{ source: '/images/:path*.png', destination: '/images-webp/:path*.webp' }];
    },
  } : {}),
};

export default nextConfig;

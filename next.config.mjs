/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['framer-motion'],
  // All images are local course art. The optimizer would cache resized copies under .next/cache
  // at runtime, which in the packaged app is inside the signed .app bundle and breaks its code
  // signature (and with it the macOS microphone grant). Serve the files as they are.
  images: { unoptimized: true },
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

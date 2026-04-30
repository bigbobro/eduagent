/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['framer-motion'],
  experimental: {
    optimizePackageImports: ['framer-motion'],
  },
};

export default nextConfig;

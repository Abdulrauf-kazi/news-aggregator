/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // Required for Docker deployment

  typescript: {
    ignoreBuildErrors: true, // Prevents build failure on type mismatches
  },

  eslint: {
    ignoreDuringBuilds: true, // Prevents build failure on linting warnings
  },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com', // Required for Google profile photos
      },
    ],
  },
};

export default nextConfig;

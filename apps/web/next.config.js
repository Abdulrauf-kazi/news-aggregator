/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produces a minimal standalone build for Docker deployment.
  // Next.js will trace all file dependencies and bundle only what's needed.
  output: 'standalone',
  serverExternalPackages: ['jsdom'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
};

export default nextConfig;

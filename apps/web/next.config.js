/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // Required for Docker deployment

  // In-process embedding model (transformers.js + native ONNX Runtime) must not be bundled.
  serverExternalPackages: ['@huggingface/transformers', 'onnxruntime-node'],

  typescript: {
    ignoreBuildErrors: true, // Prevents build failure on type mismatches
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

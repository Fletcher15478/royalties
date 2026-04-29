/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // The Square Node SDK relies on Node APIs and is best kept external to the RSC bundle.
    serverComponentsExternalPackages: ["square"],
  },
};

export default nextConfig;


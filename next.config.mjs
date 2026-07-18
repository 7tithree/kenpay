/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output = self-contained server bundle for the Docker image
  output: "standalone",
  // pdfkit loads its .afm font metrics from node_modules at runtime; keep it
  // unbundled so those files resolve (file tracing still copies them into standalone)
  experimental: { serverComponentsExternalPackages: ["pdfkit"] },
};
export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = { ...config.resolve.fallback, fs: false };
    }
    // Cesium pulls in @spz-loader/core (Gaussian-splat WASM) which inlines a WASM
    // binary as a template literal containing octal escapes — illegal JS that
    // breaks the minified production bundle. We don't use splats, so stub it out.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@spz-loader/core": false,
    };
    // Import .md files as raw strings (used by the /methodology page to render
    // docs/METHODOLOGY.md). Bundling avoids runtime file-tracing issues on Vercel.
    config.module.rules.push({ test: /\.md$/, type: "asset/source" });
    return config;
  },
};

export default nextConfig;

/** @type {import('@remix-run/dev').AppConfig} */
module.exports = {
  serverDependenciesToBundle: [
    // Bundle these packages on the server to handle ESM/CJS issues
    "@supabase/supabase-js",
    "@supabase/auth-helpers-remix",
  ],
  serverModuleFormat: "cjs",
  tailwind: true,
  postcss: true,
  watchPaths: ["./tailwind.config.ts"],
  serverMinify: false,
  future: {
    v2_errorBoundary: true,
    v2_meta: true,
    v2_normalizeFormMethod: true,
    v2_routeConvention: true,
  },
  // Expose environment variables to the client
  publicPath: "/build/",
  serverBuildPath: "build/index.js",
  assetsBuildDirectory: "public/build",
  ignoredRouteFiles: ["**/.*"],
};

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* v2.26b diagnosis — LAN phone testing: Next dev blocks cross-origin
     requests to /_next dev resources by default (verbatim server warning:
     'Blocked cross-origin request to Next.js dev resource /_next/webpack-hmr
     from "192.168.0.97"'), which left Jason's phone with server-rendered
     HTML but no hydration — dead login handlers, no metals prices,
     autofill wiped. Dev-only setting; no effect on production builds. */
  allowedDevOrigins: ["192.168.0.97"],
};

export default nextConfig;

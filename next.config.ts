import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* v2.26b diagnosis — LAN phone testing: Next dev blocks cross-origin
     requests to /_next dev resources by default (verbatim server warning:
     'Blocked cross-origin request to Next.js dev resource /_next/webpack-hmr
     from "192.168.0.97"'), which left Jason's phone with server-rendered
     HTML but no hydration — dead login handlers, no metals prices,
     autofill wiped. Dev-only setting; no effect on production builds. */
  allowedDevOrigins: ["192.168.0.97"],

  /* v4.54 — Collector Dossier PDF generation in production lambdas: the
     bundler must not relocate @sparticuz/chromium, or its bin/ payload is
     dropped from the function bundle and Chromium cannot launch (observed
     live: "/var/task/node_modules/@sparticuz/chromium/bin does not
     exist"). Externalizing keeps the package — binary included — traced
     verbatim into every function that dynamically imports the PDF
     renderer. puppeteer-core rides along for the same reason. */
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
};

export default nextConfig;

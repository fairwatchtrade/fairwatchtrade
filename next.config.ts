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
  /* v5.97 — sharp joins explicitly. Next externalizes sharp by default, but
     the production lambdas began failing to dlopen its libvips payload
     (observed live on /api/presentation-thumb: ERR_DLOPEN_FAILED
     libvips-cpp.so.8.18.3 missing — the trace copied @img/sharp-linux-x64
     yet dropped @img/sharp-libvips-linux-x64, killing every Browse card).
     Repo inputs were unchanged since the route's live-proven era, so the
     inclusion is now explicit and deterministic, exactly the Chromium
     ruling above: never depend on the builder tracing a native payload
     it cannot see. */
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core", "sharp"],

  /* v6.44 — agent-native discovery, at the address machines look first.
     An assistant that has never seen this site before probes a well-known
     path rather than guessing at API routes, and a well-known path is
     provider-neutral in a way a vendor manifest is not. Next ignores app
     directories whose name begins with a dot, so the descriptor lives at
     /api/discovery and is REWRITTEN here rather than duplicated — one
     document, two addresses, no second copy to drift. */
  async rewrites() {
    return [
      { source: "/.well-known/fwt-discovery.json", destination: "/api/discovery" },
    ];
  },

  /* The Chromium binary is opened via fs at runtime, which static tracing
     cannot see — the bin payload must be included explicitly for every
     function that can render a Dossier PDF. Scoped to those routes only:
     the payload is ~50MB and does not belong in every lambda. */
  /* These keys are picomatch route globs, not plain strings — an unescaped
     dynamic segment like [id] is a character class matching a single "i" or
     "d", so the include silently applies to no real route (observed live:
     the recheck lambda shipped without libvips and died ERR_DLOPEN_FAILED
     while the statically-keyed /api/listings lambda loaded sharp fine).
     Dynamic segments in keys must escape their brackets. */
  outputFileTracingIncludes: {
    "/api/internal/collector-dossiers/regenerate/\\[listingId\\]": [
      "./node_modules/@sparticuz/chromium/bin/**",
    ],
    "/api/internal/collector-dossiers/draft-preview/\\[referenceId\\]/pdf": [
      "./node_modules/@sparticuz/chromium/bin/**",
    ],
    "/api/internal/collector-dossiers/breguet-5967bb-11-9w6/pdf": [
      "./node_modules/@sparticuz/chromium/bin/**",
    ],
    "/api/admin/listings/\\[id\\]/status": [
      "./node_modules/@sparticuz/chromium/bin/**",
    ],

    /* Auction Operations — the plan route reads the registered packet
       manifests from the repository at runtime (fs, not import), so they
       must be traced into the lambda explicitly or planning dies with
       ENOENT in production while working locally. */
    "/api/admin/auctions/results/plan": [
      "./scripts/phillips/*.json",
      "./scripts/monaco-legend/*.json",
    ],
    "/api/admin/listings/\\[id\\]/recheck": [
      "./node_modules/@sparticuz/chromium/bin/**",
      "./node_modules/sharp/**",
      "./node_modules/@img/**",
    ],

    /* v5.97 — every lambda that decodes pixels carries sharp's native
       payload explicitly (the platform packages under @img/ hold libvips;
       the builder installs only its own platform's variants, so the glob
       stays small). The five routes below are the complete set of sharp
       importers: the Gallery-card trim, serial blurring, dealer logo
       derivation, and the Aubrey Check pair. */
    "/api/presentation-thumb": [
      "./node_modules/sharp/**",
      "./node_modules/@img/**",
    ],
    "/api/blur-serial": [
      "./node_modules/sharp/**",
      "./node_modules/@img/**",
    ],
    "/api/account/dealer-profile": [
      "./node_modules/sharp/**",
      "./node_modules/@img/**",
    ],
    "/api/listings": [
      "./node_modules/sharp/**",
      "./node_modules/@img/**",
    ],
  },
};

export default nextConfig;

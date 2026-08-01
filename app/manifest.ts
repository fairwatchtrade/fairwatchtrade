import type { MetadataRoute } from "next";

/* The web app manifest — what Android reads for the install/splash surface.
   Background and theme are the house ink and gold, so the loading splash
   wears FairWatchTrade's colors with the F/W monogram, never a white page
   with a scaled-up favicon. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FairWatchTrade",
    short_name: "FairWatchTrade",
    description: "Curated and verified watch marketplace.",
    start_url: "/",
    display: "browser",
    background_color: "#0D0F14",
    theme_color: "#0D0F14",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

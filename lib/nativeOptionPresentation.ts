/* Native option popups do not reliably consume CSS custom properties. Keep
   concrete color values, but let color-scheme select the governed appearance
   arm instead of fixing every popup to the dark product palette. */
export const NATIVE_OPTION_STYLE = {
  backgroundColor: "light-dark(#FAF7F0, #141821)",
  color: "light-dark(#25231F, #E8E4DC)",
} as const;

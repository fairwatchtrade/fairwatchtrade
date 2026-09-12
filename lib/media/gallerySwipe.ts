const SWIPE_THRESHOLD_PX = 44;
const HORIZONTAL_DOMINANCE = 1.2;

/**
 * Resolves a completed resting-gallery gesture into the existing modular
 * photo-cycle direction. Vertical intent and short drags deliberately return
 * zero so the document remains the owner of ordinary page scrolling.
 */
export function gallerySwipeDirection(deltaX: number, deltaY: number): -1 | 0 | 1 {
  const horizontal = Math.abs(deltaX);
  const vertical = Math.abs(deltaY);

  if (
    horizontal <= SWIPE_THRESHOLD_PX ||
    horizontal <= vertical * HORIZONTAL_DOMINANCE
  ) {
    return 0;
  }

  return deltaX < 0 ? 1 : -1;
}

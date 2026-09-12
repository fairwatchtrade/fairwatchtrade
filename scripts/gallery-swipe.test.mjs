import assert from "node:assert/strict";
import test from "node:test";

let gallerySwipeDirection;
try {
  ({ gallerySwipeDirection } = await import("../lib/media/gallerySwipe.ts"));
} catch {
  // The first TDD run reaches the assertion below while the helper is absent.
}

test("a deliberate horizontal gesture pages while short or vertical gestures preserve the page", () => {
  assert.equal(
    typeof gallerySwipeDirection,
    "function",
    "the resting gallery needs one tested swipe-decision owner",
  );

  assert.equal(gallerySwipeDirection(-72, 8), 1, "left swipe advances");
  assert.equal(gallerySwipeDirection(72, 8), -1, "right swipe goes back");
  assert.equal(gallerySwipeDirection(-44, 2), 0, "the threshold itself does not page");
  assert.equal(gallerySwipeDirection(-45, 2), 1, "a gesture beyond the threshold pages");
  assert.equal(gallerySwipeDirection(-80, 68), 0, "mostly vertical intent never pages");
  assert.equal(gallerySwipeDirection(20, 1), 0, "a short drag never pages");
});

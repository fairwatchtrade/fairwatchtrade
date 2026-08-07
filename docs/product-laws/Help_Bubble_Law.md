# Help Bubble Law

**Date:** 2026-08-07  
**Status:** Governing visual / interaction pattern  
**Purpose:** Preserve the approved treatment for question-mark help affordances across FairWatchTrade.

---

# Governing Pattern

FairWatchTrade uses two distinct `?` help treatments depending on the amount and importance of the explanatory content.

The gold `?` is an invitation to understand something without permanently expanding the page.

The help treatment must preserve context, remain readable, and return the user exactly where they were.

---

# Gold `?` Law

> **Short help → anchored speech bubble.**  
> **Long instructional help → compact rounded floating help card / modal.**  
> **Never dump a large square-edged instruction box directly into the page flow.**

---

# Short Help

Use an anchored speech-bubble treatment when the content is brief and directly tied to one control or field.

Required characteristics:

- opens from the gold `?`;
- remains visibly related to the triggering control;
- compact width;
- short explanatory copy;
- visible pointer / tail where appropriate;
- no full-page interruption;
- closes by outside click / tap;
- closes by Escape;
- closes by Android Back where applicable;
- focus returns predictably to the triggering control;
- no hover-only dependency.

This pattern is appropriate for short field guidance or concise explanatory help.

---

# Long Instructional Help

Use a compact floating help card / modal when the content is longer, instructional, policy-sensitive, or requires several paragraphs.

an unnamed competitor is the behavioral reference for this interaction family:

- rounded corners;
- elevated from the page;
- clear close `X`;
- comfortable internal padding;
- readable title and body hierarchy;
- page background visually recedes;
- centered or deliberately positioned floating card;
- no skinny tooltip geometry;
- no inline page reflow;
- opens from the gold `?`;
- closes by `X`;
- closes by outside click / tap where appropriate;
- closes by Escape;
- closes by Android Back where applicable;
- focus returns predictably.

The goal is not to copy the competitor styling literally. The behavior and spatial hierarchy are the useful reference.

FairWatchTrade keeps its own visual language.

---

# Condition Help — Current Correction

The current Condition help implementation is wrong when it behaves like an inline rectangular information slab inserted beneath the field.

The Condition explanation is long instructional content.

Therefore it belongs in the **rounded floating help card / modal** treatment.

The existing Condition copy may remain if the content itself is already approved.

The required correction is primarily:

- container;
- placement;
- interaction;
- dismissal behavior;
- visual hierarchy.

The Condition help should not appear as:

- a tall skinny rectangle;
- an inline page block;
- a square-edged instruction slab;
- a tooltip attempting to hold several paragraphs;
- a permanent expansion of the Sell Flow.

The product should instead:

1. keep the Condition field visually quiet;
2. show the small gold `?`;
3. open the compact rounded help card on tap / click;
4. visually quiet the page behind it;
5. let the seller read the explanation comfortably;
6. close cleanly;
7. restore focus and context.

---

# Why This Exists

A help system can easily make the interface heavier than the problem it is trying to solve.

Long explanatory copy inserted directly into the Sell Flow causes:

- unnecessary vertical expansion;
- broken visual rhythm;
- poor readability;
- weak hierarchy;
- distraction from the actual task;
- a feeling that policy text is part of the permanent form.

The help should appear only when invited.

Permanent experience principle:

> **Information reveals itself; it does not overwhelm.**

The seller remains in the same room.

---

# Visual Boundary

FairWatchTrade normally favors restrained, sharp architectural geometry.

Rounded corners are therefore not permission to round ordinary interface surfaces indiscriminately.

The rounded help-card treatment is a deliberate interaction exception for explanatory overlays.

Do not use this law to justify:

- rounded listing cards;
- rounded navigation;
- generic SaaS panels;
- pill-heavy redesign;
- broad visual softening of the product.

The exception belongs to the help interaction, not the entire visual system.

---

# Accessibility and Interaction Requirements

Any help bubble or help-card implementation must support:

- keyboard activation;
- visible focus;
- Escape dismissal;
- Android Back dismissal where applicable;
- predictable focus return;
- readable contrast;
- readable text size;
- sufficient touch target around the `?`;
- no hover dependency on mobile;
- no loss of entered form state;
- no unexpected page movement.

The question mark itself may remain visually delicate.

Permanent mobile law still applies:

> Preserve visual elegance; enlarge the interaction territory.

---

# Design Ruling

**APPROVED — GOVERNING PATTERN**

For FairWatchTrade question-mark help:

- short explanation = anchored speech bubble;
- long instructional explanation = compact rounded floating help card / modal;
- large instructional copy must never be dumped into a skinny or square-edged inline page box.

The current Condition help should use the long-instructional pattern.

---

# Closing Rule

> **Help should appear when invited, explain clearly, and disappear without disturbing the room.**

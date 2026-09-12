/* ════════════════════════════════════════════════════════════════════════
   ACCOUNT ROOM GEOGRAPHY — one content origin per room
   (Account Workspace continuity, 2026-09-12)

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "The Left Cliff is a padding bug."

   It is an ORIGIN bug. The Account workspace has a persistent rail down
   the left, and the shared workspace header sits at `px-6` inside the
   pane beside it. A room whose body renders at origin zero does not have
   "too little padding" — it is measuring from a different edge than its
   own title, so the first letter of every paragraph sits against the rail
   while the heading above it does not.

   Requests had no origin at all. Trades had two: a subtitle at
   zero and records at `md:ml-[30px]`, so the room's own sentence and the
   records it introduces disagreed about where the room begins.

   One constant, used as the root of each room's body, ends both. It is
   `px-6` because that is the header's inset, on every viewport — the same
   origin, not a similar one. Nothing here changes the shared Account
   shell, and no other room is touched: this is a local wrapper each room
   owns, exactly as the order requires.

   It is NOT typography. No size, weight, tracking or opacity is set here,
   and the LS1-B1..B5 recipes the rooms consume are untouched.
   ════════════════════════════════════════════════════════════════════════ */

/** The one body origin for an Account room, matching the workspace header. */
export const ACCOUNT_ROOM_BODY = "px-6 pb-10";

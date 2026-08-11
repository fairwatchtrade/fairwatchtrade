/* Collector View price sort — the ordering rule, kept apart from the room that
   renders it so the comparator can be proven directly rather than inferred
   from markup.

   SCOPE LAW. Sorting applies to the ENTIRE filtered result set, and pagination
   is applied to the SORTED result — never the other way round. A page-scoped
   sort renders as completely plausible and is silently wrong: with 20 selected
   it reorders the twenty listings that happened to already be on the page,
   and the defect only surfaces when a collector finds a cheaper watch deeper
   in the results and stops trusting the number. BrowseClient enforces this by
   sorting `filtered` and slicing the result of THAT — see the single
   `paginated` assignment, which is the only place the page size is applied.

   NULL LAW. A listing without a usable asking price is not a watch that costs
   nothing. It has no position on a price line at all, so it sorts AFTER every
   priced listing in BOTH directions — the same "null asking price is a truth,
   not a zero" rule the rendered figure already follows. Sorting it to the top
   of Low → High would state a falsehood about the watch.

   Array#sort is stable (ES2019 onward), so listings that share a price — and
   the unpriced tail, which compares equal throughout — keep the default
   relative order. Equal prices therefore produce one deterministic sequence,
   not an arbitrary one that shuffles between renders. */

export type BrowseSort = "default" | "priceAsc" | "priceDesc";

/** URL truth → sort mode. Anything unrecognised is the default order, so a
    hand-edited or stale link degrades to the room's normal behaviour rather
    than an error. */
export function parseBrowseSort(raw: string | null | undefined): BrowseSort {
  return raw === "priceAsc" || raw === "priceDesc" ? raw : "default";
}

/** The asking price if it can carry an ordering, else null. Rejects NaN and
    Infinity as well as absent values — a NaN would otherwise compare false
    against everything and scatter its row unpredictably. */
export function usablePrice(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Order `rows` by asking price. Returns `rows` untouched in default mode, so
    the room's existing ordering is preserved exactly when no price sort is
    selected. Never sorts in place: the caller's array is a memoized value that
    other readers (the result count, the related-identifier pass) still hold. */
export function sortListings<T extends { asking_price?: number | null }>(
  rows: readonly T[],
  sort: BrowseSort,
): readonly T[] {
  if (sort === "default") return rows;
  const direction = sort === "priceAsc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = usablePrice(a.asking_price);
    const right = usablePrice(b.asking_price);
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    return (left - right) * direction;
  });
}

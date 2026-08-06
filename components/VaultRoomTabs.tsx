import Link from "next/link";

/* ────────────────────────────────────────────────────────────────────────
   VAULT REVIEW — room navigation (server component)

   Shared header for the two Vault Review rooms:

     Internal · Vault
     Vault Review
     [Cluster Review] [Specification Upgrade]        ← Admin Home

   Plain labeled links — no browser-history dependency, no shared admin
   shell. Both rooms remain independent pages behind the same founder gate.
   ──────────────────────────────────────────────────────────────────────── */

const ROOMS = [
  { key: "cluster", label: "Cluster Review", href: "/admin/vault-review" },
  { key: "upgrade", label: "Specification Upgrade", href: "/admin/vault-upgrade" },
] as const;

export default function VaultRoomTabs({
  active,
}: {
  active: (typeof ROOMS)[number]["key"];
}) {
  return (
    <div className="mb-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[8px] uppercase tracking-[4px] text-[var(--gold-dim)]">
            Internal · Vault
          </div>
          <h1 className="mt-2 font-display text-[28px] font-light tracking-[0.3px] text-[var(--platinum)]">
            Vault Review
          </h1>
        </div>
        <Link
          href="/admin"
          className="border border-[var(--border-mid)] px-4 py-2.5 font-[Inter] text-[10px] uppercase tracking-[2px] text-[var(--slate)] transition hover:border-[var(--border-subtle)] hover:text-[var(--platinum)]"
        >
          &larr; Admin Home
        </Link>
      </div>
      <nav
        aria-label="Vault Review rooms"
        className="mt-5 flex flex-wrap gap-1 border-b border-[var(--border-subtle)] pb-px"
      >
        {ROOMS.map((room) => (
          <Link
            key={room.key}
            href={room.href}
            aria-current={active === room.key ? "page" : undefined}
            className={`px-4 py-2.5 font-[Inter] text-[10px] uppercase tracking-[2px] transition ${
              active === room.key
                ? "bg-[var(--gold)] text-[var(--ink)]"
                : "border border-[var(--border-mid)] text-[var(--slate)] hover:text-[var(--platinum)]"
            }`}
          >
            {room.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

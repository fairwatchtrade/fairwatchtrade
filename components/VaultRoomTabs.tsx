import Link from "next/link";

/* ────────────────────────────────────────────────────────────────────────
   VAULT REVIEW — room navigation (server component)

   Shared header for the Vault Review rooms:

     Internal · Vault
     Vault Review
     [Cluster Review] [Specification Upgrade] [Enrichment Authoring]  ← Admin Home

   Plain labeled links — no browser-history dependency, no shared admin
   shell. Each room remains an independent page behind the same founder gate.
   ──────────────────────────────────────────────────────────────────────── */

const ROOMS = [
  { key: "cluster", label: "Cluster Review", href: "/admin/vault-review" },
  { key: "upgrade", label: "Specification Upgrade", href: "/admin/vault-upgrade" },
  { key: "enrichment", label: "Enrichment Authoring", href: "/admin/vault-enrichment" },
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
          className="border border-[var(--border-mid)] px-4 py-2.5 font-[Inter] text-[11px] uppercase tracking-[1.6px] text-[var(--slate)] transition hover:border-[var(--border-subtle)] hover:text-[var(--platinum)]"
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
            className={`px-4 py-2.5 font-[Inter] text-[11px] uppercase tracking-[1.6px] transition ${
              active === room.key
                ? "bg-[var(--gold-fill)] text-[var(--on-gold)]"
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

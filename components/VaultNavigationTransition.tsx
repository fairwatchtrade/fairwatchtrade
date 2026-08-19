"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const FADE_MS = 150;

function resolvedAppearanceIsDark() {
  const explicit = document.documentElement.getAttribute("data-theme");
  if (explicit === "dark") return true;
  if (explicit === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export default function VaultNavigationTransition() {
  const pathname = usePathname();
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [opaque, setOpaque] = useState(false);
  const activeRef = useRef(false);
  const fadeStartedAtRef = useRef(0);

  useEffect(() => {
    router.prefetch("/vault");
  }, [router]);

  useEffect(() => {
    function handleVaultNavigation(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        activeRef.current
      ) {
        return;
      }

      const origin = event.target;
      if (!(origin instanceof Element)) return;

      const anchor = origin.closest<HTMLAnchorElement>("a[href]");
      if (
        !anchor ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download") ||
        anchor.closest("[data-immersive-dark]")
      ) {
        return;
      }

      const destination = new URL(anchor.href, window.location.href);
      if (
        destination.origin !== window.location.origin ||
        !destination.pathname.startsWith("/vault") ||
        pathname.startsWith("/vault") ||
        resolvedAppearanceIsDark() ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        return;
      }

      event.preventDefault();
      activeRef.current = true;
      fadeStartedAtRef.current = performance.now();
      setActive(true);
      setOpaque(false);
      requestAnimationFrame(() => setOpaque(true));

      // Route immediately. The overlay belongs to the persistent root layout,
      // so it can finish the brief fade while the prefetched Vault renders.
      router.push(
        `${destination.pathname}${destination.search}${destination.hash}`,
      );
    }

    document.addEventListener("click", handleVaultNavigation, true);
    return () => document.removeEventListener("click", handleVaultNavigation, true);
  }, [pathname, router]);

  useEffect(() => {
    if (!activeRef.current || !pathname.startsWith("/vault")) return;

    const remaining = Math.max(
      0,
      FADE_MS - (performance.now() - fadeStartedAtRef.current),
    );
    const timer = window.setTimeout(() => {
      setOpaque(false);
      setActive(false);
      activeRef.current = false;
    }, remaining);

    return () => window.clearTimeout(timer);
  }, [pathname]);

  return (
    <div
      aria-hidden="true"
      data-vault-entry-transition={active ? "active" : "idle"}
      className="fixed inset-0 bg-black"
      style={{
        zIndex: 2147483647,
        opacity: opaque ? 1 : 0,
        pointerEvents: active ? "auto" : "none",
        transition: `opacity ${FADE_MS}ms ease-out`,
      }}
    />
  );
}

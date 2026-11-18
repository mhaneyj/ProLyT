"use client";
import { useEffect, useRef } from "react";

/** A horizontally scrolling tab strip that brings the current tab into view on load. */
export function ScrollActive({ children, label, className }: { children: React.ReactNode; label: string; className?: string }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { ref.current?.querySelector<HTMLElement>("[aria-current]")?.scrollIntoView({ inline: "center", block: "nearest" }); }, []);
  return <nav ref={ref} aria-label={label} className={className}>{children}</nav>;
}

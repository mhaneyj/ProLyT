/* eslint-disable @next/next/no-img-element -- program logos are uploaded data URLs */
import type { Brand } from "@/lib/org";

export function ProLytMark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display uppercase tracking-wide ${className}`}>
      Pro<span className="text-gold">Lyt</span>
    </span>
  );
}

export function PoweredBy() {
  return (
    <span className="text-[11px] text-muted">
      Powered by <ProLytMark className="text-[12px] text-cream" />
    </span>
  );
}

/** Program logo, or its initials in the brand color when no logo is uploaded yet. */
export function ProgramLogo({ brand, size = 40 }: { brand: Pick<Brand, "name" | "logo_url">; size?: number }) {
  if (brand.logo_url) {
    return <img src={brand.logo_url} alt={brand.name} style={{ height: size, width: "auto", maxWidth: size * 2.4 }} className="object-contain" />;
  }
  const initials = brand.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <span
      aria-label={brand.name}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      className="inline-flex flex-none items-center justify-center rounded-lg bg-gold font-display text-on-gold"
    >
      {initials}
    </span>
  );
}

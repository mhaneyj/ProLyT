"use client";
export function PrintButton() {
  return <button onClick={() => window.print()} className="min-h-12 w-full rounded-md bg-gold font-cond text-[18px] font-extrabold uppercase tracking-[2px] text-on-gold print:hidden">Print or save as PDF</button>;
}

"use client";
import { useState } from "react";
import { PERMS, ROLE_DEFAULTS } from "@/lib/perms";

/** Permission checkboxes. "Standard" keeps the role's defaults; touching any box makes a custom set. */
export function PermFields({ value, custom, role, idPrefix, allowed }: {
  value: string[]; custom: boolean; role: "owner" | "coach"; idPrefix: string; allowed?: string[];
}) {
  const [std, setStd] = useState(!custom);
  const [on, setOn] = useState<string[]>(custom ? value : ROLE_DEFAULTS[role]);
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="sr-only">Permissions</legend>
      <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
        <input type="checkbox" name="defaults" checked={std} className="size-5 accent-[var(--color-gold)]"
          onChange={(e) => { setStd(e.target.checked); if (e.target.checked) setOn(ROLE_DEFAULTS[role]); }} />
        Standard {role} permissions
      </label>
      <div className="grid gap-0.5 border-l-2 border-line pl-3">
        {PERMS.map(([k, label]) => {
          const off = allowed ? !allowed.includes(k) : false;
          return (
            <label key={k} htmlFor={`${idPrefix}-${k}`} className={`flex min-h-10 items-center gap-3 text-sm ${off ? "opacity-40" : ""}`}>
              <input id={`${idPrefix}-${k}`} type="checkbox" name="perm" value={k} checked={on.includes(k)} disabled={off}
                onChange={(e) => { setStd(false); setOn((x) => (e.target.checked ? [...x, k] : x.filter((y) => y !== k))); }}
                className="size-5 flex-none accent-[var(--color-gold)]" />
              {label}
            </label>
          );
        })}
      </div>
      <p className="text-xs text-muted">All staff can check athletes in.</p>
    </fieldset>
  );
}

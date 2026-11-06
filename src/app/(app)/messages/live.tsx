"use client";
import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { sendMessage, type SendState } from "./actions";
import { Icon } from "@/components/icons";

/** Refreshes the conversation every few seconds while the screen is visible. */
export function LiveRefresh({ every = 5000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, every);
    const onShow = () => { if (document.visibilityState === "visible") router.refresh(); };
    document.addEventListener("visibilitychange", onShow);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onShow); };
  }, [router, every]);
  return null;
}

/** Keeps the newest message in view when the conversation grows. */
export function ScrollToEnd({ count }: { count: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollIntoView({ block: "end" }); }, [count]);
  return <div ref={ref} />;
}

export function Composer({ thread, placeholder }: { thread: string; placeholder: string }) {
  const [state, action, pending] = useActionState<SendState, FormData>(sendMessage, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.sent) form.current?.reset(); }, [state.sent]);
  return (
    <form ref={form} action={action} className="sticky bottom-[76px] z-[5] -mx-1 rounded-xl border border-line bg-ink/95 p-2 backdrop-blur">
      <input type="hidden" name="thread" value={thread} />
      {state.error ? <p role="alert" className="px-2 pb-1 text-[13px] text-bad">{state.error}</p> : null}
      <div className="flex items-end gap-2">
        <label className="sr-only" htmlFor="msg-body">Message</label>
        <textarea id="msg-body" name="body" rows={1} maxLength={2000} required placeholder={placeholder}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); form.current?.requestSubmit(); } }}
          className="max-h-40 min-h-12 flex-1 resize-none rounded-lg border border-line bg-panel px-3 py-3 text-[16px] [field-sizing:content] focus:border-gold focus:outline-none" />
        <button disabled={pending} aria-label="Send" className="flex size-12 flex-none items-center justify-center rounded-lg bg-gold text-on-gold disabled:opacity-50">
          <Icon name="send" size={20} />
        </button>
      </div>
    </form>
  );
}

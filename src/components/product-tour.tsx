"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * A short first-visit tour of the workspace. Each step points at an element
 * marked data-tour="<target>" (sidebar items, the setup card); a step whose
 * target isn't on screen, e.g. the sidebar on a phone, shows as a centred
 * card instead. Shown once per browser; "Take the tour" in the sidebar
 * replays it. Esc or Skip closes it.
 */

export type TourStep = { target?: string; title: string; body: string };

const STORAGE_KEY = "leados.tour.v1";
export const TOUR_EVENT = "leados:tour";

function seen() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "done";
  } catch {
    return true; // storage blocked: don't nag on every page
  }
}
function markSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, "done");
  } catch {}
}

type Rect = { top: number; left: number; width: number; height: number };

function visibleRect(target?: string): Rect | null {
  if (!target) return null;
  const el = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)).find((e) => e.offsetParent !== null);
  if (!el) return null;
  el.scrollIntoView({ block: "nearest" });
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

const subscribeNoop = () => () => {};

export function ProductTour({ steps, autoStart }: { steps: TourStep[]; autoStart: boolean }) {
  const [index, setIndex] = useState<number | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);

  const close = useCallback(() => {
    markSeen();
    setIndex(null);
  }, []);

  // First visit: start on its own. Any time: the sidebar button sends TOUR_EVENT.
  useEffect(() => {
    const start = () => setIndex(0);
    window.addEventListener(TOUR_EVENT, start);
    let t: ReturnType<typeof setTimeout> | undefined;
    if (autoStart && !seen()) t = setTimeout(start, 600);
    return () => {
      window.removeEventListener(TOUR_EVENT, start);
      if (t) clearTimeout(t);
    };
  }, [autoStart]);

  const step = index === null ? null : steps[index];

  useLayoutEffect(() => {
    if (!step) return;
    const place = () => setRect(visibleRect(step.target));
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [step]);

  useEffect(() => {
    if (!step) return;
    card.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") setIndex((i) => (i !== null && i < steps.length - 1 ? i + 1 : i));
      if (e.key === "ArrowLeft") setIndex((i) => (i ? i - 1 : i));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, steps.length, close]);

  if (!mounted || !step || index === null) return null;
  const last = index === steps.length - 1;

  // Card beside the highlighted element when there's room, else centred.
  const pad = 6;
  const cardStyle: React.CSSProperties = rect
    ? rect.left + rect.width + 340 < window.innerWidth
      ? { top: Math.max(16, Math.min(rect.top, window.innerHeight - 260)), left: rect.left + rect.width + 16 }
      : { top: Math.min(rect.top + rect.height + 16, window.innerHeight - 260), left: Math.max(16, Math.min(rect.left, window.innerWidth - 336)) }
    : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };

  return (
    <div className="fixed inset-0 z-[60]" aria-live="polite">
      {rect ? (
        // The spotlight: a transparent box whose huge shadow dims everything else.
        <div
          aria-hidden
          className="pointer-events-none fixed rounded-lg ring-2 ring-highlight transition-all duration-200 motion-reduce:transition-none"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.55)",
          }}
        />
      ) : (
        <div aria-hidden className="fixed inset-0 bg-black/55" />
      )}
      <div className="fixed inset-0" onClick={close} aria-hidden />
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
        className="fixed w-[320px] max-w-[calc(100vw-32px)] rounded-lg border border-border bg-surface p-5 shadow-xl outline-none"
        style={cardStyle}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-medium text-fg-subtle">{index + 1} of {steps.length}</p>
          <button type="button" onClick={close} className="-m-1 cursor-pointer rounded p-1 text-fg-muted hover:bg-surface-2 hover:text-fg" aria-label="Close tour">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <h2 id="tour-title" className="mt-1 font-semibold">{step.title}</h2>
        <p id="tour-body" className="mt-1.5 text-sm text-fg-muted">{step.body}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button type="button" onClick={close} className="cursor-pointer text-sm text-fg-muted hover:text-fg">Skip tour</button>
          <div className="flex gap-2">
            {index > 0 ? <Button type="button" variant="ghost" size="sm" onClick={() => setIndex(index - 1)}>Back</Button> : null}
            <Button type="button" size="sm" onClick={() => (last ? close() : setIndex(index + 1))}>{last ? "Done" : "Next"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Sidebar button that replays the tour. */
export function TourButton({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(TOUR_EVENT))}>
      {children}
    </button>
  );
}

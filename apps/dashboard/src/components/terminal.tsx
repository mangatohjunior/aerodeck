"use client";

import { useEffect, useRef, useState } from "react";

import { DEPLOY_LOG_EVENTS } from "@/lib/mock-deploy";
import { cn } from "@/lib/utils";

type TerminalProps = {
  active: boolean;
  className?: string;
  onComplete?: () => void;
};

function stamp(text: string) {
  const time = new Date().toLocaleTimeString("en-GB", { hour12: false });
  return `${time}  ${text}`;
}

export function Terminal({ active, className, onComplete }: TerminalProps) {
  const [lines, setLines] = useState<string[]>([]);
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!active) {
      setLines([]);
      setStreaming(false);
      return;
    }

    setLines([]);
    setStreaming(true);

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let index = 0;

    const printNext = () => {
      if (cancelled) {
        return;
      }
      if (index >= DEPLOY_LOG_EVENTS.length) {
        setStreaming(false);
        onCompleteRef.current?.();
        return;
      }

      const event = DEPLOY_LOG_EVENTS[index];
      timer = setTimeout(() => {
        if (cancelled) {
          return;
        }
        setLines((prev) => [...prev, stamp(event.text)]);
        index += 1;
        printNext();
      }, event.delayMs);
    };

    printNext();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [active]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  return (
    <section
      className={cn(
        "flex min-h-64 flex-col overflow-hidden rounded-xl border border-emerald-500/20 bg-black shadow-[inset_0_0_80px_rgba(16,185,129,0.06)]",
        className,
      )}
    >
      <header className="flex items-center gap-2 border-b border-white/10 bg-zinc-950 px-3 py-2">
        <span className="size-2.5 rounded-full bg-red-500/80" />
        <span className="size-2.5 rounded-full bg-amber-400/80" />
        <span className="size-2.5 rounded-full bg-emerald-500/80" />
        <p className="ml-2 font-mono text-[11px] tracking-wide text-zinc-400">
          deploy.log · mock SSE
        </p>
      </header>
      <pre
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        className="min-h-52 flex-1 overflow-auto p-4 font-mono text-[13px] leading-6 text-emerald-400"
      >
        {lines.map((line) => (
          <div key={line}>{line}</div>
        ))}
        {streaming ? (
          <div>
            <span className="terminal-caret text-emerald-300">█</span>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </pre>
    </section>
  );
}

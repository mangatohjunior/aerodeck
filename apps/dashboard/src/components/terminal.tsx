"use client";

import { useEffect, useRef, useState } from "react";

import { isProvisionFailureLogLine } from "@/lib/api";
import { cn } from "@/lib/utils";

type TerminalProps = {
  streamUrl: string;
  className?: string;
  onComplete?: () => void;
  onFailed?: () => void;
};

function stamp(text: string) {
  const time = new Date().toLocaleTimeString("en-GB", { hour12: false });
  return `${time}  ${text}`;
}

export function Terminal({ streamUrl, className, onComplete, onFailed }: TerminalProps) {
  const [lines, setLines] = useState<string[]>([]);
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const onCompleteRef = useRef(onComplete);
  const onFailedRef = useRef(onFailed);
  onCompleteRef.current = onComplete;
  onFailedRef.current = onFailed;

  useEffect(() => {
    setLines([]);
    setStreaming(true);

    const source = new EventSource(streamUrl);

    source.onmessage = (event) => {
      setLines((prev) => [...prev, stamp(event.data)]);
      if (event.data === "Done") {
        setStreaming(false);
        source.close();
        onCompleteRef.current?.();
        return;
      }
      if (isProvisionFailureLogLine(event.data)) {
        setStreaming(false);
        source.close();
        onFailedRef.current?.();
        return;
      }
    };

    source.onerror = () => {
      setStreaming(false);
      source.close();
    };

    return () => {
      source.close();
    };
  }, [streamUrl]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  return (
    <section
      className={cn(
        "flex min-h-64 flex-col overflow-hidden rounded-xl border border-primary/20 bg-black shadow-[inset_0_0_80px_oklch(0.78_0.13_195/0.07)]",
        className,
      )}
    >
      <header className="flex items-center gap-2 border-b border-white/10 bg-zinc-950 px-3 py-2">
        <span className="size-2.5 rounded-full bg-red-500/80" />
        <span className="size-2.5 rounded-full bg-runway/80" />
        <span className="size-2.5 rounded-full bg-primary/80" />
        <p className="ml-2 font-mono text-[11px] tracking-wide text-zinc-400">
          deploy.log · SSE {streamUrl}
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
            <span className="terminal-caret text-primary">█</span>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </pre>
    </section>
  );
}

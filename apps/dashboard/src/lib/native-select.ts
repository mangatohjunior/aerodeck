import { cn } from "@/lib/utils";

/** Shared classes for native `<select>` until the UI kit gains a shadcn Select. */
export function nativeSelectClassName(...extra: Array<string | false | null | undefined>): string {
  return cn(
    "h-10 w-full rounded-lg border border-input bg-card px-2.5 text-sm text-foreground outline-none [color-scheme:dark]",
    "[&>option]:bg-popover [&>option]:text-popover-foreground",
    "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
    ...extra,
  );
}

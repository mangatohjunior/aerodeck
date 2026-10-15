export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      aria-hidden
    >
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <path
        d="M8 21.5 16 8.5l8 13H21.2L16 13.4 10.8 21.5H8Z"
        fill="oklch(0.16 0.04 250)"
      />
      <path d="M11.4 23h9.2" stroke="oklch(0.82 0.14 75)" strokeWidth="1.6" />
    </svg>
  );
}

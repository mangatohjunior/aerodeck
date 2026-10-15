export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p
          className="text-xs font-medium tracking-[0.18em] text-primary uppercase"
          suppressHydrationWarning
        >
          {eyebrow}
        </p>
        <h1
          className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl"
          suppressHydrationWarning
        >
          {title}
        </h1>
        <p
          className="mt-2 max-w-2xl text-sm text-muted-foreground"
          suppressHydrationWarning
        >
          {description}
        </p>
      </div>
      {actions}
    </div>
  );
}

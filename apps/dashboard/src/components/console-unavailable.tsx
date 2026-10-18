export function ConsoleUnavailable() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-6">
      <p className="max-w-md text-center text-sm text-muted-foreground">
        The console cannot reach the control plane. Your session is still signed in. Try again.
      </p>
    </main>
  );
}

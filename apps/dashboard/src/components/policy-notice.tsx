import Link from "next/link";

import { POLICY_HREF } from "@/lib/public-nav";

export function PolicyNotice() {
  return (
    <p className="text-xs text-muted-foreground">
      By creating an account you agree to the{" "}
      <Link href={POLICY_HREF} className="text-primary hover:underline">
        Policy
      </Link>
      .
    </p>
  );
}

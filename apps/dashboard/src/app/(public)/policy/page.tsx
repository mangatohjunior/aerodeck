import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Policy",
  description:
    "AeroDeck privacy and acceptable use. Static copy for the local mock — no analytics pixels.",
};

const PRIVACY = [
  "This UI is a local mock. It does not load analytics pixels, ad trackers, or third-party identity widgets.",
  "When accounts exist, email lives in the same-origin mock store and is wiped when the Next.js process restarts. It is not sold.",
  "The browser must not embed control-plane JWTs, DigitalOcean tokens, or other secrets. Credentials stay on the server.",
  "When AeroDeck is deployed, compute and data stay on DigitalOcean. This page is not a transfer to AWS or GCP.",
];

const ACCEPTABLE_USE = [
  "Use AeroDeck to GitOps your own workloads onto DigitalOcean. Do not use it to attack systems you do not operate.",
  "Do not put secrets, customer PII, or production credentials into the dashboard client or mock API.",
  "Firecracker sandboxes are short-lived labs, not production tenants. Do not treat them as durable hosts.",
  "This is product policy for the current mock, not a law-firm terms of service. FastAPI identity is a later story.",
];

export default function PolicyPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 md:px-8 md:py-16">
      <PageHeader
        eyebrow="Policy"
        title="Privacy and acceptable use"
        description="Honest rules for this mock console. No legal department invented this copy, and nothing here calls FastAPI."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <PolicySection id="privacy" title="Privacy" items={PRIVACY} />
        <PolicySection id="acceptable-use" title="Acceptable use" items={ACCEPTABLE_USE} />
      </div>
    </div>
  );
}

function PolicySection({
  id,
  title,
  items,
}: {
  id: string;
  title: string;
  items: readonly string[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 id={id} className="text-base font-medium">
            {title}
          </h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="list-disc space-y-3 pl-4 text-sm text-muted-foreground">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

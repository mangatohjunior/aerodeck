import { Box, Cloud, GitBranch } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "About",
  description:
    "AeroDeck is a GitOps operator console for DigitalOcean, with Firecracker sandboxes.",
};

const PILLARS = [
  {
    icon: GitBranch,
    title: "GitOps console",
    body: "Operators point AeroDeck at a GitHub repository. The control plane plans and applies from that repo instead of clicking around a cloud console.",
  },
  {
    icon: Cloud,
    title: "DigitalOcean only",
    body: "Compute, Postgres, Redis, Spaces, and DNS live on DigitalOcean. The IaC engine does not target AWS, GCP, or other clouds.",
  },
  {
    icon: Box,
    title: "Firecracker sandboxes",
    body: "Short-lived environments run in Firecracker microVMs, not long-lived shared clusters. Sandboxes expire; they are not production tenants.",
  },
] as const;

export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 md:px-8 md:py-16">
      <PageHeader
        eyebrow="About"
        title="A GitOps flight deck for DigitalOcean"
        description="AeroDeck is the operator console for GitOps deployments on DigitalOcean. This page is static product copy — it does not call FastAPI."
      />

      <div className="grid gap-4 md:grid-cols-3">
        {PILLARS.map((pillar) => {
          const Icon = pillar.icon;
          return (
            <Card key={pillar.title}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icon className="size-4 text-primary" />
                  {pillar.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{pillar.body}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

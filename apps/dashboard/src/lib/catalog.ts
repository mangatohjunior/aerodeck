import type { DeployLogEvent, Project, Sandbox } from "@/lib/types";

export const MOCK_API_PREFIX = "/api/mock/v1";

export const DEPLOY_LOG_EVENTS: DeployLogEvent[] = [
  { delayMs: 450, text: "Connecting to control plane (mock)..." },
  { delayMs: 700, text: "Cloning repository..." },
  { delayMs: 850, text: "Initializing Terraform..." },
  { delayMs: 900, text: "Planning DigitalOcean resources..." },
  { delayMs: 800, text: "Provisioning VPC and project..." },
  { delayMs: 1100, text: "Provisioning K3s..." },
  { delayMs: 950, text: "Applying Traefik ingress..." },
  { delayMs: 750, text: "Waiting for nodes Ready..." },
  { delayMs: 650, text: "Health checks passed." },
  { delayMs: 500, text: "Done" },
];

const now = "2026-10-14T22:00:00.000Z";

export const SEED_PROJECTS: Project[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "payments",
    name: "Payments",
    description: "Card acquiring and ledger (dev VPC).",
    created_at: now,
    updated_at: now,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    slug: "platform",
    name: "Platform",
    description: "Shared control-plane adjacent services.",
    created_at: now,
    updated_at: now,
  },
];

export const SEED_SANDBOXES: Sandbox[] = [
  {
    id: "33333333-3333-4333-8333-333333333333",
    project_id: SEED_PROJECTS[0].id,
    image: "debian-slim",
    vcpu: 2,
    memory_mib: 512,
    ttl_seconds: 3600,
    status: "running",
    expires_at: "2026-10-15T01:00:00.000Z",
    created_at: now,
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    project_id: SEED_PROJECTS[1].id,
    image: "alpine-ci",
    vcpu: 1,
    memory_mib: 256,
    ttl_seconds: 1800,
    status: "stopped",
    expires_at: "2026-10-14T23:30:00.000Z",
    created_at: now,
  },
];

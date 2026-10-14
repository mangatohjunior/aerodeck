export type DeploymentStatus = "queued" | "running" | "succeeded";

export type Deployment = {
  id: string;
  repoUrl: string;
  owner: string;
  repo: string;
  startedAt: string;
  status: DeploymentStatus;
};

export type DeployLogEvent = {
  delayMs: number;
  text: string;
};

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

export function parseGithubRepo(
  value: string,
): { owner: string; repo: string } | null {
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    if (parsed.hostname !== "github.com" && parsed.hostname !== "www.github.com") {
      return null;
    }
    const [owner, repo] = parsed.pathname
      .replace(/\.git$/, "")
      .split("/")
      .filter(Boolean);
    if (!owner || !repo) {
      return null;
    }
    return { owner, repo };
  } catch {
    return null;
  }
}

/** Simulated POST /deployments. No network, no FastAPI. */
export async function mockCreateDeployment(
  repoUrl: string,
): Promise<Deployment> {
  const parsed = parseGithubRepo(repoUrl);
  if (!parsed) {
    throw new Error("Enter a valid GitHub repository URL.");
  }

  await new Promise((resolve) => setTimeout(resolve, 750));

  return {
    id: `dep_${crypto.randomUUID().slice(0, 8)}`,
    repoUrl: repoUrl.trim(),
    owner: parsed.owner,
    repo: parsed.repo,
    startedAt: new Date().toISOString(),
    status: "running",
  };
}

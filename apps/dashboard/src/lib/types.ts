export type DeploymentStatus = "queued" | "running" | "succeeded";

export type Project = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type Sandbox = {
  id: string;
  project_id: string;
  image: string;
  vcpu: number;
  memory_mib: number;
  ttl_seconds: number;
  status: "pending" | "running" | "stopped" | "expired";
  expires_at: string;
  created_at: string;
};

export type Deployment = {
  id: string;
  repo_url: string;
  owner: string;
  repo: string;
  started_at: string;
  status: DeploymentStatus;
};

export type ApiError = {
  detail: string;
  code: string;
};

export type DeployLogEvent = {
  delayMs: number;
  text: string;
};

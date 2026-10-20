export type DeploymentStatus = "queued" | "running" | "succeeded" | "failed";

export type Project = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectSource = "control-plane" | "mock";

export type ProjectPage = {
  items: Project[];
  total: number;
  limit: number;
  offset: number;
  source: ProjectSource;
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

export type SandboxPage = {
  items: Sandbox[];
  total: number;
  limit: number;
  offset: number;
  source: ProjectSource;
};

export type Deployment = {
  id: string;
  repo_url: string;
  owner: string;
  repo: string;
  project_id?: string | null;
  environment_id?: string | null;
  /** Last provision Celery job id when enqueue succeeded; omit/null on older rows. */
  provision_job_id?: string | null;
  started_at: string;
  status: DeploymentStatus;
};

/** Control-plane Celery job status from `GET /api/v1/jobs/{id}`. */
export type ProvisionJobStatus = "queued" | "running" | "retrying" | "succeeded" | "failed";

export const PROVISION_JOB_STATUSES = new Set<ProvisionJobStatus>([
  "queued",
  "running",
  "retrying",
  "succeeded",
  "failed",
]);

export const PROVISION_JOB_ACTIVE_STATUSES = new Set<ProvisionJobStatus>([
  "queued",
  "running",
  "retrying",
]);

export type ProvisionJob = {
  job_id: string;
  status: ProvisionJobStatus;
  result?: Record<string, string | boolean> | null;
  error?: string | null;
};

/** Control-plane job kinds accepted by provision / reconcile enqueue. */
export type JobKind = "provision" | "reconcile";

export const JOB_KINDS = new Set<JobKind>(["provision", "reconcile"]);

/** `202` body from `POST .../environments/{id}/provision|reconcile`. */
export type AcceptedJob = {
  job_id: string;
  kind: JobKind;
  project_id: string;
  environment_id: string;
  status: ProvisionJobStatus;
};

export type EnvironmentOption = {
  id: string;
  project_id: string;
  project_slug: string;
  project_name: string;
  slug: string;
  name: string;
  kind: string;
  region: string;
};

export type EnvironmentOptionPage = {
  items: EnvironmentOption[];
  total: number;
  source: ProjectSource;
};

export type ProjectDetail = {
  project: Project;
  environments: EnvironmentOption[];
  source: ProjectSource;
};

export type ApiError = {
  detail: string;
  code: string;
  deployment_id?: string;
};

/** Console Deploy create when the deployment row exists but provision was not queued. */
export const PROVISION_ENQUEUE_FAILED = "provision_enqueue_failed";

export type PublicUser = {
  id: string;
  email: string;
  created_at: string;
};

export type AuthErrorCode =
  | "missing_email"
  | "missing_password"
  | "invalid_email"
  | "weak_password"
  | "email_taken"
  | "invalid_credentials"
  | "unauthenticated"
  | "invalid_json";

export type DeployLogEvent = {
  delayMs: number;
  text: string;
};

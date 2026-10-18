import { recordConsoleDeploymentOutcome } from "@/lib/console-deployment-outcome";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return recordConsoleDeploymentOutcome(context, "failed");
}

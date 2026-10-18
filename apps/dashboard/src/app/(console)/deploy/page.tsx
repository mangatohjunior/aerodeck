import { NewDeploymentForm } from "@/components/new-deployment-form";
import { PageHeader } from "@/components/page-header";
import { readControlPlaneConfig } from "@/lib/control-plane";

export default function DeployPage() {
  const controlPlane = readControlPlaneConfig() !== null;
  return (
    <div className="mx-auto w-full max-w-xl">
      <PageHeader
        eyebrow="Deploy"
        title="New Deployment"
        description={
          controlPlane
            ? "Point AeroDeck at a GitHub repository. The dashboard server stores the deployment in the control plane."
            : "Point AeroDeck at a GitHub repository. The request stays on this Next.js app — the mock API pretends to be the control plane."
        }
      />
      <NewDeploymentForm controlPlane={controlPlane} />
    </div>
  );
}

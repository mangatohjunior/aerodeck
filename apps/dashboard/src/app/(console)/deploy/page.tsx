import { NewDeploymentForm } from "@/components/new-deployment-form";
import { PageHeader } from "@/components/page-header";

export default function DeployPage() {
  return (
    <div className="mx-auto w-full max-w-xl">
      <PageHeader
        eyebrow="Deploy"
        title="New Deployment"
        description="Point AeroDeck at a GitHub repository. The request stays on this Next.js app — the mock API pretends to be the control plane."
      />
      <NewDeploymentForm />
    </div>
  );
}

import { DeploymentsList } from "@/components/deployments-list";
import { readControlPlaneConfig } from "@/lib/control-plane";

export const dynamic = "force-dynamic";

export default function DeploymentsPage() {
  return <DeploymentsList controlPlane={readControlPlaneConfig() !== null} />;
}

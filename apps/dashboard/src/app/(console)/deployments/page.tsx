import { DeploymentsList } from "@/components/deployments-list";
import { readControlPlaneConfig } from "@/lib/control-plane";

export default function DeploymentsPage() {
  return <DeploymentsList controlPlane={readControlPlaneConfig() !== null} />;
}

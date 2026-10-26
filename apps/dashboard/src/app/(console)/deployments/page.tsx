import { connection } from "next/server";
import { DeploymentsList } from "@/components/deployments-list";
import { readControlPlaneConfig } from "@/lib/control-plane";


export default async function DeploymentsPage() {
  await connection();
  return <DeploymentsList controlPlane={readControlPlaneConfig() !== null} />;
}

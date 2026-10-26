import { connection } from "next/server";
import { DeploymentDetail } from "@/components/deployment-detail";
import { readControlPlaneConfig } from "@/lib/control-plane";

export default async function DeploymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  return <DeploymentDetail id={id} controlPlane={readControlPlaneConfig() !== null} />;
}

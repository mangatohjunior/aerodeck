import { connection } from "next/server";
import { OverviewConsole } from "@/components/overview-console";
import { readControlPlaneConfig } from "@/lib/control-plane";


export default async function OverviewPage() {
  await connection();
  return <OverviewConsole controlPlane={readControlPlaneConfig() !== null} />;
}

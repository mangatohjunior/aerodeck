import { OverviewConsole } from "@/components/overview-console";
import { readControlPlaneConfig } from "@/lib/control-plane";

export const dynamic = "force-dynamic";

export default function OverviewPage() {
  return <OverviewConsole controlPlane={readControlPlaneConfig() !== null} />;
}

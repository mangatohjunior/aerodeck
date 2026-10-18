import { OverviewConsole } from "@/components/overview-console";
import { readControlPlaneConfig } from "@/lib/control-plane";

export default function OverviewPage() {
  return <OverviewConsole controlPlane={readControlPlaneConfig() !== null} />;
}

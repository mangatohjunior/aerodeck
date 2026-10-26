import type { Metadata } from "next";
import { Suspense } from "react";

import { GuestOnly } from "@/components/guest-only";
import { PageHeader } from "@/components/page-header";
import { RegisterForm } from "@/components/register-form";
import { readControlPlaneConfig } from "@/lib/control-plane";

export const metadata: Metadata = {
  title: "Register",
  description: "Create an AeroDeck account with email and password.",
};

export default function RegisterPage() {
  const controlPlane = readControlPlaneConfig() !== null;
  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 md:px-8 md:py-16">
      <PageHeader
        eyebrow="Register"
        title="Create an account"
        description={
          controlPlane
            ? "Create an operator account. Stored by the control plane."
            : "Create an in-memory account for this session. A restart clears it."
        }
      />
      <Suspense fallback={<RegisterForm controlPlane={controlPlane} />}>
        <GuestOnly>
          <RegisterForm controlPlane={controlPlane} />
        </GuestOnly>
      </Suspense>
    </div>
  );
}

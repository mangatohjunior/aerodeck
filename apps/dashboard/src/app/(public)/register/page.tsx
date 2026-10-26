import type { Metadata } from "next";
import { Suspense } from "react";

import { GuestOnly } from "@/components/guest-only";
import { connection } from "next/server";
import { PageHeader } from "@/components/page-header";
import { RegisterForm } from "@/components/register-form";
import { readControlPlaneConfig } from "@/lib/control-plane";


export const metadata: Metadata = {
  title: "Register",
  description: "Create an AeroDeck account with email and password.",
};

export default async function RegisterPage() {
  await connection();
  const controlPlane = readControlPlaneConfig() !== null;
  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 md:px-8 md:py-16">
      <PageHeader
        eyebrow="Register"
        title="Create your account"
        description={
          controlPlane
            ? "Email and password are stored by the control plane."
            : "Email and password, or Continue with Google. The mock store forgets users when Next.js restarts."
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

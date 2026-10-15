import type { Metadata } from "next";
import { Suspense } from "react";

import { GuestOnly } from "@/components/guest-only";
import { PageHeader } from "@/components/page-header";
import { RegisterForm } from "@/components/register-form";

export const metadata: Metadata = {
  title: "Register",
  description: "Create an AeroDeck account with email and password.",
};

export default function RegisterPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 md:px-8 md:py-16">
      <PageHeader
        eyebrow="Register"
        title="Create your account"
        description="Email and password, or Continue with Google. The mock store forgets users when Next.js restarts."
      />
      <Suspense fallback={<RegisterForm />}>
        <GuestOnly>
          <RegisterForm />
        </GuestOnly>
      </Suspense>
    </div>
  );
}

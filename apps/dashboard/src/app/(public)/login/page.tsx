import type { Metadata } from "next";
import { Suspense } from "react";

import { GuestOnly } from "@/components/guest-only";
import { LoginForm } from "@/components/login-form";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "Login",
  description: "Sign in to AeroDeck with email and password.",
};

export default function LoginPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 md:px-8 md:py-16">
      <PageHeader
        eyebrow="Login"
        title="Sign in"
        description="Email and password, or Continue with Google. Mock Google does not call Google Cloud until GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set."
      />
      <Suspense fallback={<LoginForm />}>
        <GuestOnly>
          <LoginForm />
        </GuestOnly>
      </Suspense>
    </div>
  );
}

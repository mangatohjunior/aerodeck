import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { LinkButton } from "@/components/link-button";
import { LoginStatus } from "@/components/login-status";
import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { POLICY_HREF } from "@/lib/public-nav";

export const metadata: Metadata = {
  title: "Login",
  description: "Sign in to AeroDeck. Email and password POST lands in the next story.",
};

export default function LoginPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 md:px-8 md:py-16">
      <PageHeader
        eyebrow="Login"
        title="Sign in"
        description="Email and password sign-in is the next story. Register sends you here after a successful 201."
      />
      <Card className="overflow-hidden ring-primary/15">
        <div className="h-1 bg-gradient-to-r from-primary via-runway to-primary/40" />
        <CardHeader className="border-b">
          <CardTitle>No session yet</CardTitle>
          <CardDescription>
            Successful register is a 201 plus this redirect. No token is stored
            in localStorage. The Login story sets the session cookie.
          </CardDescription>
        </CardHeader>
        <Suspense
          fallback={
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">
                Create an account first if you do not have one.
              </p>
            </CardContent>
          }
        >
          <LoginStatus />
        </Suspense>
        <CardFooter className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            <Link href="/register" className="text-primary hover:underline">
              Register
            </Link>
            {" · "}
            <Link href="/about" className="text-primary hover:underline">
              About
            </Link>
            {" · "}
            <Link href={POLICY_HREF} className="text-primary hover:underline">
              Policy
            </Link>
          </p>
          <LinkButton href="/register" size="lg">
            Register
          </LinkButton>
        </CardFooter>
      </Card>
    </div>
  );
}

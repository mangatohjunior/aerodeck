"use client";

import { Loader2, LogIn } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";

import { GoogleContinue } from "@/components/google-continue";
import { LoginStatus } from "@/components/login-status";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAccount } from "@/lib/api";
import { isValidEmail } from "@/lib/auth";
import { POLICY_HREF } from "@/lib/public-nav";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function validate(): string | null {
    if (!isValidEmail(email) || password.length === 0) {
      return "Invalid email or password.";
    }
    return null;
  }

  function bindField(setter: (value: string) => void) {
    return {
      onValueChange: (value: string) => {
        setter(value);
        if (error) {
          setError(null);
        }
      },
      onChange: (event: { currentTarget: { value: string } }) => {
        setter(event.currentTarget.value);
        if (error) {
          setError(null);
        }
      },
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextError = validate();
    if (nextError) {
      setError(nextError);
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await loginAccount(email, password);
      router.push("/");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid email or password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="overflow-hidden ring-primary/15">
      <div className="h-1 bg-gradient-to-r from-primary via-runway to-primary/40" />
      <CardHeader className="border-b">
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          Email and password against{" "}
          <span className="font-mono">/api/mock/v1/auth/login</span>, or Continue
          with Google against the mock OIDC callback. Nothing is stored in
          localStorage.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="flex flex-col gap-4 pt-4">
          <Suspense fallback={null}>
            <LoginStatus />
          </Suspense>
          <div className="flex flex-col gap-2">
            <Label htmlFor="login-email">Email</Label>
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              disabled={submitting}
              aria-invalid={error ? true : undefined}
              {...bindField(setEmail)}
              className="h-10"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="login-password">Password</Label>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              disabled={submitting}
              aria-invalid={error ? true : undefined}
              {...bindField(setPassword)}
              className="h-10"
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <GoogleContinue disabled={submitting} />
        </CardContent>
        <CardFooter className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Need an account?{" "}
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
          <Button type="submit" size="lg" disabled={submitting}>
            {submitting ? (
              <Loader2 data-icon="inline-start" className="animate-spin" />
            ) : (
              <LogIn data-icon="inline-start" />
            )}
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

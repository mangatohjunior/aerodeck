"use client";

import { Loader2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { GoogleContinue } from "@/components/google-continue";
import { PolicyNotice } from "@/components/policy-notice";
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
import { registerAccount } from "@/lib/api";
import { isStrongPassword, isValidEmail, MIN_PASSWORD_LENGTH } from "@/lib/auth";
import { POLICY_HREF } from "@/lib/public-nav";

export function RegisterForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function validate(): string | null {
    if (!isValidEmail(email)) {
      return "Enter a valid email address.";
    }
    if (!isStrongPassword(password)) {
      return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (password !== confirm) {
      return "Passwords do not match.";
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
      await registerAccount(email, password);
      router.push("/login?registered=1");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Registration failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="overflow-hidden ring-primary/15">
      <div className="h-1 bg-gradient-to-r from-primary via-runway to-primary/40" />
      <CardHeader className="border-b">
        <CardTitle>Create an account</CardTitle>
        <CardDescription>
          Email and password against{" "}
          <span className="font-mono">/api/mock/v1/auth/register</span>, or
          Continue with Google. A 201 still sends you to Login. Google signs you
          in immediately.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="flex flex-col gap-4 pt-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="register-email">Email</Label>
            <Input
              id="register-email"
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
            <Label htmlFor="register-password">Password</Label>
            <Input
              id="register-password"
              type="password"
              autoComplete="new-password"
              value={password}
              disabled={submitting}
              aria-invalid={error ? true : undefined}
              {...bindField(setPassword)}
              className="h-10"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="register-confirm">Confirm password</Label>
            <Input
              id="register-confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              disabled={submitting}
              aria-invalid={error ? true : undefined}
              {...bindField(setConfirm)}
              className="h-10"
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : (
            <PolicyNotice />
          )}
          <GoogleContinue disabled={submitting} />
        </CardContent>
        <CardFooter className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline">
              Login
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
              <UserPlus data-icon="inline-start" />
            )}
            {submitting ? "Creating…" : "Register"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

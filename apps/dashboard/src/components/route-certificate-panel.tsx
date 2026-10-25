"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchRouteCertificate, issueRouteCertificate } from "@/lib/api";
import type { RouteCertificate } from "@/lib/types";

type RouteCertificatePanelProps = {
  projectId: string;
  routeId: string;
};

export function RouteCertificatePanel({ projectId, routeId }: RouteCertificatePanelProps) {
  const [certificate, setCertificate] = useState<RouteCertificate | null>(null);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRouteCertificate(projectId, routeId)
      .then((next) => {
        if (!cancelled) {
          setCertificate(next);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setCertificate(null);
          setError(
            cause instanceof Error ? cause.message : "Failed to load certificate status.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, routeId]);

  async function handleIssue() {
    setError(null);
    setIssuing(true);
    try {
      const issued = await issueRouteCertificate(projectId, routeId);
      setCertificate(issued);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Certificate issue failed.");
    } finally {
      setIssuing(false);
    }
  }

  const canIssue = !loading && !issuing && certificate?.status !== "issued";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {loading ? (
        <Badge variant="secondary">TLS: Loading…</Badge>
      ) : certificate ? (
        <Badge variant={certificate.status === "issued" ? "default" : "secondary"}>
          TLS: {certificate.status}
        </Badge>
      ) : null}
      {canIssue ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={issuing}
          onClick={() => {
            void handleIssue();
          }}
        >
          {issuing ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <ShieldCheck className="size-4" aria-hidden />
          )}
          {issuing ? "Issuing…" : "Issue certificate"}
        </Button>
      ) : null}
      {error ? (
        <p className="w-full text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

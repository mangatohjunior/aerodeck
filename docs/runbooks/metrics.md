# Metrics and alerts

`GET /metrics` is a Prometheus text scrape. It needs no bearer token. It
exports readiness and two counters. It does not export tokens, database URLs,
or certificate PEM.

```bash
curl -sS http://127.0.0.1:8000/metrics
```

| Series | Meaning |
| ------ | ------- |
| `aerodeck_check_up{check="database"}` | `1` when `/readyz` would report `ok` or `skipped`. `0` when the check failed. |
| `aerodeck_check_up{check="queue"}` | Same for Redis. |
| `aerodeck_sandbox_reap_failures_total` | Sandboxes the reap could not stop. |
| `aerodeck_iac_apply_failures_total` | Tenant Terraform provision attempts that failed. |

The counters are integers in Redis (`aerodeck:metrics:…`) so a scrape of the
API sees worker failures. If Redis is down, the scrape still returns `0` for
those counters and the log line remains.

## Log fields that page

| Line | Where |
| ---- | ----- |
| `event=sandbox_reap_failed sandbox_id=<uuid>` | API or worker, one VM. The rest of the batch continues. |
| `event=iac_apply_failed environment=<id> project=<id>` | Worker, each failed provision attempt (retries count). |
| `event=iac_apply_failed environment=<dev\|staging\|prod>` | GitHub Actions, when **IaC plan and apply** fails the apply job. |

Alert when `aerodeck_check_up == 0`, or when either counter increases, or when
those log lines appear. DigitalOcean monitoring or any scraper on the VPC can
poll `:8000/metrics`. Do not publish port 8000.

Platform applies stay in Actions. Turn on failure notifications for the
**IaC plan and apply** workflow. The apply job prints `event=iac_apply_failed`
and does not print the DigitalOcean token.

## Related

- Probes: [control-plane.md](control-plane.md).
- Applies: [iac-apply.md](iac-apply.md).
- Reap: [sandboxes.md](sandboxes.md).

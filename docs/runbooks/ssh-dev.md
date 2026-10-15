# SSH to the dev control-plane Droplet

The Droplet starts with **console-only** access: no SSH keys, port 22 only
from the VPC. To log in from your laptop, inject a DigitalOcean SSH key and
open port 22 to your public IP. Values stay in **GitHub variables**, not git.

Do not `terraform apply` from a laptop ([iac-apply.md](iac-apply.md)).

## 1. SSH key in DigitalOcean

1. If you need a key on this machine:

   ```bash
   ssh-keygen -t ed25519 -C aerodeck-dev -f %USERPROFILE%\.ssh\aerodeck_ed25519
   ```

   On macOS/Linux use `~/.ssh/aerodeck_ed25519`.

2. Copy the **public** key (`aerodeck_ed25519.pub`).
3. DigitalOcean → **Settings → Security → SSH keys** → **Add SSH Key**.
4. Name it `aerodeck-dev`. Paste the public key.
5. Open the key and copy the **fingerprint** (or numeric id). Example
   fingerprint: `aa:bb:cc:…`.

## 2. Your public IPv4

In a browser open [https://ifconfig.me/ip](https://ifconfig.me/ip) (or
`curl https://ifconfig.me/ip`). You need `a.b.c.d/32`.

If your ISP changes the address, update the GitHub variable and re-apply.

## 3. GitHub repository variables

Repo → **Settings → Secrets and variables → Actions → Variables**.

| Variable | Example | Maps to |
| -------- | ------- | ------- |
| `SSH_KEY_IDS` | the fingerprint from step 1 | `ssh_key_ids` |
| `SSH_ALLOW_CIDRS` | `203.0.113.10/32` | `ssh_allow_cidrs` |

Comma-separate if you add a second key or CIDR. Do **not** commit these in
`.tfvars`. Empty variables mean console-only, VPC-only SSH.

## 4. Apply from CI

After the wiring is on `main`:

1. Actions → **IaC plan and apply** → **Run workflow**.
2. Branch `main`, environment **dev**, Apply **checked**.
3. Read the plan: firewall `22` from your `/32`, Droplet `ssh_keys` set.

Changing `ssh_keys` on an existing Droplet often **replaces** the Droplet.
Postgres stays. Docker Redis and the control-plane container would need to
be started again after a replace.

## 5. Log in

Public IPv4 is `terraform output droplet_ipv4` (apply job summary or
DigitalOcean → Droplets → `aerodeck-dev-control`).

```bash
ssh -i ~/.ssh/aerodeck_ed25519 root@<droplet-ipv4>
```

Windows PowerShell: `ssh -i $env:USERPROFILE\.ssh\aerodeck_ed25519 root@<ipv4>`.

If `Permission denied`, the key is not on the Droplet yet (apply did not
replace it, or `SSH_KEY_IDS` does not match). If `Connection timed out`,
`SSH_ALLOW_CIDRS` is missing or is not your current IP.

## Until this is applied

DigitalOcean → Droplets → `aerodeck-dev-control` → **Access** →
**Launch Droplet Console** (browser). No SSH key required.

## Related

- Deploy checklist: [deploy.md](deploy.md) section 4b.
- Account bootstrap: [digitalocean-account.md](digitalocean-account.md).
- Apply: [iac-apply.md](iac-apply.md).

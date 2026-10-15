# SSH to the dev control-plane Droplet

The Droplet starts with **console-only** access: no SSH keys, port 22 only
from the VPC. To log in from your laptop, inject a DigitalOcean SSH key and
open port 22 to your public IP. Values stay in **GitHub variables**, not git.

Do not `terraform apply` from a laptop ([iac-apply.md](iac-apply.md)).

## 1. Create the key (PowerShell)

Use **PowerShell** if that is where you will run `ssh`. Git Bash uses the
same `C:\Users\<you>\.ssh` folder. WSL is a different home; only generate
there if you will SSH from WSL.

```powershell
ssh-keygen -t ed25519 -C aerodeck-dev -f $env:USERPROFILE\.ssh\aerodeck_ed25519
```

Passphrase can be empty for this smoke-test key. You should see
`aerodeck_ed25519` (private) and `aerodeck_ed25519.pub` (public).

On macOS/Linux:

```bash
ssh-keygen -t ed25519 -C aerodeck-dev -f ~/.ssh/aerodeck_ed25519
```

## 2. View and copy the public key

The file you paste into DigitalOcean is **`.pub` only**. Never paste the
file with no suffix.

PowerShell:

```powershell
Get-Content $env:USERPROFILE\.ssh\aerodeck_ed25519.pub
Get-Content $env:USERPROFILE\.ssh\aerodeck_ed25519.pub | Set-Clipboard
```

The line looks like `ssh-ed25519 AAAA… aerodeck-dev`.

macOS/Linux: `cat ~/.ssh/aerodeck_ed25519.pub`

## 3. Add the key in DigitalOcean

1. Open
   [https://cloud.digitalocean.com/account/security](https://cloud.digitalocean.com/account/security)
   (or the avatar → **Settings** → **Security**).
2. Scroll to **SSH keys**.
3. **Add SSH Key**.
4. **SSH key content**: paste the `.pub` line from step 2.
5. **Name**: `aerodeck-dev`.
6. **Add SSH Key** (save).

The key is now on the **account**. It is **not** on the Droplet until
Terraform apply injects it (step 6).

After save, DigitalOcean shows a **fingerprint** (colon-separated hex, or
copy it from the key row). That value goes in GitHub `SSH_KEY_IDS`. You
can also use the numeric key id on the same page.

## 4. Your public IPv4

In a browser open [https://ifconfig.me/ip](https://ifconfig.me/ip) (or
`curl https://ifconfig.me/ip`). You need `a.b.c.d/32`.

If your ISP changes the address, update the GitHub variable and re-apply.

## 5. GitHub repository variables

Repo → **Settings → Secrets and variables → Actions → Variables**.

| Variable | Example | Maps to |
| -------- | ------- | ------- |
| `SSH_KEY_IDS` | fingerprint or id from the DigitalOcean SSH keys page | `ssh_key_ids` |
| `SSH_ALLOW_CIDRS` | `203.0.113.10/32` | `ssh_allow_cidrs` |

Comma-separate if you add a second key or CIDR. Do **not** commit these in
`.tfvars`. Empty variables mean console-only, VPC-only SSH.

## 6. Apply from CI

After the wiring is on `main`:

1. Actions → **IaC plan and apply** → **Run workflow**.
2. Branch `main`, environment **dev**, Apply **checked**.
3. Read the plan: firewall `22` from your `/32`, Droplet `ssh_keys` set.

Changing `ssh_keys` on an existing Droplet often **replaces** the Droplet.
Postgres stays. Docker Redis and the control-plane container would need to
be started again after a replace.

If a plan tries to **destroy** `digitalocean_database_cluster.postgres`
because of `lifecycle.prevent_destroy`, the live VPC is missing from state.
CI imports it before plan on push/apply. Do not lift `prevent_destroy` to
force that apply.

## 7. Log in

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

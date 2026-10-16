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

The key is now on the **account**. It is **not** on an existing Droplet.
Do **not** put the fingerprint in `SSH_KEY_IDS` — that would replace the
box. Paste the `.pub` line into `authorized_keys` via the console (step 6).

## 4. Your public IPv4

In a browser open [https://ifconfig.me/ip](https://ifconfig.me/ip) (or
`curl https://ifconfig.me/ip`). You need `a.b.c.d/32`.

If your ISP changes the address, update the GitHub variable and re-apply.

## 5. GitHub repository variables

Repo → **Settings → Secrets and variables → Actions → Variables**.

| Variable | Example | Maps to |
| -------- | ------- | ------- |
| `SSH_ALLOW_CIDRS` | `203.0.113.10/32` | `ssh_allow_cidrs` |

Leave **`SSH_KEY_IDS` empty** on the live dev Droplet. Comma-separate a
second CIDR if needed. Do **not** commit these in `.tfvars`. Empty CIDRs
mean console-only, VPC-only SSH.

## 6. Open port 22 without replacing the Droplet

The live Droplet was created with no SSH keys. DigitalOcean treats `ssh_keys`
as ForceNew, so Terraform **must not** set `SSH_KEY_IDS` on this box. Leave
that GitHub variable empty. IaC ignores `ssh_keys` so a later value cannot
rebuild the Droplet.

1. DigitalOcean → Droplets → `aerodeck-dev-control` → **Access** →
   **Launch Droplet Console**.
2. As root:

```bash
mkdir -p /root/.ssh
chmod 700 /root/.ssh
echo 'ssh-ed25519 PASTE_YOUR_PUB_LINE aerodeck-dev' >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
```

3. Set GitHub variable **`SSH_ALLOW_CIDRS` only** (`a.b.c.d/32` from
   [https://ifconfig.me/ip](https://ifconfig.me/ip)).
4. Actions → **IaC plan and apply** → **dev**, Apply **checked**.
5. Read the plan: firewall `22` from your `/32`. The Droplet must **not**
   be replaced. Postgres must **not** be replaced.

If a plan tries to **destroy** `digitalocean_database_cluster.postgres`
because of `lifecycle.prevent_destroy`, the live VPC is missing from state.
CI imports it before plan (including pull-request plans). Do not lift
`prevent_destroy` to force that apply — that would delete the live cluster.

## 7. Log in

Public IPv4 is `terraform output droplet_ipv4` (apply job summary or
DigitalOcean → Droplets → `aerodeck-dev-control`).

```bash
ssh -i ~/.ssh/aerodeck_ed25519 root@<droplet-ipv4>
```

Windows PowerShell: `ssh -i $env:USERPROFILE\.ssh\aerodeck_ed25519 root@<ipv4>`.

If `Permission denied`, the `.pub` line is not in `/root/.ssh/authorized_keys`
yet (console step 6). If `Connection timed out`, `SSH_ALLOW_CIDRS` is missing
or is not your current IP.

## Until this is applied

DigitalOcean → Droplets → `aerodeck-dev-control` → **Access** →
**Launch Droplet Console** (browser). No SSH key required.

## Related

- Deploy checklist: [deploy.md](deploy.md) section 4b.
- Account bootstrap: [digitalocean-account.md](digitalocean-account.md).
- Apply: [iac-apply.md](iac-apply.md).

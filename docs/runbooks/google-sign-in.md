# Google sign-in

Continue with Google uses a Google OAuth Web client: a client id and a client
secret. That is not a Google API key. The dashboard server sends the browser
to Google only when both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are
set. Without them, the button still signs in with the local mock profile.

The callback path stays `/api/mock/v1/auth/google/callback`. The account is
still stored in the dashboard process until console users live in the control
plane.

Do not commit the client id or the secret. Do not paste them into chat.

## 1. Create the OAuth client

In Google Cloud Console, open APIs & Services → Credentials → Create
credentials → OAuth client ID → Web application.

Authorised JavaScript origins:

```text
https://dev.app.aero-deck.app
http://localhost:3000
```

Authorised redirect URIs:

```text
https://dev.app.aero-deck.app/api/mock/v1/auth/google/callback
http://localhost:3000/api/mock/v1/auth/google/callback
```

The origin has no path and no trailing slash. The redirect URI must match
exactly.

## 2. Store the values on the dashboard server

On `aerodeck-dev-control`, add these lines to `/etc/aerodeck/dashboard.env`
using the values you saved from Google Cloud:

```text
GOOGLE_CLIENT_ID=<client id>
GOOGLE_CLIENT_SECRET=<client secret>
```

```bash
chmod 600 /etc/aerodeck/dashboard.env
docker rm -f aerodeck-dashboard
docker run -d --name aerodeck-dashboard --network host --restart unless-stopped \
  --env-file /etc/aerodeck/dashboard.env \
  -e HOSTNAME=0.0.0.0 \
  aerodeck/dashboard:dev
```

`enroll-console-client.sh` keeps those two lines when it rotates the console
API client. Copy `dashboard_env.py` into the same directory as that script
before you run it. See [dashboard-console.md](dashboard-console.md).

## 3. Check

Open `https://dev.app.aero-deck.app/login` and click Continue with Google.
The browser goes to `accounts.google.com`. A verified email signs you in.

Restarting the dashboard still drops the account. That changes when console
users are stored by the control plane.

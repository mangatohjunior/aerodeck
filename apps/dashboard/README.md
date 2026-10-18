# AeroDeck dashboard

Next.js App Router operator console. The browser keeps the session cookie.
Projects are loaded by the server from the control plane when
`CONTROL_PLANE_URL` is set; otherwise Overview shows the local seed.
Sandboxes, deployments, and sign-in stay on `/api/mock/v1`.

Procedures: [docs/runbooks/dashboard-mock.md](../../docs/runbooks/dashboard-mock.md)
and [docs/runbooks/dashboard-console.md](../../docs/runbooks/dashboard-console.md).

## Local

```bash
cd apps/dashboard
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the operator console,
[http://localhost:3000/about](http://localhost:3000/about) for About,
[http://localhost:3000/policy](http://localhost:3000/policy) for Policy, or
[http://localhost:3000/register](http://localhost:3000/register) to create a mock account.

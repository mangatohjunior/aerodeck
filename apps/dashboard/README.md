# AeroDeck dashboard

Next.js App Router operator UI (TypeScript, Tailwind, shadcn/ui). The
New Deployment flow mocks a create-deployment POST and streams fake
provisioner logs. It is not wired to the FastAPI control plane yet.

## Local

```bash
cd apps/dashboard
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Enter a GitHub URL
and click **Deploy** to watch the mock SSE terminal.

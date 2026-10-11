# UGC Connect frontend

Next.js, React, TypeScript and Tailwind frontend for UGC Connect.

```bash
cp .env.example .env.local
npm install
npm run dev -- --port 3001
```

Set `BACKEND_URL` to the Express server origin, normally `http://localhost:5001` locally. The frontend proxies browser requests from `/api` to this server so authentication cookies remain first-party.

For architecture, demo credentials, tests, assumptions and the complete setup guide, see the [repository README](../README.md).

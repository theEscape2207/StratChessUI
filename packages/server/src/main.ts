import { fileURLToPath } from 'node:url';
import { buildApp } from './app.ts';

const port = Number(process.env.PORT ?? 8080);
const staticRoot = fileURLToPath(new URL('../../client/dist', import.meta.url));
const extraHosts = process.env.EXTRA_HOSTS?.split(',').filter(Boolean);

const app = await buildApp({ port, staticRoot, extraHosts });
await app.listen({ host: '0.0.0.0', port });
console.log(`StratChessUI listening on port ${port}`);

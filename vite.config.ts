import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { setDefaultResultOrder } from 'node:dns';
import { handleFirms, handleNews, handleTle, handleWeather, type ProxyResult } from './server/handlers.js';

setDefaultResultOrder('ipv4first');

/**
 * Serves /api/firms and /api/weather during `vite dev` / `vite preview` with the
 * same handlers the Vercel functions use, so keys stay server-side locally too.
 */
function apiDevServer(env: Record<string, string>): Plugin {
  const routes: Record<string, (params: URLSearchParams, env: Record<string, string>) => Promise<ProxyResult>> = {
    '/api/firms': handleFirms,
    '/api/weather': handleWeather,
    '/api/tle': (params) => handleTle(params),
    '/api/news': handleNews,
  };

  const middleware: Connect.NextHandleFunction = async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const handler = routes[url.pathname];
    if (!handler) return next();
    try {
      const result = await handler(url.searchParams, env);
      res.statusCode = result.status;
      res.setHeader('Content-Type', result.contentType);
      res.end(result.body);
    } catch (error) {
      res.statusCode = 502;
      res.end(error instanceof Error ? error.message : 'Upstream request failed.');
    }
  };

  return {
    name: 'artemis-api-dev-server',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load all env vars (not only VITE_*) for server-side use; they are never
  // injected into the client bundle.
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), apiDevServer(env)],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  };
});

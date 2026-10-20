/**
 * Vercel serverless entry point for `/api/*`. Reuses the exact same Express app
 * (security headers, validation, rate limiting) as the long-running server in
 * `server.js` (local development and Cloud Run). On Vercel, `public/` is served
 * by the CDN with the headers declared in `vercel.json`.
 */
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createAiService, createGenAiClient } from '../src/services/gemini.js';

const config = loadConfig();
const ai = createAiService({ config, client: createGenAiClient(config) });

export default createApp({ config, ai });

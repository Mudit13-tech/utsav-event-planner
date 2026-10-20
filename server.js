/**
 * Process entry point: wires configuration, the Gemini client and the app,
 * then starts the HTTP server with graceful shutdown (Cloud Run sends SIGTERM).
 */
import { createApp } from './src/app.js';
import { loadConfig } from './src/config.js';
import { createAiService, createGenAiClient } from './src/services/gemini.js';

const config = loadConfig();
const ai = createAiService({ config, client: createGenAiClient(config) });
const app = createApp({ config, ai });

const server = app.listen(config.port, () => {
  console.log(`Utsav listening on port ${config.port} (AI: ${ai.isLive ? `Gemini ${ai.model}` : 'offline fallback'})`);
});

const shutdown = (signal) => {
  console.log(`${signal} received, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

/**
 * JSON API routes.
 *   GET  /api/health — liveness + whether Gemini is live
 *   POST /api/plan   — deterministic plan (instant: budget, timeline, vendors, insights)
 *   POST /api/ideas  — Gemini personalised ideas for the same event (slower, loaded after the plan)
 *   POST /api/chat   — planning assistant grounded in the plan
 */
import { Router } from 'express';
import { createPlan } from '../services/planner.js';
import { validateChatInput, validateEventInput } from '../services/validation.js';

/**
 * @param {{ ai: ReturnType<import('../services/gemini.js').createAiService>, now?: () => Date }} deps
 */
export function createApiRouter({ ai, now = () => new Date() }) {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', ai: ai.isLive ? 'gemini' : 'fallback', model: ai.isLive ? ai.model : null });
  });

  router.post('/plan', (req, res) => {
    const result = validateEventInput(req.body, now());
    if (!result.ok) return res.status(400).json({ error: 'Invalid event details', details: result.errors });
    return res.json(createPlan(result.value, now()));
  });

  router.post('/ideas', async (req, res, next) => {
    try {
      const result = validateEventInput(req.body, now());
      if (!result.ok) return res.status(400).json({ error: 'Invalid event details', details: result.errors });

      const { source, ideas } = await ai.generateIdeas(result.value, createPlan(result.value, now()));
      return res.json({ ideas, aiSource: source });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/chat', async (req, res, next) => {
    try {
      const result = validateChatInput(req.body, now());
      if (!result.ok) return res.status(400).json({ error: 'Invalid chat request', details: result.errors });

      const plan = createPlan(result.value.event, now());
      const { source, reply } = await ai.chat(result.value, plan);
      return res.json({ reply, aiSource: source });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

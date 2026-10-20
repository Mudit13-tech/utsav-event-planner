# ✦ Utsav — GenAI Celebration & Event Planner

> **PromptWars Virtual · Challenge 5 — Celebration & Event Planner**
> A GenAI-powered planning assistant that helps people organise **weddings, birthdays, anniversaries, baby showers and community events** with **budgets, timelines, vendor checklists and personalised ideas** — powered by **Google Gemini**.

**Live demo:** https://utsav-event-planner.vercel.app

---

## 1. Chosen vertical & persona

**Vertical:** Celebration & Event Planner.

**Persona:** a host (often a family member or a community volunteer, not a professional planner) who has a date, a rough guest count and a budget, and needs to know *what to spend where, what to do when, whom to book first and how to make it feel personal* — especially in an Indian context (multi-day weddings, Jain/vegetarian menus, monsoon season, elderly guests), while still working for other currencies and cultures.

## 2. What the app does

| Need from the problem statement | How Utsav solves it |
| --- | --- |
| **Budgets** | Splits the total budget across categories using event-specific weights, adjusted for venue type, guest count and the user's top-3 priorities. Classifies the budget as *tight / comfortable / premium* per guest and suggests a realistic guest count when it is tight. Users can log actual spend per category and see remaining / over-budget status. |
| **Timelines** | Generates dated milestones from ideal lead times (e.g. book a wedding venue ~240 days out). If the event is sooner, it **compresses** the timeline proportionally, switches to *compressed* or *rush* mode and flags urgent tasks. Exportable to any calendar as an `.ics` file. |
| **Vendor checklists** | Vendor list per event type, sorted by booking deadline, with a budget hint from the allocation, "book now" urgency and the questions to ask each vendor. Check off vendors as you book them; progress is tracked. |
| **Personalised ideas** | **Gemini** generates theme concepts, decor, menu (respecting dietary needs), activities/rituals, guest-experience & accessibility ideas, money-saving tips and sustainability ideas — tailored to the event, city, theme, budget tier and constraints. |
| **Smart, dynamic assistant** | "Ask Utsav" chat — a Gemini assistant grounded in the user's actual plan (budget split, deadlines, vendors) for follow-ups like *"How can I cut costs by 20%?"* |

## 3. Approach & logic

Utsav uses a **hybrid architecture: deterministic decision engine + generative AI.**

1. **The deterministic engine (`src/services/planner.js`)** makes every numeric and date decision. This keeps budgets mathematically exact (amounts always sum to the total), dates correct and the logic explainable and testable — things an LLM can get wrong.
2. **Gemini (`src/services/gemini.js`)** handles what AI is best at — creativity and conversation. It receives a compact, validated *event context* (including the engine's decisions such as budget tier and planning mode) and returns **schema-constrained JSON** (`responseSchema`), which is then sanitised before use.
3. **Instant plan, then AI:** `/api/plan` returns the deterministic plan immediately; the browser then calls `/api/ideas` so Gemini latency never blocks the core plan.
4. **Graceful degradation:** if Gemini is not configured, times out or fails, Utsav still returns a full plan with built-in ideas and a rule-based assistant, so the app never breaks.

### Decision rules (context → behaviour)

| User context | Decision |
| --- | --- |
| Event type | Selects the template: budget weights, ideal lead time, milestones, vendors, typical per-guest spend |
| Venue = home | Venue share ×0.25 (redistributed to decor & logistics); venue vendor becomes "Home setup" |
| Venue = restaurant | Venue ×0.6, catering ×1.1 (bundled pricing) |
| Venue = outdoor | Adds logistics + permits lines, bigger contingency; weather warning (monsoon warning for Jun–Sep in India) |
| Priorities (≤3) | Each chosen category's weight ×1.35, then all weights are re-normalised |
| Guests > 300 / < 25 | Catering ×1.1 / entertainment ×0.7 |
| Budget per guest | Compared (after currency conversion) with typical ranges → tight / comfortable / premium + advice |
| Days until event vs ideal lead time | ≥1.5× relaxed · ≥1× on-track · ≥0.5× compressed · <0.5× rush; milestones scaled by `daysUntil / idealLead`, never before today |
| ≥200 guests or community event | Crowd-safety insight |
| Dietary / accessibility notes | Echoed as insights and passed to Gemini for menus and guest-experience ideas |

### Architecture

```
Browser (vanilla JS, no framework)
  │  POST /api/plan (instant) → POST /api/ideas (Gemini) · POST /api/chat · GET /api/health
  ▼
Express 5 (helmet CSP, rate limit, 16 KB JSON limit, compression)
  ├─ validation.js  → strict allow-list validation & sanitisation
  ├─ planner.js     → budget split · timeline · vendors · insights (deterministic)
  └─ gemini.js      → Gemini ideas (JSON schema) + grounded chat · LRU cache · timeout · fallback
                          │
                          ▼
                 Google Gemini API / Vertex AI (@google/genai)
```

## 4. Google services used

- **Google Gemini (`gemini-3.5-flash-lite`) via the official `@google/genai` SDK**
  - *Personalised ideas:* structured output with `responseMimeType: application/json` + `responseSchema` (`POST /api/ideas`).
  - *Planning assistant:* multi-turn chat grounded in the plan via `systemInstruction` (`POST /api/chat`).
  - Works with a Gemini API key **or** Vertex AI (`GOOGLE_GENAI_USE_VERTEXAI=true`) on Google Cloud.
- **Deployment:** live on Vercel (serverless function for `/api`, CDN for static files, key stored as an encrypted environment variable). A Dockerfile and commands for **Google Cloud Run** + **Secret Manager** are included as an alternative.

## 5. Evaluation focus areas

**Code quality** — small single-purpose modules, dependency injection (the Gemini client, clock and logger are injected), pure functions for all planning logic, JSDoc, ESLint (flat config), no frontend build step.

**Security**
- API key only on the server (env / Secret Manager); never sent to the browser; `.env` git-ignored.
- Strict allow-list validation for every field (enums, ranges, lengths); unknown fields dropped; strings stripped of control characters and angle brackets.
- Prompt-injection hardening: user data is wrapped in `<event_context>` and the system instruction states it is data, not instructions; the assistant is scoped to event planning; history roles are allow-listed.
- LLM output is never trusted: JSON is schema-constrained, then sanitised and length-capped; the UI renders all text with `textContent` (no `innerHTML`).
- Helmet with a strict Content-Security-Policy (`script-src 'self'`, no inline scripts/styles, `frame-ancestors 'none'`), `nosniff`, referrer policy; `x-powered-by` disabled.
- Rate limiting on `/api`, 16 KB body limit, request timeouts, errors never leak stack traces, container runs as non-root.

**Efficiency** — the plan (budget, timeline, vendors) is computed instantly without any AI call and shown immediately, while Gemini ideas load in a second request; identical Gemini requests are served from an LRU + TTL cache; `gemini-3.5-flash-lite` (fast, low-cost; ~4 s for a full idea set in testing) with a low thinking level and bounded output tokens; request timeouts with fallback; gzip compression; static assets cached; zero frontend dependencies (≈48 KB of unminified JS/CSS); production-only Docker image. The model is configurable via `GEMINI_MODEL` (e.g. `gemini-3.8-flash`).

**Testing** — 76 tests with Node's built-in test runner (no extra test framework): validation, budget maths for every event type, timeline compression, vendor ordering, insights, Gemini integration with a fake client (schema, caching, fallback, history), API end-to-end (status codes, security headers, compression, rate limiting) and frontend utilities (.ics, formatting). ~99% line coverage.

```bash
npm test               # run all tests
npm run test:coverage  # with coverage report
npm run lint
```

**Accessibility** — semantic landmarks, skip link, a single `h1` and ordered headings; native form controls with visible labels, fieldsets/legends and `autocomplete`; errors shown after interaction via `:user-invalid` and synced to `aria-invalid`; WAI-ARIA tabs with arrow-key/Home/End support; polite live region announcements; `<progress>` for checklists; urgency conveyed by text, not just colour; visible focus rings; 44–48 px touch targets; light/dark themes via `color-scheme`; `prefers-reduced-motion` and forced-colours support; print stylesheet for a PDF-ready plan.

## 6. Run locally

Requirements: Node.js 22+.

```bash
npm install
cp .env.example .env      # add your GEMINI_API_KEY (https://aistudio.google.com/apikey)
npm run dev               # http://localhost:8080
```

Without a key the app runs in "smart planner" mode (deterministic plan + built-in ideas).

## 7. Deploy

**Vercel (current live deployment)** — `api/index.js` wraps the same Express app; `vercel.json` serves `public/` from the CDN with the same security headers.

```bash
vercel link
vercel env add GEMINI_API_KEY production --sensitive
vercel deploy --prod
```

**Google Cloud Run (alternative)**

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com
printf "%s" "YOUR_GEMINI_API_KEY" | gcloud secrets create gemini-api-key --data-file=-
gcloud run deploy utsav-event-planner \
  --source . --region asia-south1 --allow-unauthenticated \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest \
  --set-env-vars NODE_ENV=production
```

(Grant the Cloud Run service account the *Secret Manager Secret Accessor* role if prompted.)

## 8. Assumptions

- Currency conversion to INR uses fixed approximate rates (USD 84, EUR 91, GBP 107, AED 23) only to classify the budget tier; amounts are always shown in the user's currency.
- Typical per-guest spend ranges and lead times are planning heuristics based on common Indian and international practice, not quotes. Real prices vary by city and season.
- Dates are handled as calendar days in UTC so timelines do not shift across time zones.
- The plan, checklist progress, actual spend and chat history are stored only in the user's browser (`localStorage`); the server is stateless and stores no personal data.
- Gemini never invents vendor names or prices; Utsav gives categories, deadlines and questions to ask instead.

## 9. Project structure

```
server.js                 # entry point, graceful shutdown
api/index.js              # Vercel serverless entry (same Express app)
vercel.json               # Vercel routing, CDN headers
src/
  app.js                  # Express app factory (security, rate limit, static)
  config.js               # env-based config
  data/templates.js       # event templates: weights, lead times, vendors, milestones
  middleware/errors.js    # 404 + safe error handler
  routes/api.js           # /api/health, /api/plan, /api/ideas, /api/chat
  services/
    validation.js         # input validation & sanitisation
    planner.js            # deterministic planning engine
    gemini.js             # Gemini ideas + chat, fallback, caching
    cache.js              # LRU cache with TTL
public/                   # accessible vanilla-JS frontend
tests/                    # node:test suites
Dockerfile                # Cloud Run image
```

## License

MIT

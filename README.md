# AI Mail Summarizer

A full-stack, production-shaped email management application that reads your inbox and answers the
questions that matter: **what is this email about, what do I need to do, by when, how important is it,
and do I need to reply?**

Built as an applied-research system (React + Express + PostgreSQL + Prisma + Google OAuth/Gmail API +
OpenAI) that also runs **completely offline** with a deterministic analysis engine and a seeded mailbox,
so every feature is demonstrable without any external credentials.

---

## 1. Feature map

| Spec area | Where it lives | Status |
| --- | --- | --- |
| Authentication (Google OAuth 2.0, sessions, logout) | `server/src/services/authService.js`, `server/src/routes/authRoutes.js` | ✅ + password-free demo login |
| Gmail integration (sync, metadata, body, labels, read state) | `server/src/services/providers/gmailProvider.js`, `server/src/services/emailService.js` | ✅ |
| AI summarization (short / medium / detailed) | `server/src/services/ai/aiService.js` | ✅ |
| Key point extraction | `localAnalyzer.js` / OpenAI prompt | ✅ |
| Action item extraction (with completion state) | `ActionItem` model + `/api/tasks` | ✅ |
| Deadline detection (explicit, meeting, appointment, general) | `localAnalyzer.parseDateMention`, `Deadline` model | ✅ |
| Priority (Urgent/High/Medium/Low) with reasons | `classifyPriority` | ✅ |
| Categories (Work … Other, extensible) | `classifyCategory` + `CATEGORIES` | ✅ |
| Importance score 0–100 with reasons | `calculateImportance` | ✅ |
| AI reply generator (5 tones, editable, never auto-sent) | `ReplyComposer.jsx`, `generateReply` | ✅ |
| Translation (EN/HI/TA/ES/FR/DE, cached) | `Translation` model, `translateEmail` | ✅ |
| Analytics dashboard (volume, categories, priority, senders) | `analyticsService.js`, `Analytics.jsx` | ✅ |
| Daily AI digest (enable/disable + time) | `digestService.js`, `DigestCard.jsx` | ✅ |
| Important email notifications (threshold configurable) | `notificationService.js`, bell menu | ✅ |
| Spam/phishing warnings (decision support only) | `detectPhishing`, security panel | ✅ |
| Voice summaries | `useSpeech` (Web Speech API) | ✅ |
| Personal AI preferences | `preferenceService.js`, `Settings.jsx` | ✅ |
| Multi-account architecture (provider interface) | `services/providers/index.js` | ✅ Gmail + Mock, Outlook slot prepared |

---

## 2. Architecture

```
┌──────────────────────────── React (Vite + Tailwind) ─────────────────────────────┐
│ Login · Dashboard · Inbox (master/detail) · Email detail · Tasks · Analytics ·   │
│ Settings        AuthContext + ToastContext · axios (cookies + CSRF) · recharts    │
└───────────────────────────────────┬──────────────────────────────────────────────┘
                                    │ REST /api (session cookie + X-CSRF-Token)
┌───────────────────────────────────▼──────────────────────────────────────────────┐
│ Express API                                                                      │
│  middleware: helmet · cors · rate limit · CSRF · zod validation · error handler   │
│  routes: auth · emails · ai · tasks · analytics · preferences · digest · notifs   │
├──────────────────────────────────────────────────────────────────────────────────┤
│ Services  (no route handler touches the DB, a provider or a prompt directly)      │
│  emailService · aiService · analyticsService · taskService · digestService        │
│  notificationService · preferenceService · authService                            │
├──────────────────────────────────────────────────────────────────────────────────┤
│ Email provider interface            │  AI layer                                   │
│  Gmail provider (googleapis)        │   prompts.js   (centralized, versioned)     │
│  Mock provider (seeded mailbox)     │   openaiClient.js (timeout, retry, JSON)    │
│  Outlook provider (registered)      │   localAnalyzer.js (deterministic engine)   │
│                                     │   schema.js (zod validation of AI output)   │
├──────────────────────────────────────────────────────────────────────────────────┤
│ Email pipeline: raw → decode → MIME walk → HTML→text → strip quotes/signature →   │
│                 normalize whitespace → clean body → AI                            │
├──────────────────────────────────────────────────────────────────────────────────┤
│ Prisma → PostgreSQL (User, EmailAccount, Email, Summary, ActionItem, Deadline,    │
│                       Translation, Preference, Digest, Notification)              │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Two engines, one contract

`aiService` exposes the same functions regardless of configuration, and **every** response is validated
against a zod schema before it can be stored:

- **OpenAI mode** (`OPENAI_API_KEY` set): one structured JSON request per email, one automatic repair
  attempt if the JSON or the shape is invalid, then a safe fallback.
- **Local mode** (default, no key): a rule-based engine in `localAnalyzer.js` — deterministic (same input →
  same output), no network, no cost, suitable for reproducible offline experiments.

Design rules enforced by the local engine (and asked for from the model in `prompts.js`):
never invent dates, never invent action items, distinguish facts from interpretation, keep priority
consistent with the stated reasons.

---

## 3. Quick start

Prerequisites: Node ≥ 20, PostgreSQL ≥ 14 (running locally).

```bash
# 1. install (npm workspaces: client + server)
npm install

# 2. configure the backend
cp server/.env.example server/.env
#   → set DATABASE_URL and a fresh SESSION_SECRET:
#     node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 3. create the database (once)
createdb ai_mail_summarizer

# 4. schema + demo data (24 realistic emails, analyzed, with tasks/deadlines/digest)
npm run db:migrate
npm run db:seed

# 5. start both apps (Express :4000, Vite :5173)
npm run dev
```

Open <http://localhost:5173/login> and pick **Continue with demo mailbox**.

> Cookies are host-scoped, so the Vite dev server proxies `/api`, `/auth` and `/health` to Express on
> port 4000. That keeps the session first-party and makes the OAuth redirect chain behave exactly as it
> does in production behind one origin.

### Switching to real Google + OpenAI

1. Google Cloud Console → *Credentials* → OAuth client (Web application) with the redirect URI
   `http://localhost:4000/auth/google/callback`; enable the **Gmail API**.
2. Put `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `server/.env`.
3. Put `OPENAI_API_KEY` in `server/.env` to swap the local engine for the model.
4. Restart the server and use **Continue with Google** (the app requests `gmail.readonly`,
   `gmail.modify`, `gmail.send` and stores refresh tokens for offline sync).

Nothing else changes: the same routes, the same schema, the same UI.

---

## 4. REST API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/auth/google` → `/auth/google/callback` | OAuth 2.0 (browser redirect flow) |
| POST | `/api/auth/demo` | Password-free demo session |
| GET | `/api/auth/me` | Session user, preferences, accounts, capabilities |
| POST | `/api/auth/logout` | Clear session |
| GET | `/api/emails` | List with search, filters, sorting, pagination |
| GET | `/api/emails/:id` | Full email + AI analysis |
| POST | `/api/emails/sync` | Provider sync (+ analyze the newest N) |
| POST | `/api/emails/analyze-pending` · `/api/emails/reanalyze` | Analyze the backlog / re-run with new settings |
| PATCH | `/api/emails/:id/read` · `/api/emails/bulk/read` | Read state (propagates to the provider) |
| POST | `/api/emails/:id/reply` | Send a user-confirmed reply |
| POST | `/api/ai/analyze/:emailId` | Full structured analysis (summary, points, tasks, deadlines, priority, category, score, risk) |
| POST | `/api/ai/summarize|key-points|action-items|deadlines|classify|category|importance|phishing/:emailId` | Individual capabilities |
| POST | `/api/ai/reply/:emailId` | Draft reply (tones) — never auto-sent |
| POST | `/api/ai/translate/:emailId` | Translate body and/or summary |
| GET | `/api/tasks` · PATCH `/api/tasks/:id` | Action items + completion |
| GET | `/api/analytics` | Dashboard aggregates |
| GET/PUT | `/api/preferences` | AI preferences |
| GET | `/api/digest` | Daily AI digest (cached per day) |
| GET | `/api/notifications` · PATCH `/api/notifications/:id` | Important-email alerts |
| GET | `/health` | Liveness + database probe |

---

## 5. Security

- Google OAuth 2.0 only — passwords are never collected or stored.
- Session is a signed JWT in an **httpOnly** cookie; a separate readable `ams_csrf` cookie is echoed in
  `X-CSRF-Token` for every mutation (double-submit pattern).
- OAuth `state` is verified against an httpOnly cookie to block CSRF on the callback.
- `helmet`, strict CORS (single configured origin, credentials), rate limits (API 300/min, auth 60/15min,
  AI 30/min), body size limits.
- Every request body/query/param is validated with zod; AI output is validated against a schema.
- Prisma parameterises all SQL (no string-built queries); React escapes all rendered content.
- Tokens, `GOOGLE_CLIENT_SECRET`, `OPENAI_API_KEY` and refresh tokens never leave the server and are
  never included in API responses (`listAccounts` selects explicit fields only).
- The logger redacts any key matching `token|secret|key|authorization|password|cookie`.

---

## 6. Testing

```bash
npm test                     # 55 unit tests (pipeline, engine, AI contract, quality guardrails)
npm --workspace server run test:watch
```

The suite includes *quality guardrails* that pin the behaviour that makes the analysis trustworthy:
no phantom deadlines, no greetings-as-tasks, no tasks from marketing mail, calibrated `urgent`,
security warnings that do not cry wolf, and exactly one risky email in the seeded mailbox.

Manual end-to-end paths worth exercising after changes:
1. Login → dashboard → sync → inbox → open an email (analysis appears, read state flips).
2. Generate a reply, edit it, confirm → demo mode records it locally / Gmail sends it.
3. Translate a summary, play it back with the voice button.
4. Toggle preferences → re-analyze → confirm the summaries change depth/language.
5. Complete tasks and watch the dashboard/analytics counters move.

---

## 7. Project structure

```
.
├── client/                     React + Vite + Tailwind
│   └── src/{components,context,hooks,pages,services,utils}
├── server/                     Express + Prisma
│   ├── prisma/{schema.prisma,seed.js,migrations}
│   ├── src/{config,controllers,lib,middleware,routes,services}
│   │   └── services/{ai,providers}
│   └── tests/
├── .env.example → server/.env.example
└── package.json                npm workspaces + helper scripts
```

---

## 8. Research / evaluation notes (IEEE track)

The system is positioned as an *applied* system that wraps LLM summarization, not as a new model. Because
the local engine is deterministic and offline, the full experimental harness can run reproducibly:

- **Automatic metrics** — ROUGE-1/2/L and BERTScore against reference summaries held in a labelled set.
  With `localAnalyzer` the score for a given input is identical on every machine; with OpenAI mode set
  `temperature` (already 0.1 for analysis, 0 for translation) and record `modelUsed`, `engine` and
  `promptVersion` (stored on every `Summary` row) so runs are traceable.
- **Task-level accuracy** — action-item and deadline extraction against a hand-labelled subset; the
  `Deadline.dateText` field preserves the literal wording, which makes scoring against annotations direct.
- **Classification accuracy** — priority and category accuracy/F1 per class.
- **Hallucination rate** — fraction of extracted dates/tasks not present in the source email.
- **Human evaluation** — accuracy, relevance, conciseness, readability, completeness, usefulness
  (5-point Likert) on a sample stratified by category.

Report only measured values: no results are pre-populated anywhere in this repository.

---

## 9. Roadmap

- Outlook/Microsoft Graph provider (the interface and the `OUTLOOK` enum already exist).
- Scheduled workers for sync + digest (currently an in-process 15-minute scheduler) via a queue.
- Thread-level summarization (EmailSum-style) using `Email.threadId`, which is already captured.
- Retrieval-augmented reply drafting from the user's own sent mail.
- Vector search over summaries for "ask your inbox" style queries.

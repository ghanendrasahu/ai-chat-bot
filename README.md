# AI Chat Bot

A fullstack AI chat bot with a Node.js/Express backend and a React (Vite) frontend. It talks to
Groq, OpenAI or OpenRouter through the same OpenAI-compatible endpoint, and serves the built
frontend from the same process so the whole thing deploys as one web service.

> **Live demo:** https://ai-chat-bot-tmov.onrender.com
>
> Free-tier hosting: the first load after idle can take 30-60 seconds.

## Tech Stack

- **Backend:** Node.js, Express 5, OpenAI SDK, CORS, dotenv
- **Frontend:** React 19, Vite 7, ESLint

## The model: which provider, and is it free?

The backend supports three OpenAI-compatible providers. **A key the visitor pastes in Settings wins
over the server's key**, so the app works even when no key is configured on the server.

| Provider | Default model | Cost | Free tier |
|---|---|---|---|
| **Groq** (`GROQ_API_KEY`) | `openai/gpt-oss-20b` | **$0.00** | Yes, forever. No card. 30 requests/min, 1,000 requests/day, 200,000 tokens/day, 131k context. |
| **OpenAI** (`OPENAI_API_KEY`) | `gpt-4o-mini` | $0.15 / 1M input tokens, $0.60 / 1M output tokens | No permanent free tier - new accounts get trial credits only. |
| **OpenRouter** (`OPENROUTER_API_KEY`) | `openrouter/auto` | Depends on the routed model | Many models are free (`:free` suffix), with their own limits. |

All three run against OpenAI's Chat Completions API shape, so switching is just a different key and
base URL - no code change. The default provider is the first one with a server key, and `AI_MODEL`
overrides that provider's model. Visitors can pick any provider and any model id from the header,
model by model.

**What the live demo uses right now:** `render.yaml` declares `OPENAI_API_KEY`, so the deployed
instance is on OpenAI `gpt-4o-mini` and is metered. A typical message (about 50 input + 300 output
tokens) costs roughly **$0.00019**, so 1,000 messages is around 20 cents - but it is not free.

**To make it genuinely free:** get a key from https://console.groq.com (no card required), set
`GROQ_API_KEY` in the Render dashboard, and clear `OPENAI_API_KEY`. The per-IP limits (15/min,
400/day) already sit under Groq's 30/min and 1,000/day caps, so the free tier covers the whole app.
`GET /health` reports the live provider and model, and the header badge shows it in the UI.

## Features

- **Bring your own key** - paste a Groq, OpenAI or OpenRouter key in Settings, under that provider.
  Keys are kept in the browser's `localStorage` and sent per request in an `X-Provider-Key` header;
  the server never stores or logs them.
- **Model switching in the header** - pick a provider and a model id, or type any id the provider
  offers. The conversation continues; each reply is labelled with the model that wrote it.
- **One memory for every model** - add short facts ("I live in India and prefer TypeScript") once
  and every provider reads them. The same list travels with each request and is assembled into the
  system prompt server-side. Bookmark any message you sent to remember it.
- **Persona and custom instructions** - Friendly, Concise, Technical or Creative, plus free-text
  instructions such as "answer in bullet points", applied to every model. A conversation can
  override the tone and add instructions of its own without touching the global ones.
- **Streaming replies** - tokens appear as the model writes them. **Stop** keeps the partial text
  instead of throwing it away, and a dropped connection keeps it too, with a retry. Comment
  heartbeats keep idle proxies from closing a stream while the model is still thinking.
- **Edit and resend** any message you sent: it replaces that turn, drops everything after it and
  asks again. **Regenerate** keeps the old answers as variants (`‹ 2/3 ›`), so nothing is lost.
- **Auto titles** - after the first reply the chat gets a short title from a cheap extra call;
  rename it yourself in the drawer at any time.
- Markdown rendering - headings, lists, bold/italic, inline code, links, blockquotes and fenced
  code blocks with a copy button. Partial replies render as they stream, including an unclosed
  code fence.
- **Copy, pin, delete** any message from its actions menu. Pinned turns are always sent as context
  and are never summarised away.
- **Search across conversations** in the drawer, plus new/delete/undo
- Theme control (System / Light / Dark) that follows the OS live
- **Conversations survive a refresh** - chats live in IndexedDB, with a one-time migration from the
  old `localStorage` formats. Settings and keys deliberately stay in `localStorage`. A pending save
  is flushed on `pagehide` and when the tab is hidden, so a closed tab does not lose the last turn.
- **Context that fits the model** - the server keeps the newest turns inside a token budget,
  folds older ones into a cached rolling summary, and falls back to plain trimming if the summary
  call fails. The summary is built alongside the reply instead of before it, so it never delays the
  first token; the triggering turn receives the new summary in `done` for the next turn to use.
- Textarea composer: <kbd>Enter</kbd> sends, <kbd>Shift</kbd>+<kbd>Enter</kbd> adds a line, a
  character counter warns near the 2,000-character limit, and a stop button cancels a slow reply
- **Memory you control** - edit or delete any remembered fact, and a dismissible "Remember this?"
  chip offers durable facts you mention. Nothing is ever saved without a tap.
- An honest status badge - it polls `/ping` and shows Ready, No model key or Offline
- Per-IP rate limiting, a CORS allowlist, security headers, and provider errors that never reach
  the browser

## Getting Started

### Backend

```bash
cd backend
npm install
cp .env.example .env   # add GROQ_API_KEY or OPENAI_API_KEY
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:5173` and calls the backend on `http://localhost:3001`.

## API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health`, `/ping` | `{ status, ready, provider, model, providers }` - used by the status badge |
| `POST` | `/chat` | `{ message, history?, pinned?, memory?, instructions?, chatInstructions?, persona?, summary?, summaryCount? }` -> `{ reply, model, provider, keySource, summary, summaryCount }` |
| `POST` | `/chat/stream` | Same body and headers; answers as SSE (`token`, `done`, `error`) |
| `POST` | `/title` | `{ message }` -> `{ title }`, at most four words |
| `POST` | `/summary` | `{ previous?, messages }` -> `{ summary }` |

`/chat/stream` sends `text/event-stream` with `Cache-Control: no-cache, no-transform`,
`Connection: keep-alive` and `X-Accel-Buffering: no`. Each `token` event carries a `{ t }` chunk;
`done` carries the full reply plus the model/provider and the updated summary. While the model is
quiet, the server writes `: ping` comment frames (every `CHAT_STREAM_HEARTBEAT_MS`); SSE clients
ignore them, but they keep proxies and load balancers from treating the stream as dead. Validation,
auth, origin and rate-limit failures that happen before the first token are ordinary JSON errors,
the same shape as `/chat`. Mid-stream failures arrive as a safe `error` event. A server timeout
(`CHAT_STREAM_TIMEOUT_MS`) ends a stream that never finishes, and a client disconnect aborts the
upstream request.

Every API response carries `X-Request-Id`. One structured line per API call is logged with the
route, status, duration, provider, model and approximate token counts - never prompts, replies,
keys or provider payloads. A caller-supplied `X-Request-Id` (8-64 URL-safe characters) is echoed
back and used in that line.

Optional request headers on `POST /chat`:

| Header | Meaning |
|---|---|
| `X-Provider` | `groq`, `openai` or `openrouter`. Defaults to the first provider with a server key. |
| `X-Model` | Any model id the provider accepts. Defaults to that provider's default (or `AI_MODEL`). |
| `X-Provider-Key` | The caller's own key. Used for this request only, never stored or logged. |
| `X-Access-Token` | Required only when `CHAT_ACCESS_TOKEN` is set. |

`history` is optional and may carry up to 40 `{ role, content }` turns (`user` or `assistant`
only), capped at 24,000 characters. It is then fitted to a ~6,000-token budget server-side: the
newest turns are kept, and older ones are folded into `summary`. Pinned turns travel separately
in `pinned` (up to 8 turns / 6,000 characters) and are never trimmed or summarised.

`memory` is an optional list of up to 40 short facts (300 characters each, 6,000 in total).
`instructions` is at most 2,000 characters, `chatInstructions` at most 1,000, and `persona` is one
of `friendly`, `concise`, `technical`, `creative`. `chatInstructions` is layered on top of the
global instructions and stored per conversation. `summary` is a cached summary of earlier turns,
frozen as returned by the server; the server rolls it forward only when enough new turns have
fallen out of the budget. Everything is sanitized server-side and assembled into the system
prompt, which is why the same memory works no matter which model answers.

## Configuration

Backend variables (copy `backend/.env.example` to `backend/.env`):

| Variable | Default | Description |
|---------|---------|-------------|
| `GROQ_API_KEY` / `OPENAI_API_KEY` / `OPENROUTER_API_KEY` | *(empty)* | Server-side LLM keys. Optional: visitors can bring their own. |
| `AI_MODEL` | provider default | Override the default provider's model name |
| `AI_AUX_MODEL` | provider default | Model for `/title` and `/summary`. Utilities use the provider's cheap default even when the visitor picked a large model. |
| `HOST` | `0.0.0.0` | Interface to bind. Use `127.0.0.1` to keep a local run off the network. |
| `CHAT_ACCESS_TOKEN` | *(empty)* | Require `X-Access-Token` on `POST /chat` |
| `CHAT_RATE_LIMIT` | `15` | Requests per IP per minute |
| `CHAT_DAILY_LIMIT` | `400` | Requests per IP per day |
| `CHAT_GLOBAL_LIMIT` | `120` | Requests per minute for the whole service |
| `CHAT_GLOBAL_DAILY_LIMIT` | `1500` | Requests per day for the whole service |
| `CHAT_AUX_LIMIT` | `60` | Title/summary calls per IP per minute (a separate bucket) |
| `CHAT_AUX_DAILY_LIMIT` | `2000` | Title/summary calls per IP per day |
| `CHAT_STREAM_TIMEOUT_MS` | `45000` | Longest a stream may stay open |
| `CHAT_STREAM_HEARTBEAT_MS` | `15000` | Interval between `: ping` comment frames on a quiet stream |
| `CHAT_MAX_TOKENS` | `1024` | Cap on reply length, so cost and worst-case latency stay bounded |
| `TRUST_PROXY` | `1` | Proxy hops to trust when reading `X-Forwarded-For` |
| `CORS_ORIGIN` | `http://localhost:5173` | Comma-separated browser origins |

When the backend sets `CHAT_ACCESS_TOKEN`, the frontend must be built with the same value in
`VITE_CHAT_TOKEN`. Vite embeds that value in the browser bundle, so treat it as abuse friction
rather than a server secret; the per-IP limits are the primary control. Provider errors are logged
server-side and never returned to clients.

### How the abuse limits work

The per-IP limits key on the client address, which is only as trustworthy as `TRUST_PROXY`. Behind
one proxy (Render) `TRUST_PROXY=1` reads the address the proxy appended, and a client cannot forge
it. Exposed directly, the header is client-controlled and the per-IP limit can be sidestepped - so
`TRUST_PROXY=0` is the right setting there, and `CHAT_GLOBAL_LIMIT` /
`CHAT_GLOBAL_DAILY_LIMIT` are the backstop either way: they are counted on the clock, not on
anything the client controls, and they cap what a spoofing client can spend.

A request to any provider-spending route (`/chat`, `/chat/stream`, `/title`, `/summary`) from a
browser origin that is neither the app's own origin nor one in `CORS_ORIGIN` is refused with `403`
before it reaches the model. CORS alone would only stop the browser from *reading* the reply - the
request would still run and still cost a call. The app's own origin is always allowed, because
browsers send an `Origin` header on every POST and on module script fetches; static files are never
blocked by this check.

## Performance and delivery

The backend compresses the hashed JS/CSS in `/assets/*` with gzip on first request and keeps the
compressed copy for the life of the process, so a deployment without a CDN in front still ships
about a third of the bytes. Inter is self-hosted from `frontend/public/fonts` (SIL OFL 1.1) with a
`preload`, which removes two third-party connections and a render-blocking external stylesheet.
The conversations drawer and settings dialog are lazy-loaded, finished messages are memoised, and
the logo/icon variants are sized for their slots.

Measured on the production build with Lighthouse mobile (simulated slow 4G, 4x CPU):

| Metric | Before | After |
|---|---|---|
| Performance score | 87 | **99** |
| FCP | 1.6 s | **0.8 s** |
| LCP | 4.0 s | **2.2 s** |
| TBT | 60 ms | **0 ms** |
| Total transfer | 445 KiB | **221 KiB** |
| Initial JS (gzip) | 80.97 kB | **77.75 kB + 5.4 kB lazy** |

Backend time-to-first-token, measured with a fake provider that spends 300 ms on the summary and
then streams 50 tokens at 20 ms: **318 ms -> 11 ms** (-96.5%). Total reply time moved from
1,863 ms to 1,606 ms (-13.8%).

Frontend variables are documented in [`frontend/README.md`](frontend/README.md).

## Tests

```bash
cd backend
npm test              # API, providers, memory, rate limits

cd ../frontend
npm run lint
npm run build
npm run test:mobile   # responsive checks in a real Chrome (needs Chrome installed)
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start backend with hot-reload (nodemon) |
| `npm start` | Start backend in production mode |
| `npm run dev` (frontend) | Start Vite dev server |
| `npm run build` (frontend) | Build for production |
| `npm run lint` (frontend) | Run ESLint |

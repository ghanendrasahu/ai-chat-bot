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
  instructions such as "answer in bullet points", applied to every model.
- Markdown rendering - headings, lists, bold/italic, inline code, links, blockquotes and fenced
  code blocks with a copy button
- **Regenerate** the last reply, copy any reply, retry a failed one
- **Search across conversations** in the drawer, plus new/delete/undo
- Theme control (System / Light / Dark) that follows the OS live
- Thread survives a refresh - conversations are kept in `localStorage`
- Textarea composer: <kbd>Enter</kbd> sends, <kbd>Shift</kbd>+<kbd>Enter</kbd> adds a line, a
  character counter warns near the 2,000-character limit, and a stop button cancels a slow reply
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
| `POST` | `/chat` | `{ message, history?, memory?, instructions?, persona? }` -> `{ reply, model, provider, keySource }` |

Optional request headers on `POST /chat`:

| Header | Meaning |
|---|---|
| `X-Provider` | `groq`, `openai` or `openrouter`. Defaults to the first provider with a server key. |
| `X-Model` | Any model id the provider accepts. Defaults to that provider's default (or `AI_MODEL`). |
| `X-Provider-Key` | The caller's own key. Used for this request only, never stored or logged. |
| `X-Access-Token` | Required only when `CHAT_ACCESS_TOKEN` is set. |

`history` is optional and takes up to 12 `{ role, content }` turns (`user` or `assistant` only).
The server drops unknown roles, clips each turn to 2,000 characters and caps the total at 8,000.

`memory` is an optional list of up to 40 short facts (300 characters each, 6,000 in total).
`instructions` is at most 2,000 characters, and `persona` is one of `friendly`, `concise`,
`technical`, `creative`. Everything is sanitized server-side and assembled into the system prompt,
which is why the same memory works no matter which model answers.

## Configuration

Backend variables (copy `backend/.env.example` to `backend/.env`):

| Variable | Default | Description |
|---------|---------|-------------|
| `GROQ_API_KEY` / `OPENAI_API_KEY` / `OPENROUTER_API_KEY` | *(empty)* | Server-side LLM keys. Optional: visitors can bring their own. |
| `AI_MODEL` | provider default | Override the default provider's model name |
| `HOST` | `0.0.0.0` | Interface to bind. Use `127.0.0.1` to keep a local run off the network. |
| `CHAT_ACCESS_TOKEN` | *(empty)* | Require `X-Access-Token` on `POST /chat` |
| `CHAT_RATE_LIMIT` | `15` | Requests per IP per minute |
| `CHAT_DAILY_LIMIT` | `400` | Requests per IP per day |
| `CHAT_GLOBAL_LIMIT` | `120` | Requests per minute for the whole service |
| `CHAT_GLOBAL_DAILY_LIMIT` | `1500` | Requests per day for the whole service |
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

A request to the API from a browser origin that is neither the app's own origin nor one in
`CORS_ORIGIN` is refused with `403` before it reaches the model. CORS alone would only stop the
browser from *reading* the reply - the request would still run and still cost a call. The app's own
origin is always allowed, because browsers send an `Origin` header on every POST and on module
script fetches; static files are never blocked by this check.

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

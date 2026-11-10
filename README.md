# AI Chat Bot

A fullstack AI chat bot with a Node.js/Express backend and a React (Vite) frontend. It talks to
Groq or OpenAI through the same OpenAI-compatible endpoint, and serves the built frontend from the
same process so the whole thing deploys as one web service.

> **Live demo:** https://ai-chat-bot-tmov.onrender.com
>
> Free-tier hosting: the first load after idle can take 30-60 seconds.

## Tech Stack

- **Backend:** Node.js, Express 5, OpenAI SDK, CORS, dotenv
- **Frontend:** React 19, Vite 7, ESLint

## The model: which provider, and is it free?

The backend supports two providers and picks one at startup. **Groq wins when both keys are set.**

| Provider | Model | Cost | Free tier |
|---|---|---|---|
| **Groq** (`GROQ_API_KEY`) | `openai/gpt-oss-20b` | **$0.00** | Yes, forever. No card. 30 requests/min, 1,000 requests/day, 200,000 tokens/day, 131k context. |
| **OpenAI** (`OPENAI_API_KEY`) | `gpt-4o-mini` | $0.15 / 1M input tokens, $0.60 / 1M output tokens | No permanent free tier - new accounts get trial credits only. |

Both run against OpenAI's Chat Completions API shape, so switching is just a different key and base
URL - no code change. `AI_MODEL` overrides the model name if you want something else (for example
`gpt-5.4-nano` or `gpt-6-luna` on OpenAI, or `openai/gpt-oss-120b` on Groq).

**What the live demo uses right now:** `render.yaml` declares `OPENAI_API_KEY`, so the deployed
instance is on OpenAI `gpt-4o-mini` and is metered. A typical message (about 50 input + 300 output
tokens) costs roughly **$0.00019**, so 1,000 messages is around 20 cents - but it is not free.

**To make it genuinely free:** get a key from https://console.groq.com (no card required), set
`GROQ_API_KEY` in the Render dashboard, and clear `OPENAI_API_KEY`. The per-IP limits (15/min,
400/day) already sit under Groq's 30/min and 1,000/day caps, so the free tier covers the whole app.
`GET /health` reports the live provider and model, and the header badge shows it in the UI.

## Features

- Streaming-free but fast replies, with **Markdown rendering** - headings, lists, bold/italic,
  inline code, links, blockquotes and fenced code blocks with a copy button
- **Conversation memory** - the last 10 turns are sent back to the model, so Mira actually follows
  the thread
- **Thread survives a refresh** - the conversation is kept in `localStorage`
- Textarea composer: <kbd>Enter</kbd> sends, <kbd>Shift</kbd>+<kbd>Enter</kbd> adds a line, a
  character counter warns near the 2,000-character limit, and a stop button cancels a slow reply
- Copy any reply, retry a failed one, jump back to the latest message, undo a cleared conversation
- An honest status badge - it polls `/health` and shows Ready, No model key or Offline
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
| `GET` | `/health` | `{ status, ready, provider, model }` - used by the status badge |
| `POST` | `/chat` | `{ message, history? }` -> `{ reply }` |

`history` is optional and takes up to 12 `{ role, content }` turns (`user` or `assistant` only).
The server drops unknown roles, clips each turn to 2,000 characters and caps the total at 8,000.

## Configuration

Backend variables (copy `backend/.env.example` to `backend/.env`):

| Variable | Default | Description |
|---------|---------|-------------|
| `GROQ_API_KEY` / `OPENAI_API_KEY` | *(empty)* | Server-side LLM key; Groq wins when both are set |
| `AI_MODEL` | provider default | Override the model name |
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

A request from a browser origin that is not in `CORS_ORIGIN` is refused with `403` before it
reaches the model. CORS alone would only stop the browser from *reading* the reply - the request
would still run and still cost a call.

Frontend variables are documented in [`frontend/README.md`](frontend/README.md).

## Tests

```bash
cd backend
npm test
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start backend with hot-reload (nodemon) |
| `npm start` | Start backend in production mode |
| `npm run dev` (frontend) | Start Vite dev server |
| `npm run build` (frontend) | Build for production |
| `npm run lint` (frontend) | Run ESLint |

# AI Chat Bot

A fullstack AI chat bot with a Node.js/Express backend and React (Vite) frontend, powered by the OpenAI API.

> **Live demo:** https://ai-chat-bot-tmov.onrender.com
>
> Free-tier hosting: the first load after idle can take 30-60 seconds.

## Tech Stack

- **Backend:** Node.js, Express, OpenAI SDK, CORS, dotenv
- **Frontend:** React 19, Vite 7, ESLint

## Getting Started

### Backend

```bash
cd backend
npm install
cp .env.example .env   # add your OPENAI_API_KEY
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:5173` and proxies API requests to the backend.

## Configuration

Backend variables (copy `backend/.env.example` to `backend/.env`):

| Variable | Default | Description |
|---------|---------|-------------|
| `GROQ_API_KEY` / `OPENAI_API_KEY` | *(empty)* | Server-side LLM key; Groq wins when both are set |
| `AI_MODEL` | provider default | Override the model name |
| `CHAT_ACCESS_TOKEN` | *(empty)* | Require `X-Access-Token` on `POST /chat` |
| `CHAT_RATE_LIMIT` | `15` | Requests per IP per minute |
| `CHAT_DAILY_LIMIT` | `400` | Requests per IP per day |
| `CORS_ORIGIN` | `http://localhost:5173` | Comma-separated browser origins |

When the backend sets `CHAT_ACCESS_TOKEN`, the frontend must be built with the same value in `VITE_CHAT_TOKEN`. Vite embeds that value in the browser bundle, so treat it as abuse friction rather than a server secret; the per-IP limits are the primary control. Provider errors are logged server-side and never returned to clients.

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
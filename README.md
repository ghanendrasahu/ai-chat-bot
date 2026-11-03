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

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start backend with hot-reload (nodemon) |
| `npm start` | Start backend in production mode |
| `npm run dev` (frontend) | Start Vite dev server |
| `npm run build` (frontend) | Build for production |
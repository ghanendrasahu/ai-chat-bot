# Frontend

The React client for Mira. It is built with Vite and served by the Express
backend in production, so the whole project deploys as one web service.

```bash
npm install
npm run dev      # http://localhost:5173
```

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Build to `dist/`, which the backend serves |
| `npm run lint` | Run ESLint |
| `npm run preview` | Preview the production build |

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | *(empty in production)* | Backend origin. Empty means "same origin", which is what the single-service deploy needs. Unset in development falls back to `http://localhost:3001`. |
| `VITE_CHAT_TOKEN` | *(empty)* | Sent as `X-Access-Token`. Only needed when the backend sets `CHAT_ACCESS_TOKEN`. |

## Layout

```
src/
  App.jsx              page shell
  components/          one component per file, icons kept together
  hooks/               useChat (thread + request), useHealth (status badge)
  lib/                 api calls, error wording, markdown parser, storage
```

The Markdown parser in `src/lib/markdown.js` covers a small, safe subset and
renders to React elements, so model output can never inject markup.

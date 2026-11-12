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
| `npm run test:mobile` | Responsive + settings checks in a real Chrome |

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | *(empty in production)* | Backend origin. Empty means "same origin", which is what the single-service deploy needs. Unset in development falls back to `http://localhost:3001`. |
| `VITE_CHAT_TOKEN` | *(empty)* | Sent as `X-Access-Token`. Only needed when the backend sets `CHAT_ACCESS_TOKEN`. |

## Settings and keys

Everything the visitor can tune lives under `mira.settings.v1` in `localStorage`: the active
provider and model, one API key per provider, the shared memory, custom instructions, persona and
theme. There is no account and no server-side storage.

Keys are sent per request in an `X-Provider-Key` header and are never written to the backend. The
trade-off is stated in the dialog: anyone with access to the browser can read them, so it is not
for a shared computer.

## Layout

```
src/
  App.jsx              page shell, dialog and menu state
  components/          one component per file, icons kept together
  hooks/               useChat (thread + request), useHealth (status badge),
                       useSettings (keys, memory, persona, theme)
  lib/                 api calls, error wording, markdown parser, providers
                       catalog, settings store, storage
```

The Markdown parser in `src/lib/markdown.js` covers a small, safe subset and
renders to React elements, so model output can never inject markup.

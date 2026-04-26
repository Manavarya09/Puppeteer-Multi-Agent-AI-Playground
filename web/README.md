# Puppeteer Web

Next.js 15 app for the Puppeteer multi-agent playground. See the [root README](../README.md) for
overview and architecture notes.

## Quickstart

```bash
cp .env.local.example .env.local   # add OPENROUTER_API_KEY (or GROQ_API_KEY)
npm install
npm run dev
```

Open http://localhost:3000/playground and submit a task.

## Scripts

| script | what |
| --- | --- |
| `npm run dev` | start the Next.js dev server |
| `npm run build` | production build |
| `npm start` | run the production build |
| `npm run lint` | next lint |

## Architecture in one paragraph

`POST /api/orchestrate` opens an SSE stream. The route handler runs the heuristic policy in
`engine/policy.ts` step-by-step. For each chosen agent it builds a system + user prompt
(`lib/prompts.ts`), calls `streamCompletion()` against OpenRouter or Groq (`lib/llm.ts`), and
forwards `agent_token` events to the browser. The Playground page at
`app/playground/page.tsx` consumes the same `EngineEvent` shape and renders the live graph
plus per-agent traces.

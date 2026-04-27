# Puppeteer — Multi-Agent AI Playground

A web platform where developers, researchers, and business users orchestrate intelligent AI agent
teams to solve complex tasks — powered by dynamic, RL-driven orchestration from the **Puppeteer**
paradigm.

This repo currently contains the **`web/`** Next.js 15 application: marketing pages, the
interactive playground, and a real LLM-backed orchestration API streamed over SSE. There is no
billing, accounts, or hosted backend — bring your own provider key, run locally.

## Stack

- **Next.js 15** (App Router, React 19, TypeScript, Tailwind 3)
- **OpenRouter** as the default LLM router (any of 100+ models)
- **Groq** as an optional low-latency fast path
- **SSE** for streaming agent output token-by-token
- Heuristic policy in `engine/policy.ts` (RL-trained policy is on the roadmap)

## Run it

```bash
cd web
cp .env.local.example .env.local        # add at minimum OPENROUTER_API_KEY
npm install
npm run dev
# open http://localhost:3000/playground
```

### Required env vars

| key | required | notes |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | yes (or Groq) | https://openrouter.ai/keys |
| `GROQ_API_KEY` | optional | https://console.groq.com/keys |
| `DEFAULT_MODEL` | optional | default `openai/gpt-4o-mini` |
| `FAST_MODEL` | optional | Groq model for the fast path |
| `NEXT_PUBLIC_SITE_URL` | optional | sent to OpenRouter as `HTTP-Referer` |

## What's real vs. stubbed

| Layer | Status |
| --- | --- |
| Frontend pages, graph, telemetry | ✅ real |
| Orchestrator policy (heuristic) | ✅ real |
| LLM calls per agent (OpenRouter / Groq) | ✅ real, streaming |
| Reasoning agents (planner, critic, modifier, reflect, concluder) | ✅ real LLM |
| BrowserAgent (Playwright headless chromium) | ✅ real — fetches URLs from task/prior context, extracts page text |
| Other tool agents (python, wolfram, arxiv, bing, data) | ⚠️ simulated by the LLM with a clear "(simulated)" marker — real integrations are TODO |
| RL-learned policy | ❌ heuristic only |
| Auth, billing, persistence | ❌ none — local only |

## Roadmap

- Wire remaining tool integrations: e2b (python), Tavily/Brave (search), arXiv API, Wolfram API
- Persist runs to Postgres (Neon) for replay
- Replace heuristic policy with a small learned policy trained on production traces
- Auth via Clerk (free tier) once accounts are needed



# Store Admin Agent — Implementation

A natural-language AI assistant embedded in an e-commerce admin dashboard. The agent interprets plain-English requests and executes order and product management operations via the store's REST API.

---

## Architecture

```
Browser (Admin UI)
  └─ POST /chat ──→ Agent Service (Express, :3001)
                        └─ Google ADK LlmAgent
                              ├─ OllamaLlm (llama-server, :11435)
                              │    └─ Qwen3 8b (GGUF, llama.cpp)
                              └─ Tool functions
                                    └─ GET/POST/PUT :3000/api
                                              Store Backend
```

**Three processes run concurrently:**

| Service | Port | Description |
|---|---|---|
| Store backend | 3000 | Express API + admin UI (provided) |
| Agent service | 3001 | ADK chat endpoint (implemented) |
| llama-server | 11435 | LLM inference (llama.cpp) |

---

## Setup

### Prerequisites

- Node.js 18+
- Python 3
- macOS: Homebrew
- Linux: `curl`, `unzip` (usually pre-installed)
- Windows: PowerShell 5.1+, `winget` (built into Windows 10 1709+)

### One-time setup

**macOS / Linux**
```bash
./setup.sh
```

**Windows (PowerShell — run as Administrator)**
```powershell
.\setup.ps1
```

This script:
1. Verifies Node.js 18+ (installs via winget on Windows if missing)
2. Installs `llama-server`:
   - macOS: via Homebrew (`llama.cpp`)
   - Linux: downloads the pre-built binary from the latest llama.cpp GitHub release into `./bin/`
   - Windows: downloads `llama-server.exe` from the latest llama.cpp GitHub release into `.\bin\`
3. Downloads the Qwen3 8b model (~5.2 GB) via Ollama
4. Runs `npm install` for both the store backend and agent service

### Start all services

**macOS / Linux**
```bash
./start.sh
```

**Windows**
```powershell
.\start.ps1
```

Then open: **http://localhost:3000/admin**

### Stop all services

**macOS / Linux**
```bash
./stop.sh
```

**Windows**
```powershell
.\stop.ps1
```

---

## Agent capabilities

### Order management

| Tool | Description |
|---|---|
| `list_orders` | List orders, optionally filtered by status |
| `get_order` | Look up a single order by ID or order number (e.g. `ORD-1001`) |
| `update_order_status` | Transition an order to a new status with optional reason |

Valid order statuses: `pending`, `confirmed`, `processing`, `on_hold`, `shipped`, `partially_shipped`, `delivered`, `completed`, `cancelled`, `refunded`, `partially_refunded`

### Product management

| Tool | Description |
|---|---|
| `list_products` | List products with optional keyword search |
| `get_product` | Fetch full product details including variants |
| `update_product` | Update product name and/or description |
| `update_product_price` | Update the price of the default (or specified) variant |

---

## Project structure

```
.
├── server.js              # Store backend entry point (provided)
├── public/admin/          # Admin UI (extended with chat panel)
│   ├── admin.html
│   ├── admin.css
│   └── admin.js
├── agent/                 # Agent service (implemented)
│   ├── src/
│   │   ├── index.ts       # Express server — POST /chat
│   │   ├── agent.ts       # ADK LlmAgent definition
│   │   ├── tools.ts       # Tool handler functions
│   │   ├── ollama-llm.ts  # BaseLlm adapter for llama-server
│   │   ├── api-client.ts  # Typed HTTP client for store API
│   │   └── __tests__/
│   │       ├── tools.test.ts
│   │       └── agent.test.ts
│   ├── package.json
│   └── tsconfig.json
├── setup.sh               # One-time setup (macOS + Linux)
├── setup.ps1              # One-time setup (Windows)
├── start.sh               # Start all three services (macOS + Linux)
├── start.ps1              # Start all three services (Windows)
├── stop.sh                # Stop all three services (macOS + Linux)
└── stop.ps1               # Stop all three services (Windows)
```

---

## Running tests

```bash
cd agent
npm test
```

Tests mock the HTTP client and ADK internals — no running services required.

---

## Design decisions

**Google ADK over raw LLM calls** — ADK's `LlmAgent` handles tool-call/tool-result turns automatically, keeping `index.ts` to a thin HTTP wrapper. The agent loop retries until it produces a final response.

**llama-server over Ollama's native HTTP API** — llama.cpp's OpenAI-compatible `/v1/chat/completions` endpoint is well-specified; Ollama's `/api/chat` format is slightly different. Using llama-server directly avoids an extra translation layer.

**`OllamaLlm` adapter** — ADK is built for Gemini and expects Google's `Content` format internally. The adapter translates ADK's `Content[]` → OpenAI messages and maps Gemini schema types (`"OBJECT"`) to JSON Schema (`"object"`). It also sets `chat_template_kwargs: { thinking: false }` to suppress Qwen3's chain-of-thought reasoning tokens, which would otherwise appear verbatim in responses.

**Session reuse** — The `/chat` endpoint accepts an optional `sessionId` and reuses an existing `InMemorySessionService` session when one is provided, giving the agent multi-turn conversational memory within a browser session.

**Tool-side validation** — Status values and prices are validated in the tool handlers (before the API call) rather than relying on API error messages. This lets the agent return a clear error immediately without a round-trip.

---

## Known limitations

- Sessions are in-memory only — restarting the agent service clears all conversation history.
- The LLM occasionally hallucinates product or order IDs. The system prompt instructs the agent to look up identifiers first, but this isn't enforced mechanically.
- `update_product_price` always targets the default variant when no `variantId` is supplied; there is no tool for listing or selecting non-default variants.
- llama-server startup (~30–60 s on CPU) is the dominant latency at boot. Subsequent inference is faster once the model is loaded.


##Demo Video
https://drive.google.com/file/d/1vGPh93M7yjogCwAZsxSOVMbfmAhTLsyD/view?usp=sharing

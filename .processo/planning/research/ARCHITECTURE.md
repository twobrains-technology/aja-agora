# Architecture Research: Aja Agora

## 1. System Overview

The platform is a layered system where a Next.js frontend communicates with a backend API that orchestrates AI agents. The agents use tools to access administradora data through an adapter layer that abstracts mock/real API implementations.

```
+------------------------------------------------------------------+
|                        USER (Mobile Browser)                      |
+------------------------------------------------------------------+
           |                                        ^
           | HTTP/SSE                               | Streamed chunks
           v                                        | + artifact JSON
+------------------------------------------------------------------+
|                     NEXT.JS APPLICATION                           |
|                                                                   |
|  +------------------+  +-------------------+  +----------------+  |
|  | Landing Page     |  | Chat UI           |  | Artifact       |  |
|  | (hero + CTA)     |  | (message list +   |  | Renderer       |  |
|  |                  |  |  input + stream)   |  | (cards, sims)  |  |
|  +------------------+  +-------------------+  +----------------+  |
|                                                                   |
|  +------------------------------------------------------------+  |
|  |              API Routes (Next.js Route Handlers)            |  |
|  |  POST /api/chat    GET /api/chat/stream    POST /api/lead   |  |
|  +------------------------------------------------------------+  |
+------------------------------------------------------------------+
           |
           v
+------------------------------------------------------------------+
|                    AGENT ORCHESTRATOR                              |
|                                                                   |
|  Uses @anthropic-ai/claude-agent-sdk query() with subagents      |
|                                                                   |
|  +------------------+       +--------------------+                |
|  | Conversational   | ----> | Group Search       |                |
|  | Agent (main)     |       | Agent (subagent)   |                |
|  |                  | ----> +--------------------+                |
|  | Routes intent,   |       +--------------------+                |
|  | manages flow,    | ----> | Financial Analysis |                |
|  | emits artifacts  |       | Agent (subagent)   |                |
|  +------------------+       +--------------------+                |
|                             +--------------------+                |
|                             | Lead Capture       |                |
|                             | Agent (subagent)   |                |
|                             +--------------------+                |
+------------------------------------------------------------------+
           |
           | Tool calls
           v
+------------------------------------------------------------------+
|                    ADAPTER LAYER                                   |
|                                                                   |
|  +-----------------------------------------------------------+   |
|  |           AdministradoraAdapter (interface)                |   |
|  |                                                           |   |
|  |  searchGroups(criteria)     getGroupDetails(id)           |   |
|  |  getRates(groupId)         getAssemblyHistory(groupId)    |   |
|  |  getContemplationStats()   simulateQuota(params)          |   |
|  +-----------------------------------------------------------+   |
|         ^                              ^                          |
|         |                              |                          |
|  +-------------+              +---------------+                   |
|  | MockAdapter |              | BeviAdapter   |                   |
|  | (MVP)       |              | (future)      |                   |
|  +-------------+              +---------------+                   |
+------------------------------------------------------------------+
           |
           v (future)
+------------------------------------------------------------------+
|              EXTERNAL APIs (Bevi Consorcio, others)               |
+------------------------------------------------------------------+
```

### Layer Responsibilities

| Layer | Responsibility | Key Tech |
|-------|---------------|----------|
| Frontend | Chat UI, artifact rendering, streaming display, progressive auth | Next.js, React, shadcn/ui + shadcn/studio Pro, Tailwind |
| API Routes | HTTP endpoints, SSE streaming, session management, rate limiting | Next.js Route Handlers |
| Agent Orchestrator | Conversation logic, intent routing, subagent delegation, tool use | @anthropic-ai/claude-agent-sdk |
| Adapter Layer | Unified interface to administradora data, mock/real swap | TypeScript interfaces + DI |
| External APIs | Real administradora endpoints (future) | REST/SOAP |

---

## 2. Agent Architecture with Anthropic Agent SDK

### SDK Core Concepts

The Claude Agent SDK uses `query()` as the main entry point. It returns an async generator that streams `SDKMessage` objects. Agents are defined declaratively and the SDK handles the agent loop (prompt -> think -> tool use -> response) internally.

```
query({
  prompt: userMessage,
  options: {
    model: "claude-sonnet-4",
    agents: { ... },         // subagent definitions
    allowedTools: [...],     // tools available to main agent
    mcpServers: { ... },     // in-process MCP servers for custom tools
    systemPrompt: "...",     // main agent persona
    maxTurns: 20,            // safety limit
  }
})
  |
  |  returns AsyncGenerator<SDKMessage>
  v
+---------------------------------------------+
|              AGENT LOOP (internal)           |
|                                              |
|  1. Send prompt + system prompt to Claude    |
|  2. Claude responds with text and/or         |
|     tool_use blocks                          |
|  3. SDK executes tool calls                  |
|  4. Results fed back to Claude               |
|  5. Repeat until Claude responds without     |
|     tool calls (or maxTurns reached)         |
+---------------------------------------------+
```

### Agent Definitions for Aja Agora

The main conversational agent handles the user-facing dialogue. It delegates to specialized subagents via the built-in `Agent` tool when it detects specific intents.

```typescript
// src/agents/definitions.ts

import { type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";

export const MAIN_AGENT_PROMPT = `
Voce e o assistente da Aja Agora, plataforma de consorcio inteligente.
Conduza o usuario do sonho a assinatura usando conversa natural.
Quando o usuario expressar interesse em um bem, use o agente de busca.
Quando precisar de analise financeira, delegue ao agente financeiro.
Quando o usuario estiver engajado, colete dados de lead progressivamente.

REGRAS DE ARTEFATOS:
- Entregue artefatos como JSON estruturado dentro de blocos <artifact>.
- Tipos: group_card, comparison_table, simulation_result, lead_form.
- Nunca liste dados tabulares como texto — sempre use artefatos.
`;

export const agents: Record<string, AgentDefinition> = {
  "group-search": {
    description:
      "Busca grupos de consorcio por criterios (valor do bem, prazo, " +
      "parcela maxima, tipo de bem). Use quando o usuario quer encontrar " +
      "opcoes de consorcio.",
    prompt: `Voce e um especialista em busca de grupos de consorcio.
Use as ferramentas disponiveis para buscar grupos que atendam aos
criterios do usuario. Retorne os resultados como artefatos group_card.`,
    tools: ["search_groups", "get_group_details", "get_rates"],
    model: "haiku",
  },

  "financial-analysis": {
    description:
      "Analisa probabilidade de contemplacao, compara opcoes, simula " +
      "cenarios financeiros. Use quando o usuario quer entender custos " +
      "ou comparar alternativas.",
    prompt: `Voce e um analista financeiro especializado em consorcio.
Calcule probabilidades de contemplacao, compare opcoes, e apresente
simulacoes claras. Retorne resultados como simulation_result artifacts.`,
    tools: ["get_assembly_history", "get_contemplation_stats",
            "simulate_quota", "get_rates"],
    model: "sonnet",
  },

  "lead-capture": {
    description:
      "Coleta dados do usuario (nome, telefone, email) de forma " +
      "progressiva e natural. Use quando o usuario demonstrou interesse " +
      "real e esta pronto para avancar.",
    prompt: `Voce coleta dados de contato de forma natural e nao invasiva.
Peca uma informacao por vez. Comece pelo nome, depois telefone, depois
email. Valide cada campo. Retorne um artefato lead_form quando completo.`,
    tools: ["save_lead"],
    model: "haiku",
  },
};
```

### Tool Definitions via MCP Server

Custom tools are defined using `tool()` and served through an in-process MCP server. This keeps tool logic co-located and testable.

```typescript
// src/agents/tools.ts

import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { getAdapter } from "@/adapters";

export const searchGroupsTool = tool(
  "search_groups",
  "Busca grupos de consorcio por criterios",
  {
    asset_type: z.enum(["car", "motorcycle", "property", "services"]),
    max_monthly_payment: z.number().optional(),
    desired_term_months: z.number().optional(),
    asset_value: z.number().optional(),
  },
  async (input) => {
    const adapter = getAdapter();
    const groups = await adapter.searchGroups(input);
    return {
      content: [{ type: "text", text: JSON.stringify(groups) }],
    };
  },
  { annotations: { readOnlyHint: true } }
);

// ... more tool definitions ...

export const toolServer = createSdkMcpServer({
  name: "aja-agora-tools",
  version: "1.0.0",
  tools: [
    searchGroupsTool,
    getGroupDetailsTool,
    getRatesTool,
    getAssemblyHistoryTool,
    getContemplationStatsTool,
    simulateQuotaTool,
    saveLeadTool,
  ],
});
```

### Running the Agent

```typescript
// src/agents/orchestrator.ts

import { query } from "@anthropic-ai/claude-agent-sdk";
import { agents, MAIN_AGENT_PROMPT } from "./definitions";
import { toolServer } from "./tools";

export async function* handleChat(
  userMessage: string,
  conversationId: string,
) {
  for await (const message of query({
    prompt: userMessage,
    options: {
      model: "claude-sonnet-4",
      systemPrompt: MAIN_AGENT_PROMPT,
      allowedTools: ["Agent"],  // main agent delegates everything
      agents,
      mcpServers: {
        "aja-agora-tools": {
          type: "sdk",
          name: "aja-agora-tools",
          instance: toolServer,
        },
      },
      maxTurns: 20,
      resume: conversationId,  // continue conversation
    },
  })) {
    yield message;
  }
}
```

### Important SDK Constraints

| Constraint | Impact | Mitigation |
|-----------|--------|------------|
| Subagents cannot spawn sub-subagents | Max 2 levels deep | Design flat agent hierarchy |
| Subagent context is fresh (no parent history) | Must pass context via prompt | Include relevant info in Agent tool prompt |
| Claude decides when to invoke subagents | May not always delegate | Use explicit naming in prompts when needed |
| Agent tool must be in allowedTools | Easy to forget | Enforce in config validation |
| query() needs ANTHROPIC_API_KEY env var | Server-side only | Never expose to client |

### Alternative: Direct Anthropic SDK (without Agent SDK)

The Claude Agent SDK is designed for code-agent workflows (file editing, bash execution). For a chat product, we may want lighter control. The alternative is using `@anthropic-ai/sdk` directly with the Messages API and manual tool use loop:

```
OPTION A: Claude Agent SDK (query + subagents)
  Pro: Built-in agent loop, subagent delegation, session management
  Con: Designed for code agents, heavier runtime, less control over streaming

OPTION B: Anthropic SDK (messages.create + manual tool loop)
  Pro: Full control over streaming, lighter, designed for product APIs
  Con: Must build agent loop, subagent orchestration, session mgmt manually

RECOMMENDATION: Start with Option B for the chat API layer.
Use the raw Anthropic SDK with messages.stream() for maximum control
over the streaming experience. Implement a lightweight orchestrator
that routes to specialized system prompts + tool sets (not subagents).
Reserve the Agent SDK for future background tasks (assembly monitoring).
```

**Decision needed:** Agent SDK vs raw SDK. See section 10 for trade-offs.

---

## 3. Adapter Pattern for Administradora APIs

### Interface Design

```typescript
// src/adapters/types.ts

export interface GroupSearchCriteria {
  assetType: "car" | "motorcycle" | "property" | "services";
  assetValue?: number;
  maxMonthlyPayment?: number;
  desiredTermMonths?: number;
  region?: string;
}

export interface ConsortiumGroup {
  id: string;
  administradora: string;
  assetType: string;
  creditValue: number;          // valor do credito
  monthlyPayment: number;       // parcela mensal
  termMonths: number;           // prazo em meses
  adminFeePercent: number;      // taxa de administracao %
  reserveFundPercent: number;   // fundo de reserva %
  insurancePercent: number;     // seguro %
  totalCostPercent: number;     // custo total %
  groupNumber: string;
  totalSlots: number;
  filledSlots: number;
  nextAssemblyDate: string;
  status: "open" | "forming" | "closed";
}

export interface AssemblyRecord {
  date: string;
  groupNumber: string;
  contemplatedByDraw: number;
  contemplatedByBid: number;
  lowestBidPercent: number;
  highestBidPercent: number;
  averageBidPercent: number;
}

export interface QuotaSimulation {
  creditValue: number;
  monthlyPayment: number;
  termMonths: number;
  totalPaid: number;
  totalCostPercent: number;
  contemplationProbability: {
    by6Months: number;
    by12Months: number;
    by24Months: number;
    byEnd: number;
  };
}

export interface AdministradoraAdapter {
  readonly name: string;

  searchGroups(criteria: GroupSearchCriteria): Promise<ConsortiumGroup[]>;
  getGroupDetails(groupId: string): Promise<ConsortiumGroup | null>;
  getRates(groupId: string): Promise<{
    adminFee: number;
    reserveFund: number;
    insurance: number;
  }>;
  getAssemblyHistory(
    groupId: string,
    months?: number,
  ): Promise<AssemblyRecord[]>;
  getContemplationStats(groupId: string): Promise<{
    avgMonthsToContemplation: number;
    contemplationRate: number;
    avgBidPercent: number;
  }>;
  simulateQuota(params: {
    creditValue: number;
    termMonths: number;
    bidPercent?: number;
  }): Promise<QuotaSimulation>;
}
```

### Mock Adapter (MVP)

```typescript
// src/adapters/mock/index.ts

import type { AdministradoraAdapter } from "../types";
import { mockGroups } from "./data";

export class MockBeviAdapter implements AdministradoraAdapter {
  readonly name = "Bevi Consorcio (Mock)";

  async searchGroups(criteria) {
    // Filter mock data by criteria
    return mockGroups.filter(g => {
      if (criteria.assetType && g.assetType !== criteria.assetType) return false;
      if (criteria.maxMonthlyPayment && g.monthlyPayment > criteria.maxMonthlyPayment) return false;
      // ... more filters
      return true;
    });
  }

  async getGroupDetails(groupId) {
    return mockGroups.find(g => g.id === groupId) ?? null;
  }

  // ... implement all interface methods with mock data
}
```

### Adapter Registry and Factory

```typescript
// src/adapters/index.ts

import type { AdministradoraAdapter } from "./types";
import { MockBeviAdapter } from "./mock";
// import { BeviAdapter } from "./bevi";  // future

const adapters: Record<string, () => AdministradoraAdapter> = {
  "bevi-mock": () => new MockBeviAdapter(),
  // "bevi": () => new BeviAdapter(process.env.BEVI_API_KEY!),  // future
};

let currentAdapter: AdministradoraAdapter | null = null;

export function getAdapter(): AdministradoraAdapter {
  if (!currentAdapter) {
    const adapterName = process.env.ADMINISTRADORA_ADAPTER ?? "bevi-mock";
    const factory = adapters[adapterName];
    if (!factory) throw new Error(`Unknown adapter: ${adapterName}`);
    currentAdapter = factory();
  }
  return currentAdapter;
}
```

### Swap Strategy

```
Environment Variable: ADMINISTRADORA_ADAPTER

  "bevi-mock"  -->  MockBeviAdapter (static data, zero latency)
  "bevi"       -->  BeviAdapter (real API calls)
  "multi"      -->  MultiAdapter (aggregates multiple administradoras)

MVP ships with bevi-mock. Switching to real:
  1. Implement BeviAdapter with same interface
  2. Set ADMINISTRADORA_ADAPTER=bevi in production
  3. No other code changes needed
```

---

## 4. Chat Data Flow

### Complete Message Flow

```
USER types: "Quero comprar um carro de R$ 50 mil em 2 anos, parcela até R$ 800"
  |
  | 1. Client sends POST /api/chat
  |    Body: { message: "...", conversationId: "conv_abc123" }
  v
+------------------------------------------------------------------+
| API ROUTE: POST /api/chat                                         |
|                                                                   |
| 2. Load conversation history from DB                              |
| 3. Append user message to history                                 |
| 4. Call orchestrator.handleChat(message, history)                  |
| 5. Return SSE stream (ReadableStream)                             |
+------------------------------------------------------------------+
  |
  | 6. Orchestrator calls Anthropic API with:
  |    - System prompt (conversational agent)
  |    - Conversation history (messages array)
  |    - Tool definitions (search_groups, simulate, etc.)
  v
+------------------------------------------------------------------+
| ANTHROPIC API                                                     |
|                                                                   |
| 7. Claude analyzes intent:                                        |
|    "User wants car, R$50k, 24 months, max R$800/month"           |
|                                                                   |
| 8. Claude emits tool_use: search_groups({                         |
|      assetType: "car",                                            |
|      assetValue: 50000,                                           |
|      desiredTermMonths: 24,                                       |
|      maxMonthlyPayment: 800                                       |
|    })                                                             |
+------------------------------------------------------------------+
  |
  | 9. Orchestrator intercepts tool_use, executes tool
  v
+------------------------------------------------------------------+
| TOOL EXECUTION                                                    |
|                                                                   |
| 10. searchGroupsTool calls adapter.searchGroups(criteria)         |
| 11. MockBeviAdapter returns 3 matching groups                     |
| 12. Tool result sent back to Claude                               |
+------------------------------------------------------------------+
  |
  | 13. Claude receives results, formulates response
  v
+------------------------------------------------------------------+
| CLAUDE RESPONSE (streamed)                                        |
|                                                                   |
| 14. Text: "Encontrei 3 opcoes otimas pra voce!"                 |
|                                                                   |
| 15. Artifact (embedded in response):                              |
|     <artifact type="group_card" data='{                           |
|       "groups": [                                                 |
|         { "id": "g1", "credit": 52000, "payment": 780, ... },    |
|         { "id": "g2", "credit": 50000, "payment": 720, ... },    |
|         { "id": "g3", "credit": 55000, "payment": 795, ... }     |
|       ]                                                           |
|     }' />                                                         |
|                                                                   |
| 16. Text: "Qual dessas te interessa mais? Posso simular..."      |
+------------------------------------------------------------------+
  |
  | 17. SSE chunks streamed to client
  v
+------------------------------------------------------------------+
| CLIENT RENDERING                                                  |
|                                                                   |
| 18. Text chunks -> render as chat bubbles (streaming)             |
| 19. Artifact JSON -> detect <artifact> tags, parse, render as     |
|     interactive React components (GroupCard, ComparisonTable...)   |
| 20. User clicks "Ver detalhes" on group_card                     |
| 21. Client sends new message: "Quero ver detalhes do grupo g2"   |
| 22. Flow repeats from step 1                                      |
+------------------------------------------------------------------+
```

### Artifact Interaction Flow

```
User clicks artifact button (e.g., "Simular" on a group card)
  |
  v
Client generates a synthetic user message based on button action:
  "Simular contemplacao para o grupo g2 com lance de 20%"
  |
  v
Same chat flow as above — message sent to API, processed by agent,
agent uses simulate_quota tool, returns simulation_result artifact.

KEY INSIGHT: Artifacts are not separate API calls.
They are user messages that trigger agent tool use.
The UI translates button clicks into natural language messages.
```

---

## 5. Streaming Architecture

### SSE (Server-Sent Events) Strategy

SSE is the right choice over WebSockets for this use case because:
- Unidirectional (server -> client) is sufficient for streaming AI responses
- Native browser support via EventSource
- Works through proxies and CDNs without special config
- Automatic reconnection built into the browser API
- Simpler than WebSocket for the predominant pattern (stream a response)

User messages are sent via regular POST requests. Only the response is streamed.

### Stream Format

```
POST /api/chat
  Content-Type: application/json
  Body: { "message": "...", "conversationId": "..." }

Response:
  Content-Type: text/event-stream

  event: text
  data: {"content": "Encontrei "}

  event: text
  data: {"content": "3 opcoes "}

  event: text
  data: {"content": "otimas pra voce!"}

  event: artifact
  data: {"type": "group_card", "data": {...}}

  event: text
  data: {"content": "\n\nQual dessas te interessa?"}

  event: tool_start
  data: {"tool": "search_groups", "id": "tool_1"}

  event: tool_end
  data: {"tool": "search_groups", "id": "tool_1"}

  event: done
  data: {"messageId": "msg_xyz", "usage": {"input": 1200, "output": 450}}
```

### Server-Side Streaming Implementation

```typescript
// src/app/api/chat/route.ts

import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAdapter } from "@/adapters";
import { tools, executeToolCall } from "@/agents/tools";
import { buildSystemPrompt } from "@/agents/prompts";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const { message, conversationId } = await req.json();

  // Load history
  const history = await db.getMessages(conversationId);
  history.push({ role: "user", content: message });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: any) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        await runAgentLoop(history, send);
      } finally {
        send("done", { messageId: "..." });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

### Client-Side Stream Consumption

```typescript
// src/hooks/useChat.ts

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const sendMessage = async (text: string) => {
    // Optimistic UI update
    setMessages(prev => [...prev, { role: "user", content: text }]);
    setIsStreaming(true);

    const response = await fetch("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message: text, conversationId }),
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let currentAssistantMsg = { role: "assistant", content: "", artifacts: [] };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop()!;  // keep incomplete line

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          const eventType = line.slice(7);
          // next line is data
          continue;
        }
        if (line.startsWith("data: ")) {
          const data = JSON.parse(line.slice(6));
          switch (eventType) {
            case "text":
              currentAssistantMsg.content += data.content;
              break;
            case "artifact":
              currentAssistantMsg.artifacts.push(data);
              break;
          }
          // Trigger re-render
          setMessages(prev => [...prev.slice(0, -1), { ...currentAssistantMsg }]);
        }
      }
    }

    setIsStreaming(false);
  };

  return { messages, sendMessage, isStreaming };
}
```

### Artifact Extraction from Claude Response

Claude does not natively output `<artifact>` tags. We instruct it in the system prompt to output structured JSON for artifacts, then parse them server-side before streaming to the client.

```
TWO OPTIONS for artifact delivery:

OPTION A: Tool-result artifacts
  Claude calls a tool like "present_groups". The tool handler formats
  the result and the server emits an "artifact" SSE event.
  Pro: Clean separation, tool results are structured by definition.
  Con: Extra round-trip in the agent loop.

OPTION B: Inline JSON in text response
  Claude outputs JSON blocks in its text. Server-side parser detects
  and extracts them, emitting separate "artifact" events.
  Pro: No extra round-trip, feels more natural in the flow.
  Con: Fragile parsing, Claude may format inconsistently.

RECOMMENDATION: Option A (tool-result artifacts).
Define "presentation tools" like present_group_cards, present_simulation,
present_comparison. Claude calls them to render artifacts. The tool
handler returns structured data AND emits an SSE artifact event.
This is reliable and structured.
```

---

## 6. Project Structure

```
aja-agora/
|
|-- src/
|   |-- app/                          # Next.js App Router
|   |   |-- layout.tsx                # Root layout (fonts, metadata)
|   |   |-- page.tsx                  # Landing page
|   |   |-- chat/
|   |   |   |-- page.tsx              # Chat page
|   |   |   +-- layout.tsx            # Chat layout (full-screen)
|   |   +-- api/
|   |       |-- chat/
|   |       |   +-- route.ts          # POST: send message, stream response
|   |       +-- lead/
|   |           +-- route.ts          # POST: save/update lead
|   |
|   |-- components/
|   |   |-- ui/                       # shadcn/ui primitives
|   |   |-- landing/                  # Landing page components
|   |   |   |-- Hero.tsx
|   |   |   |-- Features.tsx
|   |   |   +-- CTA.tsx
|   |   |-- chat/                     # Chat interface components
|   |   |   |-- ChatContainer.tsx     # Main chat wrapper
|   |   |   |-- MessageList.tsx       # Scrollable message list
|   |   |   |-- MessageBubble.tsx     # Single message (text + artifacts)
|   |   |   |-- ChatInput.tsx         # Text input + send button
|   |   |   +-- StreamingIndicator.tsx
|   |   +-- artifacts/                # Artifact renderers
|   |       |-- ArtifactRenderer.tsx  # Routes artifact type to component
|   |       |-- GroupCard.tsx         # Consortium group card
|   |       |-- ComparisonTable.tsx   # Side-by-side comparison
|   |       |-- SimulationResult.tsx  # Financial simulation display
|   |       |-- LeadForm.tsx          # Progressive data collection
|   |       +-- types.ts             # Artifact type definitions
|   |
|   |-- agents/                       # Agent layer (server-only)
|   |   |-- orchestrator.ts           # Main agent loop
|   |   |-- prompts.ts                # System prompts for all agents
|   |   |-- tools/                    # Tool definitions
|   |   |   |-- index.ts              # Tool registry
|   |   |   |-- search.ts             # Group search tools
|   |   |   |-- analysis.ts           # Financial analysis tools
|   |   |   |-- presentation.ts       # Artifact presentation tools
|   |   |   +-- lead.ts               # Lead capture tools
|   |   +-- types.ts                  # Agent-related types
|   |
|   |-- adapters/                     # Administradora adapter layer
|   |   |-- types.ts                  # AdministradoraAdapter interface
|   |   |-- index.ts                  # Adapter factory/registry
|   |   |-- mock/                     # Mock adapter (MVP)
|   |   |   |-- index.ts              # MockBeviAdapter implementation
|   |   |   +-- data.ts               # Static mock data
|   |   +-- bevi/                     # Real Bevi adapter (future)
|   |       +-- index.ts
|   |
|   |-- lib/                          # Shared utilities
|   |   |-- db.ts                     # Database client
|   |   |-- auth.ts                   # Progressive auth helpers
|   |   |-- stream.ts                 # SSE streaming utilities
|   |   +-- utils.ts                  # General utilities
|   |
|   |-- hooks/                        # React hooks
|   |   |-- useChat.ts                # Chat state + streaming
|   |   +-- useArtifact.ts            # Artifact interaction
|   |
|   +-- styles/
|       +-- globals.css               # Tailwind + custom styles
|
|-- public/                           # Static assets
|-- prisma/                           # Database schema
|   +-- schema.prisma
|
|-- docker/
|   |-- Dockerfile
|   +-- docker-compose.yml
|
|-- .env.example
|-- .env.local                        # (gitignored)
|-- next.config.ts
|-- tailwind.config.ts
|-- tsconfig.json
+-- package.json
```

### Key Boundaries

```
CLIENT-ONLY (browser):
  src/components/*, src/hooks/*, src/app/**/page.tsx

SERVER-ONLY (Node.js runtime):
  src/agents/*, src/adapters/*, src/app/api/*, src/lib/db.ts

SHARED:
  src/components/artifacts/types.ts (artifact type definitions)
  src/lib/utils.ts
```

Server-only modules must never be imported from client components. Next.js will error at build time if this boundary is violated, but use the `"server-only"` package for explicit enforcement:

```typescript
// src/agents/orchestrator.ts
import "server-only";
```

---

## 7. State Management

### Three State Domains

```
+--------------------+  +--------------------+  +--------------------+
|    UI STATE         |  |  CONVERSATION      |  |  AGENT STATE       |
|    (client)         |  |  STATE (server)    |  |  (server, ephemeral)|
|                     |  |                    |  |                    |
| - isStreaming       |  | - messages[]       |  | - current tool     |
| - inputText        |  | - conversationId   |  | - pending tool     |
| - selectedArtifact |  | - leadData         |  |   results          |
| - scrollPosition   |  | - createdAt        |  | - agent turn count |
| - mobileMenuOpen   |  | - lastMessageAt    |  | - token usage      |
+--------------------+  +--------------------+  +--------------------+
       |                        |                        |
       |  React useState/      |  Database (Prisma)     |  In-memory
       |  useReducer           |                        |  per-request
       |                       |                        |
       +-------<-- SSE --------+-------- feeds -------->+
```

### UI State (Client)

Minimal. Use React `useState` for local UI concerns. No global state manager (Redux, Zustand) needed for MVP.

```typescript
// Chat page state
const [messages, setMessages] = useState<Message[]>([]);
const [isStreaming, setIsStreaming] = useState(false);
const [inputText, setInputText] = useState("");
```

### Conversation State (Server/Database)

The conversation is the source of truth. Messages are stored in the database and loaded when the user reconnects.

```typescript
// Simplified conversation state flow
//
// 1. User opens chat -> create conversation (or resume from localStorage ID)
// 2. User sends message -> save to DB, stream to agent
// 3. Agent responds -> save response to DB, stream to client
// 4. User returns later -> load messages from DB by conversationId
```

### Agent State (Ephemeral)

Agent state exists only during a request. No persistent agent state between messages. Each message triggers a fresh agent call with full conversation history.

This is intentional: stateless agents are simpler to scale, debug, and reason about. The trade-off is that conversation history grows linearly and costs more tokens over time.

```
Message 1:  [system] + [user_1] -> agent -> [assistant_1]
Message 2:  [system] + [user_1, assistant_1, user_2] -> agent -> [assistant_2]
Message 3:  [system] + [user_1, assistant_1, user_2, assistant_2, user_3] -> agent -> [assistant_3]
...
Message N:  Context window fills up -> need summarization or truncation
```

### Context Window Management

With Claude Sonnet at 200k tokens, a typical consorcio conversation (20-30 turns) will use ~15-25k tokens. Unlikely to hit limits in MVP, but plan for it:

```
STRATEGY: Sliding window with summary

When conversation exceeds 100k tokens:
  1. Summarize messages 1..N-10 into a single summary message
  2. Keep last 10 messages verbatim
  3. Prepend summary to history

This preserves recent context while keeping costs bounded.
```

---

## 8. Database Schema Considerations

### Prisma Schema

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Conversation {
  id            String    @id @default(cuid())
  leadId        String?
  lead          Lead?     @relation(fields: [leadId], references: [id])
  messages      Message[]
  createdAt     DateTime  @default(now())
  lastMessageAt DateTime  @default(now())
  metadata      Json?     // agent-specific metadata (token usage, etc.)

  @@index([leadId])
  @@index([lastMessageAt])
}

model Message {
  id              String       @id @default(cuid())
  conversationId  String
  conversation    Conversation @relation(fields: [conversationId], references: [id])
  role            String       // "user" | "assistant" | "system"
  content         String       // text content
  artifacts       Json?        // artifact data (type + payload)
  toolCalls       Json?        // tool calls made during this message
  tokenUsage      Json?        // { input: number, output: number }
  createdAt       DateTime     @default(now())

  @@index([conversationId, createdAt])
}

model Lead {
  id            String         @id @default(cuid())
  name          String?
  phone         String?
  email         String?
  status        String         @default("anonymous") // anonymous -> partial -> complete
  conversations Conversation[]
  interests     LeadInterest[]
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt

  @@index([email])
  @@index([phone])
  @@index([status])
}

model LeadInterest {
  id          String   @id @default(cuid())
  leadId      String
  lead        Lead     @relation(fields: [leadId], references: [id])
  assetType   String   // "car", "property", etc.
  assetValue  Float?
  termMonths  Int?
  maxPayment  Float?
  groupId     String?  // if they selected a specific group
  createdAt   DateTime @default(now())

  @@index([leadId])
}
```

### Key Design Decisions

```
1. CONVERSATIONS ARE ANONYMOUS BY DEFAULT
   A conversation starts without a lead. When the user provides their
   name/phone/email, a Lead is created and linked to the conversation.
   This supports progressive auth.

2. ARTIFACTS ARE STORED AS JSON IN MESSAGES
   Not normalized into separate tables. Artifacts are tightly coupled
   to the message that generated them. Querying artifacts across
   conversations is not a MVP use case.

3. TOOL CALLS ARE LOGGED
   For debugging and analytics. Which tools are called most? Which
   fail? This data is invaluable for improving the agent.

4. TOKEN USAGE IS TRACKED PER MESSAGE
   For cost monitoring. Each message records how many tokens it consumed.
   Aggregate by day/week to track spending.

5. LEAD INTERESTS CAPTURE INTENT
   When the agent detects interest in a specific asset type/value,
   it saves a LeadInterest record. This feeds future CRM features
   and allows re-engagement ("we found a new group matching your
   interest in a R$50k car").
```

### SQLite vs PostgreSQL

```
MVP:        SQLite (simpler, no separate process, good enough for <1000 users)
Production: PostgreSQL (concurrent writes, JSON operators, full-text search)

Prisma makes switching trivial — change datasource.provider and migrate.
Start with SQLite to move fast, switch when traffic justifies it.
```

---

## 9. Scaling Considerations

### What Breaks First

```
BOTTLENECK ANALYSIS (in order of likelihood):

1. ANTHROPIC API RATE LIMITS  <-- breaks first
   Claude API has rate limits per minute and per day.
   A single user conversation is fine.
   100 concurrent users = 100 parallel API calls = likely rate limited.
   
   Mitigation:
   - Request higher rate limits from Anthropic
   - Queue system for non-urgent requests
   - Use Haiku for simple intents, Sonnet for complex analysis
   - Cache common queries (same group search = same results)

2. SSE CONNECTION LIMITS
   Each active chat holds an open HTTP connection.
   Node.js handles ~10k concurrent connections well.
   But reverse proxies (Nginx) default to low limits.
   
   Mitigation:
   - Configure Nginx: proxy_read_timeout, proxy_buffering off
   - Monitor active connection count
   - Implement heartbeat to detect stale connections

3. DATABASE WRITE VOLUME
   Each message = 1 INSERT. Each conversation = 10-30 INSERTs.
   SQLite can handle ~50 concurrent writers before lock contention.
   
   Mitigation:
   - Switch to PostgreSQL when concurrent users > 50
   - Batch non-critical writes (token usage, metadata)

4. TOKEN COSTS
   Not a scaling issue, but a budget issue.
   Sonnet 4 @ ~$3/M input, ~$15/M output tokens.
   A 20-turn conversation uses ~20-30k tokens = ~$0.10-0.50.
   1000 conversations/day = $100-500/day.
   
   Mitigation:
   - Use Haiku for simple routing/classification
   - Cache adapter results aggressively
   - Implement conversation summarization to reduce history size
   - Monitor cost per conversation, set alerts

5. MOCK -> REAL API TRANSITION
   Mock adapter has zero latency. Real API will add 200-2000ms per call.
   Agent may make 2-3 tool calls per turn = 0.5-6s extra latency.
   Combined with Claude API latency = user waits 5-10s.
   
   Mitigation:
   - Parallel tool calls where possible
   - Cache real API responses (groups don't change hourly)
   - Show streaming text while tools execute in background
```

### Scaling Architecture for Later

```
MVP (Phase 1):
  Single Next.js process, SQLite, single VPS

Growth (Phase 2):
  PostgreSQL, Redis for caching, 2 VPS behind load balancer

Scale (Phase 3):
  +--------------------+
  |   Load Balancer    |
  +--------------------+
       |           |
  +--------+  +--------+
  | Web 1  |  | Web 2  |   Next.js (stateless, SSE)
  +--------+  +--------+
       |           |
  +--------------------+
  |      Redis         |   Session affinity, cache, rate limiting
  +--------------------+
       |
  +--------------------+
  |   PostgreSQL       |   Conversations, leads, messages
  +--------------------+
       |
  +--------------------+
  |   Worker Queue     |   Background tasks (assembly monitoring,
  |   (BullMQ/Redis)   |   email notifications, analytics)
  +--------------------+
```

---

## 10. Anti-Patterns to Avoid

### 1. Context Dumping

**Anti-pattern:** Putting entire adapter responses (50 groups with all fields) directly into the conversation history. Every subsequent turn drags this data along, inflating costs and risking context window overflow.

**Solution:** Return summaries to the agent. Store full data server-side, referenced by ID. The agent sees "3 groups found matching criteria" with key fields only, not every field of every group.

### 2. Agent as Business Process Engine

**Anti-pattern:** Encoding the entire sales funnel as rigid agent instructions ("first ask about asset type, then ask about budget, then show groups, then ask for lead data"). This makes the agent robotic and brittle.

**Solution:** Give the agent goals and constraints, not scripts. "Your goal is to help the user find and commit to a consorcio group. Collect lead data when the user is engaged." Let Claude's natural conversation ability handle the flow.

### 3. Over-Engineering the Agent Hierarchy

**Anti-pattern:** 8 specialized agents with complex handoff logic, routing agents, meta-agents. Subagents have overhead (fresh context, no parent history, extra API calls).

**Solution:** Start with a single agent that has multiple tools. Add subagents only when you prove a tool set is too large for one agent's context, or when you need genuine isolation (e.g., financial analysis should not accidentally modify lead data).

### 4. Streaming Text Without Structure

**Anti-pattern:** Streaming raw text and hoping the client can parse artifacts from it. Claude's formatting will be inconsistent. Regex parsing of streamed text is fragile.

**Solution:** Use tool-based artifact generation. When Claude needs to show data, it calls a presentation tool. The tool emits a structured SSE event. The client renders the typed artifact component. Text is just text, artifacts are just data.

### 5. Stateful Agent Processes

**Anti-pattern:** Keeping an agent process running between user messages, holding conversation state in memory. This breaks on server restart, requires sticky sessions, and wastes resources.

**Solution:** Stateless request handling. Each message sends full conversation history to Claude. Agent state is reconstructed from the database on each request. The server is stateless and horizontally scalable.

### 6. Ignoring Progressive Auth Timing

**Anti-pattern:** Asking for name/email/phone on the first message or after every response. This kills engagement. Also: asking for all data at once instead of progressively.

**Solution:** Let the agent detect engagement signals (user asked detailed questions, compared options, expressed preference). Only then trigger lead capture, one field at a time. Store partial lead data — a phone number alone is valuable.

### 7. Not Caching Adapter Results

**Anti-pattern:** Every search_groups call hits the adapter (and eventually the real API), even for identical queries made 5 minutes apart.

**Solution:** Cache adapter results with reasonable TTLs. Group listings change daily, not per-second. Assembly history changes after each assembly. Cache at the adapter layer, not the agent layer, so all agents benefit.

```typescript
// src/adapters/cached.ts
export class CachedAdapter implements AdministradoraAdapter {
  constructor(
    private inner: AdministradoraAdapter,
    private cache: Map<string, { data: any; expiresAt: number }>,
    private ttlMs: number = 5 * 60 * 1000  // 5 min default
  ) {}

  async searchGroups(criteria: GroupSearchCriteria) {
    const key = `search:${JSON.stringify(criteria)}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    const result = await this.inner.searchGroups(criteria);
    this.cache.set(key, { data: result, expiresAt: Date.now() + this.ttlMs });
    return result;
  }
  // ... wrap all methods
}
```

### 8. Building a Chat UI Without Optimistic Updates

**Anti-pattern:** User sends message, sees loading spinner for 3-5 seconds until Claude starts responding. Feels broken on mobile.

**Solution:** Immediately render the user's message in the chat. Show a typing indicator. Start streaming the response as soon as the first token arrives. The user sees their message instantly and the response materializing word by word.

### 9. Monolithic System Prompt

**Anti-pattern:** A 5000-token system prompt that covers every possible scenario, every edge case, every formatting rule. Wastes input tokens on every single message.

**Solution:** Modular prompts assembled per-request. Base persona (200 tokens) + relevant context (current conversation stage, available groups, lead status). Total prompt stays under 1000 tokens for most turns.

### 10. Not Tracking Token Costs Per Conversation

**Anti-pattern:** Deploying without cost monitoring. One runaway conversation (user sending walls of text, agent stuck in tool loops) can burn through daily budget.

**Solution:** Track tokens per message, per conversation, per day. Set `maxTurns` on the agent to prevent infinite loops. Alert when a single conversation exceeds cost threshold. Log everything.

---

## Key Open Decisions

| # | Decision | Options | Recommendation | Status |
|---|----------|---------|----------------|--------|
| 1 | Agent SDK vs raw Anthropic SDK | Agent SDK (query + subagents) vs Messages API with manual loop | Raw SDK for chat, Agent SDK for background tasks | Pending |
| 2 | Database for MVP | SQLite vs PostgreSQL | SQLite (simpler, switch later) | Pending |
| 3 | Artifact delivery mechanism | Tool-result artifacts vs inline JSON parsing | Tool-result artifacts | Pending |
| 4 | Chat endpoint pattern | SSE streaming vs WebSocket | SSE (simpler, sufficient) | Pending |
| 5 | State management | Stateless per-request vs persistent agent sessions | Stateless per-request | Pending |
| 6 | Prompt engineering approach | Single mega-prompt vs modular composable prompts | Modular composable | Pending |

---

*Researched: 2026-04-11*
*Sources: Anthropic Agent SDK docs, Anthropic building-effective-agents guide, Vercel AI SDK patterns, industry anti-pattern literature*

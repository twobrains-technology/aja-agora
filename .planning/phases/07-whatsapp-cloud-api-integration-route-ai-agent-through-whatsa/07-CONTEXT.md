# Phase 7: WhatsApp Cloud API integration — Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Integrate the AI consórcio agent with WhatsApp Cloud API so users can have the same conversational experience via WhatsApp as they do on the web chat. The webhook endpoint already exists (`/api/webhook/whatsapp`) and receives messages. This phase connects the AI pipeline (streamText + consorcioTools) to WhatsApp and maps web artifacts to WhatsApp native components.

**In scope:**
- Route incoming WhatsApp text messages to the AI agent (same streamText pipeline)
- Send AI responses back via WhatsApp Cloud API
- Map presentation artifacts to WhatsApp native components (interactive messages, buttons, lists)
- Session management per phone number (conversation continuity)
- Message persistence in the same DB schema (conversations + messages tables)
- Handle WhatsApp-specific message types (interactive replies, button clicks)

**Out of scope:**
- Template messages / marketing campaigns
- WhatsApp Business catalog integration
- Media message handling (images, audio, video)
- WhatsApp Flows
- Payment integration via WhatsApp

</domain>

<decisions>
## Implementation Decisions

### Artifact → WhatsApp Component Mapping
- GroupCard → Interactive message with reply buttons ("Ver detalhes", "Simular")
- ComparisonTable → Interactive list message (up to 10 items with sections)
- ValuePicker → Text message with suggested values + reply buttons for quick options (WhatsApp has no slider — degrade gracefully)
- SimulationResult → Text message formatted with line breaks (structured text)
- RecommendationCard → Interactive message with CTA button ("Tenho interesse")
- LeadForm → Sequential text prompts (WhatsApp has no inline forms — ask name, then phone, then email one at a time)

### Session Management
- Map phone number (wa_id) to conversation ID in the DB
- Create new conversation on first message from a new number
- Resume existing conversation for returning numbers
- Store wa_id in a new field on the conversations table

### Message Flow Architecture
- Webhook receives message → looks up/creates conversation → builds message history from DB → calls streamText → processes fullStream → sends responses via WhatsApp Cloud API
- Non-blocking: return 200 immediately, process AI in background
- Queue-based for reliability (process after 200 response)

### Response Format
- WhatsApp has 4096 char limit per message — split long responses
- Use WhatsApp markdown (bold, italic, monospace) — not full Markdown
- Emojis OK (WhatsApp native)

### Claude's Discretion
- Error handling and retry strategy for WhatsApp API failures
- Rate limiting per phone number
- Message deduplication (WhatsApp may retry delivery)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/app/api/webhook/whatsapp/route.ts` — Webhook already receiving messages, signature validation, sendWhatsAppMessage helper
- `src/lib/agent/tools/ai-sdk.ts` — All 12 tools in AI SDK format (consorcioTools + PRESENTATION_TOOLS set)
- `src/lib/agent/system-prompt.ts` — System prompt (needs WhatsApp-specific variant)
- `src/app/api/chat/route.ts` — Web chat route using streamText (reference implementation)
- `src/lib/chat/types.ts` — Artifact types and payload interfaces
- `src/db/schema.ts` — conversations, messages, artifacts, leads tables

### Established Patterns
- streamText + consorcioTools + stopWhen(stepCountIs(10)) for AI orchestration
- Artifact detection via PRESENTATION_TOOLS set on tool-call events in fullStream
- SSE custom events for web (WhatsApp will use equivalent via Cloud API messages)
- Adapter pattern for administradora data access

### Integration Points
- Webhook POST handler → new WhatsApp agent processor
- conversations table → add wa_id field for phone number mapping
- messages table → same schema, different source channel
- sendWhatsAppMessage helper → enhanced with interactive message support

</code_context>

<specifics>
## Specific Ideas

- The webhook already handles text, interactive, image, audio, video, location, sticker messages — only text and interactive need AI routing for now
- WhatsApp interactive messages support: reply buttons (up to 3), list messages (up to 10 rows), CTA URL buttons
- The system prompt needs a WhatsApp variant that tells Claude to keep responses shorter and not use Markdown heading syntax
- LeadForm capture should work as a multi-step text conversation (ask name → ask phone → ask email → captureLead tool)
- ValuePicker degradation: send a text description with reply buttons for common presets (e.g., "R$ 50k", "R$ 100k", "R$ 200k", "R$ 500k")

</specifics>

<deferred>
## Deferred Ideas

- WhatsApp template messages for proactive outreach (requires separate approval flow)
- Rich media responses (PDF with simulation details, images of properties)
- WhatsApp Flows for complex form input
- Multi-language support
- Voice message transcription → AI routing

</deferred>

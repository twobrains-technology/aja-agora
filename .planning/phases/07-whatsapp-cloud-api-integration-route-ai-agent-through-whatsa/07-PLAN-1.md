# Plan 1: WhatsApp Agent Processor & Session Management

## Scope
Create the core processor that routes WhatsApp messages to the AI pipeline and manages sessions per phone number.

## Files to Create/Modify

### New: `src/lib/whatsapp/processor.ts`
- processIncomingMessage(from, text, phoneNumberId) → void
- Lookup or create conversation by wa_id (phone number)
- Build message history from DB
- Call streamText with consorcioTools (same pipeline as web chat)
- Process fullStream: accumulate text, detect artifacts via PRESENTATION_TOOLS
- Send responses via WhatsApp Cloud API (text + interactive messages)
- Save messages to DB (same schema as web)

### New: `src/lib/whatsapp/session.ts`
- getOrCreateConversation(waId: string) → conversationId
- Query conversations table by wa_id field
- Create new conversation if not found, with wa_id set

### New: `src/lib/whatsapp/formatter.ts`
- formatTextForWhatsApp(text: string) → string (convert Markdown → WhatsApp formatting)
- splitMessage(text: string, maxLen: 4096) → string[]
- artifactToWhatsApp(type, payload) → WhatsApp interactive message payload
  - group_card → reply buttons
  - comparison_table → list message
  - value_picker → reply buttons with presets
  - simulation_result → formatted text
  - recommendation_card → CTA button
  - lead_form → trigger multi-step text flow

### New: `src/lib/whatsapp/api.ts`
- sendTextMessage(phoneNumberId, to, text) → void
- sendInteractiveMessage(phoneNumberId, to, interactive) → void
- sendReplyButtons(phoneNumberId, to, body, buttons[]) → void
- sendListMessage(phoneNumberId, to, body, sections[]) → void
- markAsRead(phoneNumberId, messageId) → void

### Modify: `src/app/api/webhook/whatsapp/route.ts`
- Import processor, call processIncomingMessage for text messages
- Handle interactive replies (button_reply, list_reply) → route back to AI
- Return 200 immediately, process async

### Modify: `src/db/schema.ts`
- Add `waId` field to conversations table (nullable, indexed)
- Add `channel` field to messages table ('web' | 'whatsapp')

### Modify: `src/lib/agent/system-prompt.ts`
- Export WHATSAPP_SYSTEM_PROMPT variant (shorter, no Markdown headings, WhatsApp-appropriate)

## Verification
- Send text message → AI responds via WhatsApp
- Artifacts render as interactive messages
- Conversation persists across messages from same number
- Messages saved to DB with channel='whatsapp'

---
id: FIX-122
titulo: "WhatsApp: handler de upload de documento inbound (webhook ignora mídia)"
status: todo
severidade: alta
bloco: bloco-entrada-welcome-upload
arquivos: [src/app/api/webhook/whatsapp/route.ts, src/lib/whatsapp/formatter.ts, src/lib/storage/index.ts]
rodada: 2026-07-01 — auditoria código×jornada (Mapa em docs/jornada/jornada-canonica.md)
---
## Origem — auditoria código×jornada (D13)

Divergência **D13** do Mapa em `docs/jornada/jornada-canonica.md`, Passo 6 (KYC / envio de
documento). A jornada canônica é a **voz do operador** e a regra do fluxo (regra de produto 1
do `CLAUDE.md`): divergência código×jornada = defeito do código.

> **Voz do operador (jornada, Passo 6):** no WhatsApp, o agente convida
> *"me manda a foto do seu RG/CNH aqui mesmo"* — o cliente deve poder responder à
> mensagem enviando a foto do documento no próprio chat, sem sair pra link nenhum.

Hoje a **copy promete**, mas o **webhook ignora** a mídia: a foto é dropada silenciosamente,
sem feedback nenhum ao cliente. A jornada quebra exatamente no ponto de KYC.

**REGRA de aceite = paridade com o web, que já está correto.** No chat web o upload de
documento já funciona ponta-a-ponta (`src/app/api/chat/document/route.ts` → base64 →
`uploadContractDocument(conversationId, { slot, file, filename, mimeType })`). O WhatsApp
tem que chegar ao **mesmo** ponto do fluxo de contrato — não reinventar destino de arquivo.

## Cenário exato

- **Canal:** WhatsApp (webhook Cloud API).
- **Passos:** 1) cliente chega no Passo 6 e o agente envia a copy de
  `documentUploadToWhatsApp` (`src/lib/whatsapp/formatter.ts:1111-1116`): *"Pra fechar a
  ficha, me manda a foto do seu **RG ou CNH** (frente e verso) aqui mesmo…"*. 2) o cliente
  **anexa a foto** do documento e envia. 3) a mensagem chega ao webhook com `type: "image"`
  (ou `"document"`).
- **Dados usados:** conversa já com proposta/links de documento (fluxo de contrato Trilho A);
  contas de teste de homologação (`secrets.sh decrypt contas-teste`).

### Esperado × Atual
- **Esperado (paridade com web):** o webhook baixa a mídia da Graph API, persiste o arquivo e
  o liga ao fluxo de documento do contrato (mesmo `uploadContractDocument` do web),
  respondendo ao cliente com a confirmação/próximo slot (frente → verso → comprovante).
- **Atual:** a mensagem cai no `default` do `switch` e é **descartada** com um log
  `[whatsapp] Unhandled type: image`. Zero download, zero persistência, zero feedback — o
  cliente fica esperando por uma resposta que nunca vem.

## Root cause (INVESTIGADO — provado no código atual)

Re-verificado no código atual (não só no commit da auditoria):

1. **`src/app/api/webhook/whatsapp/route.ts:94-126`** — o `switch (msgType)` só tem `case
   "text"` (l.95) e `case "interactive"` (l.106). O `default` (l.124-125) apenas
   `console.log(\`[whatsapp] Unhandled type: ${msgType}\`)`. **Não existe `case "image"` nem
   `case "document"`** → toda mídia inbound é dropada silenciosamente.
2. **`src/lib/whatsapp/formatter.ts:1111-1116`** — `documentUploadToWhatsApp` monta a copy
   que convida a foto "aqui mesmo". A promessa existe; o handler que a cumpre, não.
3. **`src/lib/whatsapp/api.ts`** — **não há helper de download de mídia** (só
   `sendTextMessage`/`sendReplyButtons`/`sendListMessage`/`sendInteractiveMessage`/
   `markAsRead`/`sendTypingIndicator`/`sendTemplate`). O `GRAPH_API =
   "https://graph.facebook.com/v21.0"` e o `WHATSAPP_ACCESS_TOKEN` já estão disponíveis, mas
   ninguém faz o GET de mídia (2 passos: `GET /{media-id}` → `url` + `mime_type`; depois `GET
   url` com Bearer → binário).
4. **Fluxo de contrato já pronto e reutilizável:** `uploadContractDocument` em
   `src/lib/bevi/fulfillment.ts:202` (input `{ slot: DocumentSlot, file, filename, mimeType }`,
   `DocumentSlot` = `identidade_frente | identidade_verso | comprovante_endereco` —
   `src/lib/adapters/proposal-gateway.ts:97`). A conversa se resolve por `waId` como no resto
   do processor (`db.query.conversations.findFirst({ where: eq(conversations.waId, from) })`,
   `src/lib/whatsapp/processor.ts:23,49`).

**Conclusão:** bug de comportamento de canal — o webhook não tem branch de mídia. No web o
mesmo passo funciona; a correção é dar ao WhatsApp o mesmo destino (paridade), não um caminho
novo.

## Correção proposta (o quê × onde)

| O quê | Onde |
|-------|------|
| Adicionar `case "image"` e `case "document"` no `switch` do webhook; extrair o `media-id` do payload e delegar a um handler dedicado (async, best-effort, mantendo o 200 imediato) | `src/app/api/webhook/whatsapp/route.ts:94-126` |
| Novo helper `downloadMedia(mediaId)` — 2 passos da Graph API (`GET /{media-id}` → `{ url, mime_type }`; depois `GET url` com Bearer `WHATSAPP_ACCESS_TOKEN`) retornando `{ bytes, mimeType }` | `src/lib/whatsapp/api.ts` (reusa `GRAPH_API`/token já lá) |
| Resolver a conversa por `waId` e o **slot** a preencher a partir do estado da conversa (progressão frente → verso → comprovante), então chamar `uploadContractDocument(conversationId, { slot, file, filename, mimeType })` — **mesmo destino do web** | novo `src/lib/whatsapp/document-inbound.ts` (ou dentro do processor), consumindo `src/lib/bevi/fulfillment.ts` |
| Responder ao cliente: confirmação + próximo slot pedido, ou "recebi, ficha completa" no último; erro amigável se a mídia falhar (nunca silêncio) | `src/lib/whatsapp/formatter.ts` (formatter de confirmação, par de `documentUploadToWhatsApp`) |
| **DECISÃO (PENDENTE-KAIRO — confirmar via `AskUserQuestion` ANTES de implementar):** onde salvar o binário. Opção A = mandar direto pro `uploadContractDocument` (portal Bevi/Conexia, sem staging nosso). Opção B = fazer stage em `src/lib/storage/index.ts` (`putObject`, bucket `aja-administradora-docs` — reusa o do bloco-a-documentos) e então ligar ao contrato. **É decisão de produto/arquitetura — não decidir no escuro no card.** | `src/lib/storage/index.ts` entra no escopo caso B |

> Observação de escopo: o `escopo_arquivos` do bloco lista os 3 arquivos do frontmatter; o
> helper de download (`api.ts`) e o handler novo (`document-inbound.ts`) são derivados diretos
> e ficam no mesmo bloco — declarar no PR se novos arquivos forem criados.

## Regressão exigida

Bug de **comportamento de canal WhatsApp** → 3 camadas obrigatórias (`CLAUDE.md` → "Regressão
de agent — 3 camadas"). A **regra de aceite é paridade com o web já correto**.

### Camada 1 — Structural (`src/app/api/webhook/whatsapp/route.<fix122-slug>.test.ts`)
- Assert que o `switch` do webhook tem branch para `image` **e** `document` (não caem no
  `default`/"Unhandled type"). Escrever o teste que **falha primeiro** contra o código atual
  (só `text`/`interactive`), ver o vermelho, então implementar.
- Assert que o handler de mídia chama `uploadContractDocument` (mesmo destino do web) — mock
  do `fulfillment` + do `downloadMedia`, verificando `{ slot, file, filename, mimeType }`.
- Assert que a copy de `documentUploadToWhatsApp` continua convidando a foto "aqui mesmo"
  (invariante da promessa que o handler passa a cumprir).

### Camada 2 — Cassette (`tests/regression/agent-trajectory.test.ts`)
- Novo `describe` ("cassette" FIX-122): stream determinístico simulando o Passo 6 no WhatsApp —
  agente envia a copy de documento, cliente responde com mídia (`type: "image"`) → o detector
  verifica que a trajetória **dispara** o handler de upload (não o drop silencioso) e que a
  resposta ao cliente confirma/pede o próximo slot. `MockLanguageModelV2` + `simulateReadableStream`
  (`ai/test`), 100% determinístico, zero Anthropic/DB.
- Cross-ref pro integration test do handler de mídia (download + `uploadContractDocument`).

### Integration (código puro do webhook/handler)
- Integration test do handler novo: payload de webhook com `type:"image"` + `media-id` →
  `downloadMedia` (mock Graph) → `uploadContractDocument` (mock fulfillment) chamado com o slot
  resolvido do estado da conversa; e caminho de erro (mídia falha) → resposta amigável, sem
  silêncio. Espelhar o contrato do web (`src/app/api/chat/document/route.ts`) para garantir a
  **paridade** afirmada como regra de aceite.

**Não fechar o fix** sem: (1) Camada 1 + Camada 2 verdes; (2) a DECISÃO de destino confirmada
com o Kairo via `AskUserQuestion`; (3) prova de paridade web↔WhatsApp (mesmo
`uploadContractDocument`, mesmo resultado de slot).

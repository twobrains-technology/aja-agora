---
data: 2026-07-09
titulo: "Bloco jornada-conversa — decisões de implementação (FIX-233/234/235)"
status: aceita
decisor: Kairo
contexto: bloco-jornada-conversa (onda agente-vendas-consorcio)
---

# ADR — Bloco jornada-conversa (funil, voz, fecho)

Complementa `docs/decisoes/blocos/2026-07-09-agente-vendas-consorcio.md` (D1/D2/D3,
decisões de produto do handoff) com as decisões de **implementação** tomadas durante
a execução do bloco.

## D-mesa — "Especialista de cadastros" = mesa (`createMesaHandoff`), não proxy

**Contexto:** o FIX-235 pedia encaminhar o cliente pra "especialista de cadastros"
depois do fecho, com dois mecanismos candidatos no código: `handoffToAgents`
(`src/lib/whatsapp/proxy.ts` — atendente humano GENÉRICO de vendas, mecanismo mais
antigo) ou `createMesaHandoff`/`dispatchAutoTransbordo` (`src/lib/mesa/`, mecanismo
mais novo, dedicado à mesa de cadastros pós-contratação — já usado por
`proposal-status-poll.ts` quando o lead chega em `na_administradora`).

**Decisão (default do card fix-235, sem dúvida real → seguido):** mesa
(`dispatchAutoTransbordo`). É a fila de atendimento humano de
cadastro/documentos que já existe (mesa de operação, docs/integracoes), e o
handoff-antigo (`proxy.ts`) é semanticamente um mecanismo DIFERENTE (escalonamento
de vendas por compliance/valor alto), não "especialista de cadastros".

**Implementação:** `sendFechoPedirOi` (`src/lib/bevi/fecho-pedir-oi.ts`) chama
`dispatchAutoTransbordo(leadId)` **proativamente**, no mesmo momento do fecho —
em vez de só esperar o worker assíncrono `proposal-status-poll.ts` (que só
reconcilia quando a Bevi processa a proposta na administradora, podendo levar
dias). O create+broadcast pra mesa (sem dono, primeiro atendente que clicar "Vou
atender" assume) é o MESMO mecanismo já usado pelo worker — não duplica lógica.

## D-fecho-escopo — FECHO complementa o self-service, não substitui

**Contexto:** ambiguidade real encontrada na investigação — a spec do handoff
(docs/04-copy-fluxos.md) descreve o FECHO como narração do agente logo depois do
`real-offer`, o que poderia ser lido como SUBSTITUINDO o fechamento self-service
(`present_contract_form` → `offer-confirm`, que cria a proposta real na Bevi
sozinho, sem humano).

**Decisão (Kairo, confirmada nesta sessão):** o self-service **continua
criando a proposta normalmente** — nenhuma mudança em `fulfillment.ts`,
`contract-form.tsx`, `ai-sdk.ts` (present_contract_form). O "oi" serve **só**
pra abrir a janela de 24h do WhatsApp; a mensagem que pede o "oi" é um
**template HSM configurado no admin** (mecanismo `usageKey` já existente via
`resolveAndSend`/FIX-203 — nova chave lógica `fecho_pedir_oi`, sem migration).

**Implementação:** a copy do FECHO (pedir o "oi" + mencionar a especialista em
cadastros) foi adicionada como itens **adicionais**, DEPOIS do "Parabéns!" já
travado por teste em `closing-presentation.ts` (docx passo 5.2) — não substitui
nenhuma copy existente. `sendFechoPedirOi` é chamado nos MESMOS pontos onde
`sendContractSummary` já roda (`route.ts` web, `interactive-handlers.ts`
WhatsApp), logo após o offer-confirm.

## Pendência operacional (PENDENTE-KAIRO)

O template com `usageKey: "fecho_pedir_oi"` precisa ser cadastrado e aprovado
no admin de WhatsApp Templates (`/admin/whatsapp/templates`) antes de ir pra
prod. Sem ele, o envio cai na fila (`whatsapp_outbound_queue`) até aprovar —
comportamento seguro (não quebra o fechamento), mas o cliente não recebe o
pedido de "oi" enquanto o template não for aprovado.

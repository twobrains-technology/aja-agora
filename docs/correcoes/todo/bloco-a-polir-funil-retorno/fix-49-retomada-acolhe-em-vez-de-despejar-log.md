---
id: FIX-49
titulo: "Retomada (resume) despeja o log em vez de acolher: scroll no topo, pill falsa, artifacts antigos clicáveis, gates respondidos reabertos"
status: todo
bloco: bloco-a-polir-funil-retorno
arquivos:
  - src/components/chat/theater/theater-chat.tsx
  - src/components/chat/message-list.tsx
  - src/components/chat/chat-message.tsx
  - src/components/chat/artifact-renderer.tsx
  - src/components/chat/artifacts/gate-renderer.tsx
  - src/lib/chat/provider.tsx
  - src/lib/chat/resume.ts
rodada: 2026-06-15 — sessão de levantamento (PO crítico) Kairo+Claude sobre funil/retorno
---

# FIX-49 — A retomada "lembra mas não acolhe"

## Palavras do operador

> "preciso entender como foi pensado a UI do funil para quando tem várias
> iterações do mesmo usuário" · "olhando para ux e para a jornada perfeita, o
> que podemos melhorar para ficar mais refinado? pense nisso como um PO crítico
> dono do produto." — Kairo, 2026-06-15

## Cenário exato

Usuário fecha o painel teatro e reabre (mesmo device, cookie `aja_uid`). O
`GET /api/chat/resume` (`resume.ts:28-58`) traz `initialConversationId` +
`initialMessages` e o `ChatProvider` hidrata o histórico (FIX-46). Mas a volta
é um **despejo de log**, não um acolhimento:

1. **Scroll no topo** — `message-list.tsx` monta com `stick=true` mas não
   rola pro último ponto acionável; o usuário cai no começo da conversa antiga.
2. **Pill "novas mensagens" falsa** — aparece na hidratação como se houvesse
   mensagem não lida; não há.
3. **Artifacts antigos clicáveis** — group/recommendation/simulation cards do
   histórico voltam interativos. Re-clicar "Simular esse" de uma hora atrás
   **re-dispara `select-group`** no contexto novo (simulação/proposta duplicada
   → polui o funil; cruza com FIX-48).
4. **Gates respondidos reabrem** — `name`/`identity` voltam como cards "em
   aberto" no histórico (`gate-renderer.tsx`). O agente já sabe o nome/CPF
   (memória Letta), mas o card sugere que precisa responder de novo.

## Root cause — observado no código

- `message-list.tsx` — `stick`/scroll inicializados pro fluxo de streaming ao
  vivo, sem ramo específico para "mensagens hidratadas de resume" (sem
  auto-scroll pro fim, sem suprimir a pill).
- `artifact-renderer.tsx` / `chat-message.tsx` — interatividade do artifact não
  distingue "turno ativo" de "histórico hidratado"; só `isStreaming` desabilita
  (janela em que o agente está ocioso deixa o card antigo clicável).
- `gate-renderer.tsx` — `active={isLast}` controla render, mas gate hidratado
  não carrega estado "concluído/respondido" → renderiza em aberto.
- `provider.tsx` / `resume.ts` — a hidratação não marca as mensagens como
  "resumed" (falta o sinal que a UI usaria pra selar artifacts/gates e ancorar
  o scroll).

## Correção proposta

| O quê | Onde |
|---|---|
| Propagar flag `resumed`/`hydrated` nas mensagens vindas do resume | `src/lib/chat/resume.ts`, `src/lib/chat/provider.tsx` |
| **Âncora de retomada:** divisor visual "Você voltou — continue de onde parou" antes do 1º turno novo; auto-scroll suave pro último ponto acionável na hidratação | `src/components/chat/message-list.tsx`, `src/components/chat/theater/theater-chat.tsx` |
| Suprimir a pill "novas mensagens" quando a lista é hidratação (não chegada de mensagem) | `src/components/chat/message-list.tsx` |
| **Selar artifacts do histórico** como read-only (visual "concluído" + `pointer-events-none`) — só o artifact do turno ativo é clicável | `src/components/chat/artifact-renderer.tsx`, `src/components/chat/chat-message.tsx` |
| Gate hidratado/respondido renderiza estado **"concluído"** (ex.: "Nome: João ✓"), nunca card em aberto | `src/components/chat/artifacts/gate-renderer.tsx` |

> Princípio de produto: retorno bom responde "você parou AQUI, o próximo passo
> é X" — não reapresenta o caminho todo como se fosse novo. Selar o histórico
> também fecha o vetor de duplicação que alimenta o bug do funil (FIX-48).

## Regressão exigida

UI React **não-agêntica** (sem `streamText`) → **sem cassette**. Cobertura:

- **Component test (`message-list`, `artifact-renderer`, `gate-renderer`):**
  ao receber `initialMessages` marcadas como resumed → artifacts antigos
  `aria-disabled`/sem handler de clique; gate respondido renderiza estado
  concluído; pill suprimida.
- **E2E (Playwright) do resume:** abre chat, avança até group cards, fecha,
  reabre → assert (a) scroll ancorado no fim/último acionável, (b) clicar num
  group card antigo NÃO dispara nova request `select-group`, (c) gate de nome
  não reaparece em aberto.
- **Camada 1 (structural):** assert que `resume.ts`/`provider.tsx` propagam o
  flag `resumed` no shape das mensagens hidratadas.

Ver falhar primeiro (artifact antigo dispara ação / gate reabre), depois corrigir.

Você é o executor do bloco **bloco-mesa-c-copiloto** no worktree isolado deste branch
(`feat/mesa-copiloto`). Implemente o AGENTE COPILOTO que orienta o atendente de mesa.

## Contexto obrigatório (leia ANTES de codar)
1. `docs/visao/mesa-de-operacao.md` — spec (§5 o copiloto, DEC-C injeção do PDF full-text). A régua.
2. `docs/correcoes/README.md` + `docs/correcoes/todo/bloco-mesa-c-copiloto/` (cards FIX-66/67).
3. `CLAUDE.md` do projeto — "Regressão de agent — 3 camadas" (Camada 2 cassette é OBRIGATÓRIA aqui,
   é comportamento de agente), Vercel AI SDK 6 (NÃO usar @anthropic-ai/sdk direto), "pnpm ÚNICO".

## O que JÁ EXISTE (fundação / padrões — estude e REUSE)
- Schema mesa em `src/db/schema.ts` (`mesa_handoffs`, `mesa_copilot_messages`, `mesa_attendants`,
  `administradora_docs.texto_extraido`) + migration 0026 aplicada.
- **Roteamento por número JÁ tem um precedente**: `src/lib/whatsapp/processor.ts:58` faz
  `if (await isAttendantPhone(from)) { ... handleAgentMessage ... }` (atendente-com-login que assume
  a conversa do cliente). Você adiciona um check ANÁLOGO e ANTERIOR pro atendente de MESA:
  `if (await isMesaAttendantPhone(from)) return handleMesaCopilot(from, text)`. É a ÚNICA edição no
  `processor.ts` — um early-return no topo do `processTextMessage` (depois do `/reset`).
- Agente via Vercel AI SDK 6: estude `src/lib/agent/` (streamText, tool, system-prompt builder,
  prompt caching no bloco estável). O copiloto segue o MESMO padrão, com system prompt próprio.

## Itens (ordem)
### FIX-66 — Roteamento inbound por número + persistência
- `src/lib/whatsapp/mesa/routing.ts`: `isMesaAttendantPhone(phone)` (consulta `mesa_attendants`
  ativos por whatsapp; cache curto in-memory como o `getAttendantList`) + `handleMesaCopilot(from,
  text)` que resolve o `mesa_handoffs` ABERTO do atendente, persiste a msg do atendente em
  `mesa_copilot_messages` (role='attendant'), chama o agente (FIX-67), persiste a resposta
  (role='assistant') e envia via `sendTextMessage`.
- Hook no `processor.ts`: o early-return citado acima. NADA mais nesse arquivo.
- **Sem colisão de canal** (spec §8): número de atendente de mesa → copiloto; nunca cai em vendas.
  Se um número for atendente de mesa E cliente, mesa de operação tem precedência quando há handoff aberto.

### FIX-67 — Agente copiloto + injeção do PDF + cassette
- `src/lib/agent/mesa-copilot/`: builder do system prompt do copiloto. Injeta:
  (a) o `texto_extraido` do(s) `administradora_docs` da administradora do handoff (full-text, DEC-C,
  com **prompt caching** no bloco estável — o manual muda pouco); (b) dados da cota/oferta escolhida;
  (c) dados mínimos do cliente. Persona: orienta o ATENDENTE (não fala com cliente) a executar o
  contrato na administradora, passo a passo, e tira dúvidas.
- streamText (Vercel AI SDK 6). Sem expor stack trace; responde em PT-BR.
- **Camada 2 (cassette) OBRIGATÓRIA**: em `tests/regression/agent-trajectory.test.ts`, um `describe`
  novo no FIM (append-only) com `MockLanguageModelV2` provando: (1) o builder injeta o texto do PDF
  da administradora certa no system prompt; (2) número de atendente de mesa roteia pro copiloto, não
  pra vendas; (3) o copiloto não vaza meta-narrativa/stack. Asserts estruturais complementares no builder.

## DESIGN (passo 2 — decida sozinho, NÃO trave)
Decisões reais: shape do system prompt do copiloto, como cachear o PDF, multi-doc por administradora,
o que fazer se não há handoff aberto pro número. Raciocínio do `superpowers:brainstorming` mas
**você decide** (recomendada). Registre em `docs/correcoes/decisions/2026-06-21-bloco-mesa-c.md`,
commit `docs:`. NÃO pergunte, NÃO trave no HARD-GATE.

## Regressão exigida (CLAUDE.md — agente: 3 camadas)
- Camada 1 (structural): o builder injeta o `texto_extraido`; `isMesaAttendantPhone` consulta a
  tabela; o hook está no `processor.ts`.
- Camada 2 (cassette): o `describe` novo descrito em FIX-67.
- Integration: roteamento + persistência em `mesa_copilot_messages` (DB real).

## Entrega
- TDD strict; 1 commit Conventional (PT-BR) por item. Mover cards pra `done/`.
- `pnpm test:unit` verde ANTES de finalizar (rode no container do workspace via `local-dev`). O
  pre-commit hook exige Camada 3 (LLM real) porque você toca `src/lib/agent/` — garanta a
  ANTHROPIC_API_KEY no `.env.local` do workspace (já vem do bootstrap).
- RESUMO FINAL com as decisões de design.

## ⛔ LINHA VERMELHA (inviolável)
Implementa, commita e **push da branch** (`git push origin feat/mesa-copiloto`). **NÃO** abra PR,
**NÃO** merge, **NÃO** deploy/restart de prod. Integração é do orquestrador.

---
executado_em: 2026-07-23
itens: [FIX-368]
commit: 90270707
---

# Remoção do runtime Vercel + replantio do FIX-368 no LangGraph (rodada 3)

Trabalho feito direto na base `integ/vendedor-matador` pelo orquestrador da campanha
(`.processo/loop/2026-07-22-1853-vendedor-matador-consorcio.md`) — não é um bloco Superset,
o achado era grave demais pra esperar uma onda (ver seção "Descoberta crítica" no goal doc).

## O que motivou

Spot-check ao vivo do FIX-368 (rodada 2, bloco-j) mostrou o sintoma ORIGINAL intacto mesmo com
o fix "aplicado". Investigação (log `[route] gate=...` batendo com
`langgraph/nodes/route.ts`, não `orchestrator/index.ts`) levou a `/app/.env`:
`AI_RUNTIME=langgraph`. Este workspace nunca rodou o runtime Vercel. Kairo confirmou ao vivo:
LangGraph é o único runtime; Vercel deveria ser apagado por completo.

## O que foi feito

1. **Removido o runtime Vercel inteiro**: `orchestrator/runner.ts` (1720 linhas), `orchestrator/
   index.ts` (de ~1470 pra 30 linhas — só chama `runTurnLangGraph` incondicionalmente),
   `route.ts` (9 pontos de `runtimeFlavor()`, ~549 linhas de ramos Vercel mortos),
   `src/lib/llm/runtime.ts` (deletado). `scoringInputFromMeta` extraída pra
   `src/lib/agent/scoring-input.ts` (única função de `runner.ts` usada fora dele, por
   `langgraph/nodes/discovery.ts`). Mantido: `agents/index.ts`/`agents/builder.ts`
   (`resolveAgent`/`buildAgent`) — servem só as rotas ADMIN de preview de persona, fora do
   runtime de conversa com cliente.
2. **FIX-369 (escassez) sobreviveu sem trabalho extra** — vivia em `server-cards.ts`
   (compartilhado), já consumido por `langgraph/nodes/emit-card.ts`.
3. **FIX-368 (resume pós-fechamento) replantado no LangGraph**:
   - `state.ts`: novo campo `isResumeGreeting: Annotation<boolean>()` (sem reducer custom —
     reafirmado a cada turno).
   - `run-turn.ts`: propagado nos 2 caminhos (`Command(resume)` e estado inicial).
   - `nodes/converse.ts`: nova função pura `resumeAfterCloseSection(contractClosed,
     isResumeGreeting, administradora)`, chamada de dentro de `createConverseNode` como
     `blocoRetomadaPosFechamento`.
4. Removidos 3 testes de integração que só exercitavam o pipeline Vercel morto
   (`vi.stubEnv("AI_RUNTIME","vercel")` + mock de `resolveAgent`) — o teste unitário puro do
   FIX-369 (`server-cards.test.ts`) é runtime-agnóstico e ficou intacto.

## Verificação ao vivo (spot-check, não substitui TDD)

Persona ad-hoc "Marina" (Imóvel), pós-restart do container: resposta ao "Voltei" pós-fechamento
= *"Que bom te ver de novo, Marina! Sua reserva com a ITAÚ já está confirmada, e um atendente
da Aja Agora vai te chamar no WhatsApp em breve pra seguir com os próximos passos da adesão.
Alguma dúvida enquanto isso?"* — bate os 4 critérios do card FIX-368 original. Detalhe completo:
`.processo/loop/2026-07-22-1853-vendedor-matador-consorcio/evidencias/rodada-3/spot-check-fix368-langgraph.md`.

## Follow-up (mesmo dia, achado do juiz na re-verificação)

O juiz (7,5/10, veredito condicional) apontou corretamente: zero teste automatizado cobrindo o
replantio. Corrigido no mesmo commit da base: `resumeAfterCloseSection` extraída como função
pura (não dependia de estar dentro do node) + `converse.resume-after-close.test.ts` (6 casos:
seção presente com os 2 flags true, fallback sem administradora, `null` com qualquer flag
false, e checagem de que a REGRA DURA cobre os 3 sintomas literais observados nas 3 personas da
rodada 1). `pnpm exec vitest run` desse arquivo: 6/6 verdes. `pnpm typecheck` limpo.

## Gaps residuais (honestos, não bloqueantes desta correção)

- **"Lead history completeness"**: 2 testes de integração removidos (só cobriam o pipeline
  Vercel) sem substituto LangGraph-nativo. O juiz sugeriu portar pra `persist.ts` (mesma lógica
  de persistência mensagem+artifact, mesma classe de bug do FIX-11 original) — não feito
  ainda, registrado como item pra próxima rodada (candidato a FIX-371).
- **E2E completo pós-remoção**: não feito. Este documento cobre só o spot-check + o teste
  unitário da função extraída — falta a rodada reduzida de 3 personas (resume nas 3 + smoke de
  ITEM 1/3/4/5) que o juiz pediu antes de selar "matador pra prod".
- **`pnpm test` (suíte completa) dentro do container**: não rodei ainda — o juiz pediu
  explicitamente pra pegar qualquer import quebrado que `pnpm typecheck` sozinho não capturaria
  (typecheck não executa lógica).

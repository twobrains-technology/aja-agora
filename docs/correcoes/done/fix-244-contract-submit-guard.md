---
id: FIX-244
titulo: "Server aceita contract-submit sem contract_form ter sido emitido"
status: done
bloco: bloco-r2-valor-compliance
arquivos:
  - src/app/api/chat/route.ts
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/agent/personas.ts
rodada: 2026-07-10 rodada 2 (Fable r1, gap P2 #9)
commit: 7fcd5c8
executado_em: "2026-07-10"
---

## Gap (veredito Fable §D3.2 nota, gap #9)
O handler `contract-submit` (route.ts) ACEITAVA o fechamento mesmo que o
`contract_form` NUNCA tivesse sido apresentado (o Fable fechou uma proposta atirando
contract-submit cru numa conversa que nunca viu o form). Faltava validação de estado
do funil — só `revealCompleted` era checado (FIX-12).

## Correção
- `personas.ts`: novo `contractFormDispatched?: boolean` na `ConversationMetadata`.
- `runner.ts`: marca a flag quando o artifact `contract_form` aparece na conversa —
  mesmo padrão de hardening do `decisionDispatched` (BUG-REVEAL-LOOP), cobre tanto o
  disparo dirigido pelo orquestrador quanto o modelo chamando a tool por conta
  própria (free-run web).
- `route.ts`: o handler `contract-submit` rejeita com mensagem honesta e PERSISTIDA
  quando `contractFormDispatched !== true` — defesa em profundidade gêmea do guard
  `revealCompleted` (FIX-12), mesmo handler, mesmo estilo (`writeAndSaveText`,
  determinístico, sem chamar o LLM de novo pra manter o teste rápido e estável).

## Regressão (TDD — vista falhar antes, verde depois)
`route.closing-persistence.test.ts`, novo describe "FIX-244": `startContract` NUNCA é
chamado sem a flag; a recusa fica persistida (não vira ghost, regra do FIX-11); com
`contractFormDispatched: true` o fluxo legítimo roda normal. `CLOSED_META` do próprio
arquivo (usado pelos testes de sucesso do FIX-11) ganhou `contractFormDispatched:
true` — representa a jornada normal onde o form já apareceu.

## Achado extra: `test:integration` precisava de `IDENTITY_ENC_KEY`
Rodei `pnpm test:integration` (gate explícito pra mudança que toca DB, per
`_prompt.md`) — 3 falhas em `resolve.integration.test.ts`/`reset/route.test.ts` por
`IDENTITY_ENC_KEY` ausente no shell (não é bug de código: essas suites, ao contrário
de `route.closing-persistence.test.ts` etc., não têm o fallback self-contido no topo
do arquivo). Confirmado pré-existente via stash+reprodução no HEAD; com a env var
exportada, as 64 suites de `test:integration` passam (268 testes, 5 skips
esperados). Nenhuma alteração de código — achado de ambiente, não de produto.

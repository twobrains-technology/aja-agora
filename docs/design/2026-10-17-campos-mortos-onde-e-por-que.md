# Os 5 campos mortos — mortos onde, exatamente

Medido em 17/10/2026, fase 3 da campanha do motor-pi.

Campos em questão: `voiceTone`, `examples`, `forbiddenTopics`, `handoffTriggers`,
`activeCampaigns` (tabela `personas`). O mandato manda re-ancorar o juiz antes de
remover, e **manter** `displayName`, `category` e `expertise`.

## O que foi feito

`src/lib/eval/scorer.ts` foi **re-ancorado**: o contexto de persona entregue ao juiz
(`PersonaContext`, em `src/lib/eval/rubric.ts`) deixou de carregar `voiceTone` e
`forbiddenTopics` e passou a carregar `displayName`, `category` e `expertise`. Julgar
estilo contra campo que ninguém alimenta mede o vazio — e dá nota estável e falsa.

A rubrica também foi ajustada nos três pontos que mandavam comparar contra esses
campos, e `formatPersona` agora imprime nome, categoria e expertise.
Prova: `src/lib/eval/rubric.persona-context.test.ts` (3 casos verdes; reintroduzir
`voiceTone`/`forbiddenTopics` no texto da rubrica ou no formatador deixa vermelho).

## Onde os 5 campos estão (grep)

**Fora do caminho de produção — nada no turno os lê:**

```
grep -rn "voiceTone\|forbiddenTopics\|handoffTriggers\|activeCampaigns" \
  src/lib/agent/langgraph src/lib/agent/orchestrator src/lib/agent/qualify-state.ts \
  src/lib/agent/turn-analyzer.ts
→ (vazio)

grep -rn "\.examples\b" src/lib/agent/langgraph src/lib/agent/orchestrator
→ (vazio)
```

**Vivos, porém, no PAINEL** — são a espinha do editor de persona por IA:

- `src/lib/agent/assistant-prompt.ts` — o prompt do AI assistant que edita a persona;
- `src/lib/agent/tools/assistant-tools.ts` — `propose_patch` com os `kind`s
  `voiceTone`, `example.add`, `forbiddenTopic.add`, `handoffTrigger.add`;
- `src/app/api/admin/personas/**` — rotas `[id]/examples`, `[id]/forbidden-topics`,
  `[id]/handoff-triggers`, `preview`, `assist`;
- `src/components/admin/personas/**` — seções `persona-examples-section`,
  `forbidden-topic-list-section`, `handoff-trigger-list-section`,
  `campaign-list-section`, `diff-card`;
- `src/lib/validations/persona.ts` e `persona-patch.ts`;
- `src/db/schema.ts` — colunas da tabela.

## Consequência (e por que NÃO removi agora)

Dropar as colunas e os 5 campos **apaga o editor de persona por IA do painel** — uma
feature que o dono usa, não um resto de código. O mandato diz que esses campos não
governam a conduta (verdade: a conduta passou para a caixa de prompt na fase 2), mas
"não governa a conversa" e "não deve existir no produto" são decisões diferentes.

Então a remoção fica **na mão do dono**, e é levada ao portão de parada junto com o
resto: (a) manter como está — o painel continua editando campos que o turno ignora;
(b) aposentar o editor junto com os campos; (c) manter o editor e re-apontá-lo para a
caixa de prompt (o caminho coerente com a fase 2, e o mais caro).

O que **não** fica ambíguo: o turno não lê nenhum deles, o juiz não mede por eles, e
`displayName`/`category`/`expertise` seguem vivos e intocados
(`personas-repo.ts:55` → `analyze.ts` → `routing.ts`/`transition.ts`,
`turn-analyzer.ts:328`).
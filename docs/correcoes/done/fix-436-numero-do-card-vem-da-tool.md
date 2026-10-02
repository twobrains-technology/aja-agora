---
id: FIX-436
titulo: "O número do card vem do resultado da tool, não do argumento do modelo"
status: done
bloco: numero-do-card-vem-da-tool
commit: 908a3081
arquivos:
  - src/lib/agent/langgraph/numeros-do-card.ts
  - src/lib/agent/langgraph/numeros-do-card.test.ts
  - src/lib/agent/langgraph/nodes/converse.ts
  - src/lib/agent/langgraph/nodes/converse.numeros-do-card.integration.test.ts
rodada: 2026-10-02
executado_em: 2026-10-02
---
## O defeito medido
`converse.ts` usava o **input do modelo** como payload do card. Em `db26cd54` (02/10 11:05:20 e 11:07:15) a
tool `compare_with_financing` devolveu financiamento **R$ 5.678,45/mês** (Δ R$ 11,68) e o qwen passou ao
`present_financing_comparison` **R$ 6.071 e Δ R$ 404,23** — o card desenhou o número inventado. É o "duas
respostas com ZERO texto, só card" que o dono viu como "parou de responder" (o turno sem fala continua
sendo comportamento do modelo — `PENDENTE-KAIRO` do `AI_MODEL`).

## O que mudou (D7)
`numeros-do-card.ts` (novo) resolve o payload a partir do **resultado mais recente da tool de origem** no
histórico de mensagens do grafo, para o mesmo grupo/carta; o argumento do modelo só fornece **chave**
(categoria, groupId):

- `financing_comparison` ← `compare_with_financing`;
- `simulation_result` ← `simulate_quota`;
- `scenarios` ← `compute_scenarios`.

Sem resultado de origem utilizável, o card **não sai** e fica o log `[card-sem-fonte]`. Os campos numéricos
são reescritos com o fato do servidor; **os números do argumento do modelo nunca passam** para o payload
final.

### Extensão aprovada do texto literal de D7
O DA literal falava só do resultado de tool. O gerente aprovou (registrado no `diario-enxame.md`) que, para
`simulation_result`, a **cota ancorada no estado** (`funnel.escolha`/`recommendedOffer`) também vale como
origem quando não há ToolMessage utilizável — **desde que seja o mesmo grupo/carta** do card; caso
contrário, suprime. `financing_comparison` e `scenarios` seguem **estritamente** da tool. A razão: há fluxo
legítimo (cenários de teste e a escolha de cota pelo atalho do servidor) em que a cota foi ancorada pelo
servidor e o ToolMessage não está no histórico — e a garantia de D7 (número é fato, não fala) permanece.

## Provado
- Unit `numeros-do-card.test.ts` (reproduz `db26cd54`): resultado 5678.45/266886.98, Δ −11.68/−548.79 com
  args do modelo 6071/278372, Δ −404.23/−12033.81 ⇒ payload final com os números da **tool**; o mesmo para
  `simulation_result` e `scenarios`; sem fonte ⇒ `null` + `[card-sem-fonte]`; tool errada / `status: "error"`
  / fonte sem número ⇒ `null`; cota ancorada só vale para `simulation_result` e só para a MESMA cota.
- Integração `converse.numeros-do-card.integration.test.ts`: o artifact emitido carrega o número da tool.
- `pnpm -s vitest run src/lib/agent/langgraph` → **66 arquivos / 295 testes verdes**; `typecheck` exit 0.

## Nota de correção
O B1 (FIX-432) havia regredido 11 casos dos `cenario-*` da raiz de `src/lib/agent/langgraph` que o gate dele
(limitado a `nodes/`) não cobria — causa de **fixture**, não de produto. Corrigido no bloco **B1b**
(`d3aaafb8`, ver FIX-432) antes de o B5 ser commitado.
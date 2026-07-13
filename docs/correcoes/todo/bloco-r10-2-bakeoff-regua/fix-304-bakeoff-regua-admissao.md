---
id: FIX-304
titulo: "Régua de admissão de modelo (bakeoff como gate) + casca determinística por-gateway"
status: todo
bloco: bloco-r10-2-bakeoff-regua
severidade: media
projeto: aja-agora
arquivos: [scripts/bakeoff.sh, src/lib/agent/orchestrator/sanitizer.ts, src/lib/llm/gateway-openai.ts]
rodada: 2026-07-12 (loop-de-goal r10, onda 2, bloco r10-2-bakeoff-regua — sequencial, depende dos fixes de código da onda 1)
---
## Palavras do operador
> "aqui a gente está usando o modelo Qwen 3.5 Fast, é um modelo bem barato... independente do
> comportamento da conversa está totalmente ruim" — Kairo, 2026-07-12.

## Cenário exato
- **Rota/tela:** processo de decisão de modelo (não é bug de produto rodando em prod).
- **Passos:** re-rodar `scripts/bakeoff.sh` com `AI_MODEL` apontando pro Qwen, pós onda 1 (funil
  reordenado + invariantes de humanização em código), e comparar com o baseline anterior.
- **Dados usados:** `.bakeoff/qwen-jornada.log` (2026-07-05): `fluxoScore=0.774` (alvo ≥0.85), 4
  falhas/31 testes.

## Esperado × Atual
- **Esperado:** nenhuma troca de `AI_MODEL` em dev/prod acontece sem o bakeoff bater a régua — e
  os invariantes que a onda 1 moveu pra código (1 frase interrogativa, reveal server-forced,
  topic-picker enum canônico) devem reduzir a distância entre modelo barato e modelo de prod, já
  que menos comportamento depende do modelo obedecer ao prompt.
- **Atual:** não há gate formal de admissão — a régua existe (`bakeoff.sh`) mas não é
  obrigatória antes de qualquer troca futura de `AI_MODEL`. P10 (frases coladas/emoji/
  capitalização no gateway OpenAI-compat) nunca foi confirmado por turn-trace.

## Root cause (INVESTIGADO)
- `.bakeoff/qwen-jornada.log`: reprovação mecânica já registrada, é fato, não hipótese.
- `gateway-openai.ts`: caminho de streaming diferente do nativo Anthropic — chunking de frases
  pode divergir (hipótese, precisa de turn-trace real antes de virar fix, conforme já registrado
  no estudo original — não cravar sem log).

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| Re-rodar `scripts/bakeoff.sh` com Qwen pós onda 1 — registrar novo score no goal doc (processo, não código) | `.bakeoff/` (log novo) |
| Capitalização determinística do `contactName` — CONFIRMAR se já foi coberta pelo FIX-299 (sanitizer-invariantes, onda 1); se sim, este item é só a verificação, não fix novo | `sanitizer.ts` (checar) |
| Investigar chunking de frases no `gateway-openai.ts` via turn-trace de uma sessão real Qwen — só propor fix de código SE o log confirmar divergência real (não cravar) | `gateway-openai.ts`, `turn-trace.ts` |
| Documentar a régua como processo obrigatório: qualquer troca de `AI_MODEL` em dev/prod exige bakeoff verde antes | `docs/decisoes/decisoes.md` ou `CLAUDE.md` do projeto (decisão de processo, registrar) |

## Regressão exigida
- Não é TDD de código puro (é parcialmente processo). O que É código (capitalização, se ainda
  necessário) segue TDD strict. O restante: log do bakeoff re-rodado anexado como evidência no
  goal doc, com o score explícito (verde ou vermelho, sem arredondar).

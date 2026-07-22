---
bloco: bloco-f-artifacts-produto
branch: feat/artifacts-jornada-produto
workspace: feat-artifacts-jornada-produto
onda: 2
status: SEGURADO — NÃO LANÇAR sem aval do Bernardo
depends_on: []   # NÃO é dependência técnica — é GATE HUMANO (aval do stakeholder)
paralelo_com: []
itens: [FIX-95, FIX-96]
escopo_arquivos:
  - src/components/chat/artifacts/plan-estimate-picker.tsx
  - src/lib/consorcio/plan-estimate.ts
  - src/lib/chat/ui-message.ts
  - src/lib/agent/recommendation.ts
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/chat/types.ts
  - src/components/chat/artifacts/recommendation-card.tsx
  - src/components/chat/artifacts/comparison-table.tsx
  - src/lib/agent/system-prompt.ts
conflitos_esperados:
  - "system-prompt.ts: FIX-96 adiciona regra de quantas recomendações destacar; bloco-e (FIX-93/94) toca proibições + ordem de gates. Regiões diferentes (nível 2). Ao lançar este bloco DEPOIS do bloco-e integrado na base, forka da base já com E → conflito mínimo/nenhum."
---
# Bloco F — Artifacts de produto (⚠️ SEGURADO — aguarda aval do Bernardo)

> ⚠️ **Nota de 2026-07-20 (expurgo do `jornada.docx`):** este card ainda citava
> `docs/jornada/jornada-canonica.md` como "REGRA" e invocava uma "regra inviolável do
> CLAUDE.md" de que "divergência código×docx = defeito" — **esse arquivo não existe mais**
> (foi rebaixado a `docs/jornada/decisoes-do-cliente.md`, registro histórico, sem poder
> normativo) **e essa regra do CLAUDE.md foi revogada em 2026-07-13** (o dogma engessou o
> agente). Corrigido abaixo. O GATE HUMANO real (aval do Bernardo pro conceito do
> simulador) continua de pé — não é sobre o docx, é sobre o stakeholder do produto.

🚫 **NÃO LANÇAR sem o aval do Bernardo.** O simulador do passo 4 é conceito dele
(stakeholder) — não implementar versão final sem o aval, independente de qualquer
documento.

O **FIX-96 muda a copy de anúncio da descoberta** ("Encontramos 3 boas opções" →
"Encontramos N opções…"). Copy de conversa é do modelo/produto, não trava em documento —
mas a MUDANÇA DE UX (tirar o teto de 3, mostrar hero+5+expansível) é decisão de produto já
fechada com o Kairo (ver cards). Por isso este bloco fica **desenhado mas não disparado**
até o Kairo validar com o Bernardo. Quando liberar: lançar como onda 2 (forka da base já
com E/G/H integrados) e conferir a nova copy contra a referência viva
(`docs/design/specs/2026-07-09-handoff-agente-vendas-consorcio/`) — não contra um docx.

## Itens
1. **FIX-95** — trocar o simulador do passo 4 por seletor simples só de valor (slider de valor; sem prioridade/prazo/estimativa inline).
2. **FIX-96** — remover o teto de 3 recomendações: 1 hero + 5 ranqueadas + "ver todas" expansível inline (ordenar/filtrar). LLM cura só os 6 do destaque (token-safe); lista completa vai backend→artifact sem passar pela LLM.

Detalhe completo de cada decisão (já fechada com o Kairo) nos cards `fix-95`/`fix-96`.

# Ata — Sessão de levantamento (PO crítico): funil + retorno

**Data:** 2026-06-15 · **Quem:** Kairo + Claude · **Modo:** tira-dúvida /
levantamento (sem implementar). Saída: bloco `bloco-a-polir-funil-retorno`
(FIX-48/49/50).

## Pedido do operador (literal)

> "olhando para ux e para a jornada perfeita. o que podemos melhorar para ficar
> mais refinado? pense nisso e por favor como um po critico dono do produto."
>
> "boa usando /todo-blocks cria por favor as correcoes, em um bloco unico se for
> viavel."

Gatilho inicial (sintoma que abriu a investigação):

> "enviei até a parte dos documentos, só que o funil ficou até qualificado."

## O que foi investigado

Cruzamento da jornada canônica (`docs/jornada/jornada-canonica.md`, a REGRA) e da
proposta que originou a branch (`docs/jornada/proposta-funil-contatos-retorno.md`)
com o código real do funil, da UI do chat (theater/resume) e da visão de contato
do admin.

## Achados → decisão (6 levantados, 3 viram fix)

| # | Achado | Veredito | Por quê |
|---|---|---|---|
| 1 | Proposta web não move a raia (fica em `qualificado`) | **FIX-48** | Bug real, root cause provado: `buildStartContractInput` não passa `leadId` → transição pulada + proposta órfã + polling ignora |
| 2 | Retomada despeja log (scroll topo, pill falsa, artifacts antigos clicáveis, gates reabertos) | **FIX-49** | UX confirmada no código; artifact antigo clicável re-dispara ação (alimenta o #1) |
| 3 | Card do contato não destaca proposta vigente / conversa ativa | **FIX-50** | Visão consolidada lista tudo sem hierarquizar o presente |
| 4 | "Valor do lance ausente" (jornada linha 25) | **DESCARTADO** | Já existe: `plan-estimate-picker.tsx:61,87,124` emite `lanceValue`; `types.ts:284` `declaredLanceValue`. Anotação da jornada está desatualizada |
| 5 | "Resumo da contratação por WhatsApp/e-mail" (passo 5) | **DESCARTADO** | Já existe: `src/lib/bevi/contract-summary.ts` + `sendContractSummary` em `route.ts:667` e `interactive-handlers.ts:175` |
| 6 | Feedback de recebimento de documentos | **DESCARTADO** | Marginal e sobrepõe FIX-10 (done), que já tratou o timing do disparo. Não justifica fix dedicado |

> Lição: 3 dos 6 "gaps" da análise eram falsos (já implementados ou fracos). A
> diligência de root cause antes de anotar evitou 3 fixes-fantasma — exatamente
> o que a skill todo-blocks exige.

## Itens da jornada que dependem de stakeholder (não viram fix agora)

- **Simulador do passo 4** (3/6/12 meses, com/sem lance, lance embutido) —
  `docs/jornada/proposta-simulador.md` aguarda aval do Bernardo. Fora de escopo
  de execução até decisão dele.

## Estrutura de blocos

Bloco único (`bloco-a-polir-funil-retorno`, onda 1) — os 3 itens têm arquivos
disjuntos entre si mas são afins (mesma feature) e curtos: 1 sessão/dev, ordem
interna FIX-48 → FIX-49 → FIX-50. Atende o "bloco único se viável" do operador.

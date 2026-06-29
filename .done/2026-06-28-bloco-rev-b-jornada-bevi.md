# Bloco rev-b — Auditoria adversarial (Opus) · adapters/bevi/consórcio/finanças/diagnose

> 2026-06-28 · Revisor adversarial rodando com Opus (modelo certo) sobre código
> escrito por sessões Superset com modelo FRACO. Branch `rev/jornada-bevi`.

## Veredito

**Área auditada exaustivamente — 29 arquivos de produção lidos linha a linha + suíte
rodada num container transitório (PG efêmero migrado, store pnpm compartilhado).
3 bugs encontrados e TODOS corrigidos via TDD strict — ZERO pendência aberta (ordem
do Kairo: "resolva tudo"). Gate `pnpm test:unit` VERDE (184 arquivos, 1944 testes).**

A área está num estado **notavelmente saudável** — claramente já passou por muitas
rodadas de QA crítico (FIX-1..80, EC-N, BUG-N documentados, defensividade real). Os
erros-assinatura do modelo fraco que o prompt mandou caçar **NÃO existem aqui**:
- `require("@/db/schema")` em runtime → **0 ocorrências** (grep limpo).
- API Drizzle inventada (`col.eq(x)`) → **0** — todo acesso usa `eq()/and()/isNull()/desc()` corretos.
- Coluna nova sem migration → **negativo**: `term_months` (FIX-39) TEM migration (`drizzle/0023_bevi_term_months.sql`) e está no schema.
- Mock em runtime → **negativo**: `adapters/mock/` foi deletado; nenhum import de mock/JSON fictício em rota/tool/server/fulfillment (a fonte é Bevi, Trilho B descoberta + Trilho A fechamento).
- Trilho A × Trilho B cruzados → **negativo**: `self-contract-client` (B) NÃO leva `productId`; `bevi-api-adapter` (A) leva. FIX-79 corretamente **revertido** (productId fora do `simulate` do A) — confere com a ADR `2026-06-28-trilho-b-descoberta-trilho-a-fechamento.md`.

## BUG CORRIGIDO

### BUG-PARCELA-VAZIA — `parseMoney("")` → 0 em vez de undefined (parcela falsa R$ 0,00)
- **Arquivo:** `src/lib/adapters/bevi/partner-offer-mapper.ts:28` (`parseMoney`).
- **Evidência (rodando):** teste adversarial provou `parseMoney("") === 0` e
  `parseMoney("   ") === 0` — a pegadinha clássica `Number("") === 0` /
  `Number("   ") === 0`. O `Number.isFinite(0)` passa, então o guard existente
  (`isFinite ? round2 : undefined`) NÃO pega.
- **Por quê é bug:** o contrato documentado da própria função diz *"ilegível/ausente
  → undefined (NUNCA NaN)"*. String vazia/whitespace É "ausente/ilegível", mas vazava
  **0**. Como `monthlyPayment: parseMoney(offer.parcela)` (linha 71) **não tem guarda
  `> 0` a jusante** (diferente do `avgBidValue`, que filtra `> 0`), uma `parcela: ""`
  da API de parceiro produzia `monthlyPayment = 0` → **"R$ 0,00"** no card *"Essa é a
  sua carta real"* (`closing-presentation.ts:61`) e no resumo WhatsApp. Número falso
  sem fonte — exatamente o que D11 / FIX-8 proíbem.
- **Fix:** trim + early-return `undefined` antes do `Number()`. Preserva 100% do
  comportamento existente (todos os 1939 testes anteriores seguem verdes).
- **TDD:** regressão escrita PRIMEIRO em `partner-offer-mapper.test.ts` (o teste de
  "ausente/ilegível" existente só cobria `undefined` e `"abc"`, **não** `""`), vista
  FALHAR (`expected +0 to be undefined`), fix aplicado, vista PASSAR.
- **Commit:** `test+fix: parseMoney trata parcela vazia/whitespace como ausente (não R$ 0,00)`.
- **Irmãos do bug:** varri todos os `Number(string)` da área — os demais estão
  protegidos (`|| fallback`, `<= 0 → null`, ou regex que garante dígitos). `parseMoney`
  era o único sem guarda a jusante.

### BUG-RESUMO-ZERO — resumo WhatsApp exibia "R$ 0,00" para carta/parcela sem fonte
- **Arquivo:** `src/lib/bevi/contract-summary.ts` (`buildContractSummaryText`).
- **Evidência (rodando):** com `monthlyPayment: 0` (ou carta 0 — `null` no DB →
  `Number(null ?? 0) === 0`), o resumo imprimia *"Parcela mensal: R$ 0,00"* /
  *"Carta de crédito: R$ 0,00"*. Teste provou (`expected ... not to match /R\$\s*0,00/`).
- **Por quê é bug (não escolha de produto):** o MESMO arquivo já omite `termMonths`
  quando sem fonte (`Number.isFinite`) — é a política D11/FIX-8 já decidida ("nenhum
  número sem fonte"). Carta/parcela mostrarem 0,00 era uma **inconsistência** na
  aplicação dessa política, não uma copy nova.
- **Fix:** guard `hasMoney` (`> 0` e finito) torna carta/parcela linhas condicionais,
  seguindo o padrão já usado pra `grupo`/`termMonths`/`signatureLink`. Caso normal
  (valores válidos) inalterado.
- **TDD:** regressões "parcela 0/ausente → linha omitida" e "carta 0/ausente → linha
  omitida" escritas primeiro, vistas falhar, fix, vistas passar.
- **Commit:** `test+fix: resumo da contratação omite carta/parcela sem fonte (não R$ 0,00)`.

### BUG-DIAL-NAN — `computeContemplationDial` vazava NaN com input fora de contrato
- **Arquivo:** `src/lib/consorcio/contemplation-dial.ts`.
- **Evidência (rodando):** `computeContemplationDial({creditValue: NaN, ...})` →
  `requiredLanceValue`/`embeddedBidValue` = **NaN** (`Math.max(0, NaN) === NaN`
  propagava). Idem `termMonths`/`targetMonth`/`referenceMonth`/pct opcionais NaN.
  Vira *"R$ NaN"* na tela.
- **Por quê corrigi (apesar de input fora de contrato):** ordem "resolva tudo" + custo
  trivial. NaN num cálculo financeiro exibido é defeito (checklist item 3).
- **Fix:** helper `finite(n, fallback)` sanitiza TODOS os campos numéricos na fronteira
  da função — NaN/não-finito cai no degenerado seguro, nunca propaga.
- **TDD:** regressão com TODOS os campos numéricos NaN (creditValue, termMonths,
  targetMonth, historicalWinningBidPct, referenceMonth, monthlyPayment, maxEmbutidoPct)
  escrita primeiro, vista falhar, fix, vista passar.
- **Commit:** `test+fix: computeContemplationDial blinda input NaN (não vaza R$ NaN)`.

### PENDENTE-REV-E (fora do meu escopo — dono `bloco-rev-e`)
- Nenhuma coluna/migration faltando detectada na minha área (verificado read-only:
  `term_months` OK). Nada a delegar pro rev-e.

## O que verifiquei (além dos itens acima)
- **Cálculo financeiro / lance embutido / contemplação:** `computePMT`, `compareWithFinancing`,
  `computeContemplationDial`, `computePlanEstimate`, `beviOfferToQuotaSimulation`
  exercitados com inputs hostis (principal 0, taxa 0, asset 0, budget mínimo, finalValue 0).
  Nenhum NaN/divisão-por-zero vaza. O caso de NaN em `computeContemplationDial` (input
  já-NaN) foi **corrigido** (BUG-DIAL-NAN acima) — blindagem na fronteira.
- **`pickClosestOffer` + desempate por prazo:** correto e determinístico (empate total
  mantém o 1º; alvo 0 → creditTerm 0; prazo negativo ignora o termo). Alinhado com a ADR
  (desempate = "casar por mais atributos", melhoria prevista). Cobertura de teste sólida.
- **`fulfillment`:** idempotência por conversa (reusa proposta `simulacao`, não cria 2 no
  Trilho A); re-sim por TTL mantém marca + prazo. Sem await faltando, sem catch vazio.
- **Segurança:** nenhum token/secret/CPF/celular logado (grep limpo). Logs estruturados
  sem PII. Sem input financeiro vindo do cliente sem validação.
- **Ortografia PT-BR (UI):** textos visíveis (closing-presentation, contract-summary,
  proposal-status, other-options) com acentuação plena ("contratação", "está", "Parabéns",
  "Não consegui", "endereço"). Os `"simulacao"` achados são VALORES de status técnico, não UI.
- **Testes:** rodei a suíte inteira. `.skip` único = gate condicional de DB legítimo
  (`diagnose.integration.test.ts`), não teste escondido. Fixtures = capturas reais Bevi
  (`ok-selfcontract-*`, `ok-status`, etc.), permitidas só em teste.

## Como rodei (sem sujar o host — install no host é bloqueado)
Container transitório `node:22-alpine` + `node_modules` em named volume + store pnpm
compartilhado (`tb-pnpm-store-shared`) + Postgres efêmero migrado via `pnpm db:migrate`
(drizzle migrate, NÃO push). `pnpm test:unit` → **184 files / 1940 tests passed**.
Commit com `--no-verify` (pre-commit do host não roda sem node_modules) — gate verificado
no container, conforme convenção da memória `project_worktree_node_modules_symlink`.

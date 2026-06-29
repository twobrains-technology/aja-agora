# Bloco rev-b — Auditoria adversarial (Opus) · adapters/bevi/consórcio/finanças/diagnose

> 2026-06-28 · Revisor adversarial rodando com Opus (modelo certo) sobre código
> escrito por sessões Superset com modelo FRACO. Branch `rev/jornada-bevi`.

## Veredito

**Área auditada exaustivamente — 29 arquivos de produção lidos linha a linha + suíte
rodada num container transitório (PG efêmero migrado, store pnpm compartilhado).
1 bug genuíno encontrado e corrigido via TDD strict. 1 nota de produto registrada
pro Kairo decidir. Gate `pnpm test:unit` VERDE (184 arquivos, 1940 testes).**

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

## NOTA / PENDENTE-KAIRO (não corrigido — decisão de produto)

### Resumo WhatsApp pode exibir "Parcela mensal: R$ 0,00" quando a parcela é ausente
- **Arquivo:** `src/lib/bevi/contract-summary.ts:104` — `monthlyPayment: Number(row.monthlyPayment ?? 0)`.
- **Situação:** se a oferta escolhida no fechamento tiver parcela ausente (→ `null` no
  DB), `Number(null ?? 0) = 0` e `buildContractSummaryText` exibe *"Parcela mensal:
  R$ 0,00"* (idem `creditValue`). No MESMO arquivo, `termMonths` é corretamente
  **omitido** quando não-finito (`Number.isFinite`). A inconsistência é só com
  carta/parcela.
- **Por que NÃO corrigi:** é **copy ao cliente** (check 3 — decisão de produto/UX, não
  erro técnico óbvio) e de probabilidade baixíssima (a API de parceiro praticamente
  sempre devolve parcela no fechamento real). A correção (omitir a linha quando ≤ 0,
  como já se faz com `termMonths`) muda a copy do resumo — **decisão do Kairo**.
- **Recomendação:** alinhar carta/parcela ao tratamento de `termMonths` (omitir quando
  sem fonte > 0) por coerência com D11. Aguarda aval.

### PENDENTE-REV-E (fora do meu escopo — dono `bloco-rev-e`)
- Nenhuma coluna/migration faltando detectada na minha área (verificado read-only:
  `term_months` OK). Nada a delegar pro rev-e.

## O que verifiquei (além dos itens acima)
- **Cálculo financeiro / lance embutido / contemplação:** `computePMT`, `compareWithFinancing`,
  `computeContemplationDial`, `computePlanEstimate`, `beviOfferToQuotaSimulation`
  exercitados com inputs hostis (principal 0, taxa 0, asset 0, budget mínimo, finalValue 0).
  Nenhum NaN/divisão-por-zero vaza. Único caso de NaN: `computeContemplationDial({creditValue: NaN})`
  — mas só com input **já-NaN** (contrato violado a montante, `number` tipado); não é bug
  de runtime alcançável, registro como nota de robustez sem corrigir.
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

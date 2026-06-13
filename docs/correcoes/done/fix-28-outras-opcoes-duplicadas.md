---
id: FIX-28
titulo: "'Quero ver outras opções' mostra cards duplicados — buildOtherOptions não dedupa ofertas equivalentes nem exclui a recomendada por id"
status: done
bloco: bloco-o-outras-opcoes-dedupe
arquivos:
  - src/lib/bevi/other-options.ts
rodada: 2026-06-11 (testes manuais do Kairo no dev, pós-deploy da auditoria do dial)
anotado_em: 2026-06-11
commit: 3dc1fb2
executado_em: 2026-06-12
---

# FIX-28 — "Outras opções" exibe a mesma oferta duplicada

### Palavras do operador

> "cliquei em quero ver mais opcoes e ele mostrou duplicado."

### Cenário exato (print, dev 2026-06-11)

Clique no botão "Quero ver outras opções" (card de decisão) → resposta
"Claro! Essas são as outras opções que encontrei pro seu perfil" + comparativo
com **2 cards IDÊNTICOS**: ÂNCORA · R$ 954/mês · bem R$ 80.000 · prazo 117m.

### Root cause INVESTIGADO

Provado no código — o fluxo é DETERMINÍSTICO (`route.ts` kind
`show-other-options` → `buildOtherOptions`), não há LLM envolvido:

- `src/lib/bevi/other-options.ts:29-31`: o filtro é APENAS
  `g.administradora !== meta.recommendedAdministradora` + `.slice(0, 2)`.
  **Zero dedupe**: se a descoberta Bevi devolve 2+ cotas equivalentes da mesma
  administradora (mesmo grupo, cotas distintas, valores idênticos — comum no
  Trilho B), as duas passam e viram cards visualmente iguais.
- O componente usa `key={group.id}` — ids de cota distintos renderizam os 2
  sem warning.
- **Falta verificar** (DB do dev, conversa do print): o detalhamento aberto em
  seguida era "da ÂNCORA" — se a RECOMENDADA também era ÂNCORA, há um segundo
  defeito: exclusão por NOME de administradora (string) em vez de groupId, ou
  `meta.recommendedAdministradora` não populado. Confirmar com query na
  conversa antes de codar.

### Achado da investigação no DB do dev (2026-06-12 — confirma a hipótese pendente)

Query no DB do dev (`db.aja-feat-jornada-bevi-lance-embutido`):

- `recommendedAdministradora` **ESTÁ populado** pós-reveal (BANCO DO BRASIL ×3,
  ITAÚ ×3, RODOBENS ×1, ÂNCORA ×1 — todas com `recommendedOffer` presente).
- **O meta NUNCA guarda groupId** da cota recomendada: `recommendedGroupId`
  presente em **0/10** conversas. Logo "excluir por groupId" é **impossível
  sem tocar o reveal** (fora do escopo de arquivo do bloco O = só
  `other-options.ts`).
- O `recommendedOffer` (8/10 conversas) traz a chave de equivalência COMPLETA:
  `{administradora, creditValue, termMonths, monthlyPayment}` — ex. conversa
  ÂNCORA `a85e8315`: `{auto, 98m, 150000, ÂNCORA, 1954.55}`. Uso ele pra
  exclusão por equivalência (substituto pragmático e preciso do groupId).
- **Confirmado o 2º defeito**: havendo recomendada ÂNCORA, o filtro atual por
  NOME (`g.administradora !== recommendedAdministradora`) **remove TODAS as
  cotas ÂNCORA** — inclusive ofertas DIFERENTES e válidas da mesma
  administradora — degradando "outras opções" a 0 (throw) OU, se o nome não
  bate (acento/case/undefined), não remove nada e as duplicatas passam.

### Correção proposta

| O quê | Onde |
|---|---|
| Dedupe por chave de equivalência (administradora + creditValue + monthlyPayment + termMonths) ANTES do slice — fica a cota de menor parcela/id estável | `other-options.ts` |
| Excluir a recomendada por `groupId` (id da cota do reveal, guardado no meta), não por nome de administradora | `other-options.ts` (+ meta se precisar guardar o groupId recomendado) |
| Se após dedupe sobrar < 1 "outra", degradar com honestidade (texto "só encontrei essa outra opção" / erro tratado como hoje) | `other-options.ts` |

### Estado da arte (pesquisa web 2026-06-11 — ver `docs/correcoes/2026-06-11-pesquisa-stack-padroes.md`)

- Pipeline canônico valida a proposta: dedupe DETERMINÍSTICO no adapter por
  **chave composta de negócio** antes do dado virar payload de UI — nunca
  delegado ao modelo (que aqui nem participa) nem ao componente.

### Regressão exigida

- Camada 1: unit do `buildOtherOptions` com fixture de captura real contendo
  cotas duplicadas → retorna deduplicado; recomendada excluída por id mesmo
  com nome igual. (Código não-agêntico puro — rota determinística — cassette
  dispensado pela regra do CLAUDE.md; camada 1 cobre.)

### Execução (2026-06-12)

- **Fix em `other-options.ts`:** dedupe por chave de equivalência de negócio
  (`equivKey` = administradora|creditValue|monthlyPayment|termMonths) num loop com
  `break` em 2 (no lugar do `slice(0, 2)`); exclusão da recomendada por
  equivalência via `meta.recommendedOffer` (preciso — o meta não tem groupId,
  confirmado no DB) com fallback por nome quando ausente; degradação honesta
  mantém o throw quando sobra 0.
- **Camada 1:** 3 testes novos em `other-options.test.ts` (dedupe; exclusão por
  equivalência com mesma adm ÂNCORA; degradação) — vistos FALHAR antes (cards
  idênticos / throw por filtro de nome). Os 3 testes anteriores seguem verdes.
- **Camada 2:** atualizado o invariante estrutural em
  `tests/regression/agent-trajectory.test.ts` (acoplamento show-other-options):
  `slice(0, 2)` → `others.length === 2` + asserts de `recommendedOffer`/dedupe.

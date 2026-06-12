---
id: FIX-28
titulo: "'Quero ver outras opções' mostra cards duplicados — buildOtherOptions não dedupa ofertas equivalentes nem exclui a recomendada por id"
status: todo
bloco: bloco-o-outras-opcoes-dedupe
arquivos:
  - src/lib/bevi/other-options.ts
rodada: 2026-06-11 (testes manuais do Kairo no dev, pós-deploy da auditoria do dial)
anotado_em: 2026-06-11
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

### Correção proposta

| O quê | Onde |
|---|---|
| Dedupe por chave de equivalência (administradora + creditValue + monthlyPayment + termMonths) ANTES do slice — fica a cota de menor parcela/id estável | `other-options.ts` |
| Excluir a recomendada por `groupId` (id da cota do reveal, guardado no meta), não por nome de administradora | `other-options.ts` (+ meta se precisar guardar o groupId recomendado) |
| Se após dedupe sobrar < 1 "outra", degradar com honestidade (texto "só encontrei essa outra opção" / erro tratado como hoje) | `other-options.ts` |

### Regressão exigida

- Camada 1: unit do `buildOtherOptions` com fixture de captura real contendo
  cotas duplicadas → retorna deduplicado; recomendada excluída por id mesmo
  com nome igual. (Código não-agêntico puro — rota determinística — cassette
  dispensado pela regra do CLAUDE.md; camada 1 cobre.)

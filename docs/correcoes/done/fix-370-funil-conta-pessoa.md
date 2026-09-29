---
id: FIX-370
titulo: "O funil de mídia conta PESSOA, não conversa"
status: done
bloco: bloco-pessoa
arquivos:
  - src/lib/admin/performance-queries.ts
  - src/lib/admin/performance-types.ts
  - src/lib/admin/sinais-do-funil.ts
commit: 3fe5d63c
executado_em: 2026-09-28
rodada: 2026-09-28 (plano de fechamento da frente de medição/remarketing/base)
---
## Palavras do operador
Kairo, áudio a Bruna em 23/09 15:38: *"as duas telas estão falando coisas diferentes. Eu vou
sintetizar tudo em pessoa, tá?"*. Bruna, áudio de 23/09 16:36: *"se uma pessoa fez cinco simulações,
é uma pessoa só… eu acho que tem que ser pessoa, né?"*.

## Cenário exato
Janela 01/09→21/09, painel de produção:
- Funil de mídia: `conversas 123 · só pré-preenchida 58 · iniciaram 65 · se identificaram 10 ·
  viram oferta 12 · proposta 0 · fechado 0`.
- A Porta, na mesma janela: `2.835 pessoas · 123 conversas · 102 pessoas que conversaram`.
- Percurso (escada, em pessoas): `se identificou 10 · viu oferta 12 · proposta 0`.
Clicar em "Se identificaram" (10 **conversas**) abre a lista do Percurso, que responde por **pessoas**
(8 pararam ali). Mesmo rótulo, populações diferentes.

## Root cause (provado no código)
`computeFunilMidia` (`src/lib/admin/performance-queries.ts:98`) monta um `SELECT` com oito subconsultas
e TODAS contam conversa: `count(DISTINCT c.id)` (`:113` e seguintes). A escada do Percurso conta pessoa
por `chaveDaPessoa(de, ate)` (`src/lib/admin/sinais-do-funil.ts:47`), e `computePorta`
(`performance-queries.ts:265`) já usa essa chave para `pessoas` e `pessoasQueConversaram`. Ou seja: a
definição de pessoa existe e é fonte única — o funil é que não a usa.

## Correção proposta
| O quê | Onde |
|---|---|
| Cada degrau do funil passa a `count(DISTINCT chaveDaPessoa(fromDate, toDate))`, com `JOIN visits v ON v.id = c.visit_id` (a `atribuida` já exige `visit_id NOT NULL`) | `performance-queries.ts:98` — as 8 subconsultas |
| `visitas` continua contando CHEGADAS (sessão) — é o topo do funil de mídia, não degrau de pessoa | idem |
| Rotular a unidade no tipo, para ninguém voltar a misturar | `performance-types.ts` (`EtapaFunilMidia.count` ganha comentário de unidade) |
| Usar a MESMA chave também em `computeOrigens`/`computeCampanhas` (`contagensDoFunil`, `sinais-do-funil.ts:268`) | `sinais-do-funil.ts` + quem consome |

## Regressão exigida
Teste de integração em `performance-queries.integration.test.ts`: dois leads da MESMA pessoa (mesmo
`contact_id` via conversas distintas) ⇒ o degrau conta **1**; e o caso real da cliente: 5 conversas do
mesmo telefone ⇒ 1 pessoa. A suíte que já existe de `computePorta` não pode mudar de valor.

## Execução

As oito subconsultas de `computeFunilMidia` passaram a
`count(DISTINCT chaveDaPessoa(fromDate, toDate))` com `JOIN visits v ON v.id =
c.visit_id` — a mesma chave de `computePorta`. `visitas` continua contando
CHEGADAS (sessão), que é o topo do funil de mídia, não degrau de pessoa.

A troca de `contagensDoFunil` (tabela por origem e por campanha) ficou no FIX-373:
o fragmento é o mesmo, e o teste que ele quebra ("cinco propostas da mesma pessoa
são cinco linhas de proposta") é justamente a regra que o FIX-373 derruba — mudar
aí deixaria dois itens com o mesmo commit.

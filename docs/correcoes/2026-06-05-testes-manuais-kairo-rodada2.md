# ATA — testes manuais do Kairo · RODADA 2 (tarde de 2026-06-05)

> **Controle vivo:** cada fix desta rodada tem arquivo próprio em
> [`todo/`](./todo/) — move pra [`done/`](./done/) quando executar (fluxo no
> [`README.md`](./README.md)). Este arquivo é só a ata da sessão.

## Contexto

Re-teste em tela APÓS o deploy do lote 1 (FIX-1..FIX-10, ver
[ata da rodada 1](./2026-06-05-testes-manuais-kairo.md) e `done/`), na branch
`feat/jornada-bevi-lance-embutido`. O Kairo percorreu a jornada completa de novo
(moto, R$ 40 mil, ~8 meses, R$ 800/mês, sem lance) e perguntou "qual status da
proposta?" depois do fechamento — o comportamento descarrilhou.

> "Não faz sentido nenhum como que se comportou aqui, tá? E a gente tem que corrigir.
> Por que mostrou dois consórcios diferentes? Isso daí é um erro que não é aceitável.
> [...] O agente ainda está muito ruim."

## Fixes anotados nesta rodada (organizados em blocos paralelizáveis — Superset)

| Onda | Bloco | Fix | Arquivo |
|---|---|---|---|
| 1 | A — agent core | FIX-11 — Pós-fechamento amnésico | [`todo/bloco-a-agent-core/fix-11-pos-fechamento-amnesico.md`](./todo/bloco-a-agent-core/fix-11-pos-fechamento-amnesico.md) |
| 1 | A — agent core | FIX-12 — `contract_form` sequestrou o identify | [`todo/bloco-a-agent-core/fix-12-contract-form-sequestra-identify.md`](./todo/bloco-a-agent-core/fix-12-contract-form-sequestra-identify.md) |
| 1 | C — UI fechamento | FIX-13 — Card de confirmação sem prazo | [`todo/bloco-c-ui-fechamento/fix-13-card-confirmacao-sem-prazo.md`](./todo/bloco-c-ui-fechamento/fix-13-card-confirmacao-sem-prazo.md) |
| 1 | B — status tool | FIX-14 — Tool `check_proposal_status` | [`todo/bloco-b-status-tool/fix-14-tool-status-proposta.md`](./todo/bloco-b-status-tool/fix-14-tool-status-proposta.md) |

**Onda única: A ∥ B ∥ C — 3 worktrees simultâneos no Superset.** A×B têm overlap
textual esperado (prompt + cassettes, seções diferentes) — ordem de merge
recomendada A → B (B resolve, mecânico). C é disjunto. Manifestos com prompt de
lançamento: `_bloco.md` em cada pasta.

## Decisões/descobertas transversais da sessão

- **Próxima feature documentada**: jornada até o pagamento do boleto (mesa Bevi,
  comissão no 1º pagamento A CONFIRMAR, telas CONEXIA, gaps G1-G5) →
  [`../jornada/jornada-ate-boleto.md`](../jornada/jornada-ate-boleto.md).
- **POC do `consult_proposal_status` executada** (2 rodadas): telas CONEXIA e API de
  Parceiro compartilham a MESMA máquina de estados; inserção na administradora não
  roda em 4-5h; proposta abandonada fica `pending` indefinidamente; shape sem campos
  de boleto/pagamento; erro 404 tipado. Detalhes na seção 4 do doc da feature.
- **Shape da oferta de parceiro verificado AO VIVO**: 8 campos, sem `term` — a
  diferença de parcela CANOPUS (R$ 469,95) × BB (R$ 2.872,71) é 100% prazo
  (17 meses × ~98+). Detalhes no FIX-13.
- Propostas reais criadas no teste: `6a230bb1…bd089b` e `6a22d4fb…83c282` (CANOPUS
  4400) — em observação pro G1 (re-poll pra capturar estados pós-inserção).

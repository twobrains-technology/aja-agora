---
id: FIX-13
titulo: "Card 'Confirmado com a CANOPUS' sem prazo: parcela parece 'errada' e o componente não se explica"
status: done
bloco: bloco-c-ui-fechamento
arquivos:
  - src/components/chat/artifacts/real-offer.tsx (copy honesta)
  - src/components/chat/artifacts/real-offer.test.tsx (Camada 1)
  - src/lib/bevi/closing-presentation.test.ts (Camada 1, guard no lib)
  - tests/regression/agent-trajectory.test.ts (Camada 2, FIX-13-PRAZO-SEM-FONTE)
  - tests/eval/bevi-partner-offer-shape.eval.test.ts (contrato opt-in)
rodada: 2026-06-05 tarde (re-teste pós-lote-1)
anotado_em: 2026-06-05
commit: 0914ab8
executado_em: 2026-06-05
---

# FIX-13 — Card "Confirmado com a CANOPUS" sem prazo: parcela parece "errada" e o componente não se explica

### O que o Kairo viu (palavras dele)

> "E por que ele mostrou essa parcela muito baixa? […] veja a discrepância para a
> parcela do outro que ele mandou. Aqui não tá falando o número de meses, né? Pode ser
> essa a diferença? Ah, vi ali — são 17 meses o último. Mas de qualquer forma está
> estranho esse componente."

### Análise (números conferidos)

- CANOPUS: R$ 46.000 ÷ R$ 469,95 ≈ **98 parcelas** (+ taxa adm ⇒ prazo efetivo na
  casa de ~110-120 meses). BANCO DO BRASIL (card do FIX-11): R$ 35.543 em **17
  meses** ⇒ R$ 2.872,71/mês. **Os dois números são reais da Bevi — a discrepância é
  100% prazo**, exatamente a hipótese do Kairo.
- O card compacto não mostra prazo porque **a oferta da API de Parceiro não tem o
  campo `term`** — ela devolve só 8 campos (`bevi-api-parceiro-spec.md` §7; o trilho
  B da descoberta tem 68, incluindo prazo). Limitação de FONTE conhecida e documentada.
- **VERIFICADO AO VIVO em 2026-06-05 ~19h UTC** (questionamento do Kairo: "tem certeza
  que a API não tá retornando a qtd de meses?"): simulação real re-executada
  (MOTOS, R$ 40.000) → 11 ofertas, todas com EXATAMENTE 8 chaves
  (`administradora, grupo, ofertaId, parcela, quotaId, taxaContemplacao, tipoOferta,
  valorCarta`) — **nenhum campo de prazo/meses/term**. Inclusive a própria cota
  CANOPUS grupo 4400 / carta R$ 46.000 veio sem prazo (e com parcela R$ 623,29 nesta
  simulação vs R$ 469,95 no fechamento do teste — a MESMA cota muda de parcela
  conforme os params da simulação, consistente com spec §8).
- **Como garantir continuamente**: adicionar um teste de CONTRATO opt-in (roda só com
  `BEVI_API_TOKEN`, fora do PR) que simula 1× e falha/avisa se o shape da oferta
  ganhar ou perder campos — o dia que a AGX incluir `term`, a gente fica sabendo no
  mesmo dia e promove o campo pro card.
- Regra de produto (D11/correções rodada 1): **nenhum número sem fonte real** — não
  podemos derivar/estimar o prazo e exibir como dado da administradora.

### Correção proposta (decisão de produto a tomar na estruturação)

| Opção | Trade-off |
|---|---|
| (a) Copy honesta no card: "Prazo e demais condições: na sua proposta (PDF)" + link | zero risco de número errado; UX ainda incompleta |
| (b) Derivar nº de parcelas de `valorCarta ÷ parcela` com selo "≈ estimado" | número aproximado visível; arrisca confundir (não inclui taxa) |
| (c) Pedir à AGX/Bevi pra incluir `term` na oferta de parceiro | resolve na raiz; depende de terceiro |

Encaminhamento sugerido: (a) agora + (c) em paralelo. (b) só com selo explícito e
aval do Kairo. **Obs.:** com o FIX-12 corrigido, o usuário SEMPRE verá o card completo
(com prazo, do trilho B) antes do fechamento — o card compacto volta a ser só uma
CONFIRMAÇÃO de algo já visto, o que reduz (mas não elimina) o problema.

### Regressão exigida

- Camada 1: teste do componente de confirmação — nunca renderizar prazo sem fonte;
  copy escolhida presente.
- Camada 2: cassette garantindo que o agente não inventa prazo em texto ao apresentar
  a oferta real (detector de "\d+ meses" sem fonte).

### Execução (2026-06-05, commit 0914ab8)

- **Opção (a) aplicada** (recomendada no encaminhamento): copy honesta no card —
  "Prazo e demais condições: na sua proposta (PDF), logo após a confirmação."
  Sem link no card 5.1 porque `consortiumProposalLink` só existe APÓS o
  `confirmOffer()` (5.2), onde o signature-handoff já abre o PDF.
- TDD strict: teste da copy escrito primeiro e visto FALHAR; guard-rails
  (componente + lib + cassette) travam que ninguém derive `valorCarta ÷ parcela`.
- Contrato opt-in executado 1× contra a API real na implementação: **11 ofertas,
  todas com exatamente os 8 campos** — verde em 2026-06-05. Entra no nightly eval
  (`tests/eval/`, roda só com `BEVI_API_TOKEN`); quando a AGX incluir `term`, o
  teste falha com instrução de promover o campo pro card.
- **Opção (c) segue em aberto** (pedir `term` à AGX/Bevi) — ação humana, fora do código.

---
id: FIX-39
titulo: "Prazo REAL da oferta de parceiro no card de confirmação e no resumo — aposenta a copy de desculpa do FIX-13"
status: todo
bloco: bloco-u-campos-novos-bevi
arquivos:
  - src/lib/adapters/bevi/partner-offer-mapper.ts (prazo → termMonths; deixa de ser GAP)
  - src/lib/adapters/bevi/partner-offer-mapper.test.ts
  - src/lib/bevi/closing-presentation.ts (termMonths no payload do real_offer)
  - src/lib/chat/types.ts (RealOfferPayload.termMonths opcional)
  - src/components/chat/artifacts/real-offer.tsx (linha "Prazo: NN meses" condicional)
  - src/components/chat/artifacts/real-offer.test.tsx
  - src/lib/bevi/contract-summary.ts (prazo no resumo WhatsApp pós-contratação)
rodada: 2026-06-12 (descoberta da API nova da Bevi — captura live na proposta 6a2be7b1)
anotado_em: 2026-06-12
---

# FIX-39 — Prazo real no fechamento (gap do FIX-13 deixou de existir)

## Palavras do operador

> "bora usar tudo que for possivel, anota no todo blocks com as melhorias que
> podemos fazer com os campos novos. nao precisamos perguntar nada para eles"

## Cenário exato

O FIX-13 inteiro existiu porque a oferta de parceiro (8 campos) NÃO trazia
prazo — o RealOffer mostra a copy de desculpa "Prazo e demais condições: na
sua proposta (PDF)" e o episódio CANOPUS R$ 469/mês vs BB R$ 2.872/mês ficou
inexplicável na tela (era 100% diferença de prazo invisível). A API nova
(2026-06-12) devolve `prazo: 72` (meses) na oferta.

## Root cause INVESTIGADO

Não é bug — é dado novo. Captura live (re-simulação na proposta 6a2be7b1,
loja-piloto): oferta com `prazo: 72`. Campo OPCIONAL no nosso tipo
(`PartnerOffer.prazo?`, já tipado no commit 67f7a73) porque o shape antigo
não o tinha. O mapper hoje seta `termMonths: undefined` explicitamente
("GAPs deste trilho") — o gap acabou.

## Correção proposta

| O quê | Onde |
|---|---|
| `termMonths: offer.prazo` (defensivo: só quando `Number.isFinite`) — remover o comentário de GAP do prazo | `partner-offer-mapper.ts` |
| `termMonths` no payload do real_offer | `closing-presentation.ts`, `types.ts` |
| Linha "Prazo: NN meses" no card, condicional à presença (ausente → copy do FIX-13 PERMANECE como fallback — API pode voltar atrás) | `real-offer.tsx` |
| "Prazo: NN meses" no resumo WhatsApp quando disponível | `contract-summary.ts` |

## Regressão exigida

- **Camada 1**: mapper (prazo presente → termMonths; ausente → undefined);
  card com termMonths renderiza a linha, sem termMonths mantém a copy do
  FIX-13 e não morre; resumo com/sem prazo.
- **Camada 2**: não aplicável (sem comportamento de agent — render/mapper).
- **Camada 3**: sem mudança.

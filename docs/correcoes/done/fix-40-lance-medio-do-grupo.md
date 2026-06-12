---
id: FIX-40
titulo: "lanceMedio do grupo — feedback honesto sobre o lance do usuário + âncora real no dial de contemplação"
status: done
commit: 84bfaf8
executado_em: 2026-06-12
bloco: bloco-u-campos-novos-bevi
arquivos:
  - src/lib/adapters/bevi/partner-offer-mapper.ts (lanceMedio → avgBidValue)
  - src/lib/adapters/bevi/partner-offer-mapper.test.ts
  - src/lib/bevi/closing-presentation.ts (avgBidValue no payload + frase de posição do lance)
  - src/lib/chat/types.ts (RealOfferPayload.avgBidValue opcional)
  - src/components/chat/artifacts/real-offer.tsx (linha "Lance médio do grupo" condicional)
  - src/components/chat/artifacts/real-offer.test.tsx
  - src/lib/agent/orchestrator/dial-payload.ts (âncora de lance real quando disponível)
  - tests/regression/agent-trajectory.test.ts (cassette se houver texto de agent)
rodada: 2026-06-12 (descoberta da API nova da Bevi — captura live na proposta 6a2be7b1)
anotado_em: 2026-06-12
---

# FIX-40 — Lance médio do grupo: a fonte que faltava pra falar de lance com número

## Palavras do operador

> "bora usar tudo que for possivel (...) nao precisamos perguntar nada para eles"

## Cenário exato

O FIX-8 MATOU o "lance estimado" (R$ 0,00 / fallback 43%) porque não existia
fonte real — desde então o produto coleta `lanceValue` do usuário no gate e
não devolve NADA com ele (regra D11: nenhum número sem fonte). A API nova
devolve `lanceMedio: 69361.27` (R$) por oferta/grupo — captura live na
proposta 6a2be7b1. Caso real da jornada do Kairo: lance declarado R$ 117 mil
vs lanceMedio R$ 69 mil do grupo — posição forte, e o produto ficou mudo.

## Root cause INVESTIGADO

Dado novo (não-bug). Campo opcional já tipado (`PartnerOffer.lanceMedio?`,
commit 67f7a73), não consumido. Semântica: usar o rótulo LITERAL do campo
("lance médio do grupo") sem prometer contemplação — decisão do Kairo:
não perguntar semântica fina pra Bevi/AGX; honestidade pelo rótulo.

## Correção proposta

| O quê | Onde |
|---|---|
| `avgBidValue: offer.lanceMedio` (defensivo, Number.isFinite) | `partner-offer-mapper.ts` |
| Linha "Lance médio do grupo: R$ X" no card de confirmação, condicional | `real-offer.tsx`, `types.ts`, `closing-presentation.ts` |
| Posição do lance do usuário: quando `meta.qualifyAnswers.lanceValue` existe E avgBidValue presente, frase comparativa honesta no texto do fechamento ("seu lance de R$ Y fica acima/abaixo do lance médio desse grupo, R$ X") — SEM prometer contemplação | `closing-presentation.ts` |
| Dial de contemplação: âncora `avgBidValue` no payload quando o snapshot da oferta a tiver — cenários de lance do P4 ganham referência real | `dial-payload.ts` |
| PROIBIDO: derivar probabilidade/“chance de contemplar” do lanceMedio (semântica não confirmada — só comparação factual) | — |

## Regressão exigida

- **Camada 1**: mapper; card com/sem avgBidValue; frase comparativa (acima/
  abaixo/ausente); dial payload com âncora quando disponível.
- **Camada 2**: cassette do fechamento com lance declarado → texto contém a
  comparação factual e NÃO contém promessa de contemplação ("será
  contemplado", "garante", "chance de X%").
- **Camada 3**: critério na rubrica: comparação de lance presente quando há
  dado, zero promessa de contemplação.

## Executado — decisões e escopo

- Mapper/card web/closing/dial conforme spec. Frase de posição factual em
  `closing-presentation.realOfferPresentation(result, { declaredLanceValue })`,
  ligada no `route` web via `meta.qualifyAnswers.lanceValue`. Detector
  anti-promessa (`/contempl|garant|chance/`) na Camada 2.
- **Dial**: `offerSnapshotFromArtifact`/`coerceDialPayload` propagam
  `avgBidValue` quando o artifact-âncora o carrega (defensivo, padrão FIX-C2) —
  âncora pronta; nenhum artifact da Descoberta o carrega hoje, então só dispara
  quando a fonte existir (nunca inventa).
- **Paridade de canal (FIX-25)**: card `real_offer` do WhatsApp ganhou a linha
  "Lance médio do grupo" (rótulo literal). A frase comparativa textual
  (acima/abaixo) ficou só no web — o WhatsApp mostra o número do grupo no card;
  comparação textual no WA é refinamento futuro se o Bernardo quiser.
- Commit único `test+feat:` 84bfaf8.

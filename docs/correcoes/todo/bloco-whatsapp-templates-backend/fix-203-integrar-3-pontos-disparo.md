---
id: FIX-203
titulo: "Rotear os 3 pontos de disparo da confirmação por resolveAndSend (usageKey)"
status: todo
severidade: alta
projeto: aja-agora
arquivos:
  - src/lib/whatsapp/interactive-handlers.ts
  - src/lib/bevi/contract-summary.ts
rodada: 2026-07-02 — feature cadastro/envio de Message Templates Meta oficial
---
## Palavras do operador
> "essa é a mensagem de confirmação de contratação pelo whatsapp" — o operador quer mapear
> ONDE cada template é usado.

## Cenário exato
- **Rota/tela:** `handleOfferConfirm` (clique no botão `offer_confirm`) e o resumo pós-fechamento.
- **Passos:** 1) cliente confirma a oferta; 2) hoje dispara `closingPresentation` ("Parabéns!"),
  `sendContractSummary` ("Resumo da sua contratação ✅") e `signatureHandoffToWhatsApp`
  ("Sua proposta está pronta! 🎉") como texto livre; 3) precisa passar a rotear por `resolveAndSend`.

## Esperado × Atual
- **Esperado:** cada disparo referencia um `usageKey` (`confirmacao_contratacao`, `resumo_contratacao`,
  `proposta_pronta`) e usa o texto livre atual como `freeTextFallback` (dentro da janela).
- **Atual:** enviam texto livre direto, sem consultar janela nem template.

## Root cause (INVESTIGADO)
Mapa do Explore (2026-07-02): disparo em `interactive-handlers.ts:150-184` (`handleOfferConfirm`)
→ `closingPresentation` (`bevi/closing-presentation.ts:96-135`, inclui `signatureHandoff` e
"Parabéns!") consumido em `interactive-handlers.ts:159-171`; `sendContractSummary`
(`bevi/contract-summary.ts:65-149`) disparado em `interactive-handlers.ts:175-176` enviando
pra `55${identity.celular}`. Nenhum passa por verificação de janela.

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| Rotear a confirmação/resumo/handoff por `resolveAndSend({usageKey, params, freeTextFallback, to, waId})` — a copy de texto livre atual vira o `freeTextFallback` | `src/lib/whatsapp/interactive-handlers.ts` |
| `sendContractSummary` passa a delegar o envio ao `resolveAndSend` (mantendo o texto atual como fallback dentro da janela; fora da janela usa o template `resumo_contratacao`) | `src/lib/bevi/contract-summary.ts` |
| Definir os `usageKey` canônicos usados (documentar no `.done/`): `confirmacao_contratacao`, `resumo_contratacao`, `proposta_pronta` | ambos |

## Regressão exigida
Camada 1 (integração, `sendTemplate`/`sendTextMessage` mockados + DB de teste):
- com janela ABERTA, a confirmação sai como texto livre (a copy atual intacta — assert do texto);
- com janela FECHADA e template `resumo_contratacao` APPROVED, sai como template (assert `sendTemplate` chamado, texto livre NÃO enviado);
- com janela FECHADA e template não aprovado, enfileira (assert linha `pending` em `whatsappOutboundQueue`).
Sem cassette (a copy do agente não muda; disparo é determinístico).

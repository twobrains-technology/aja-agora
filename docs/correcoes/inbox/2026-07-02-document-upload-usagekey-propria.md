# Bug (edge) — convite de RG/CNH pulado fora da janela 24h (usageKey compartilhada)

- **Data:** 2026-07-02 · **Achado em:** revisão da documentação pelo WhatsApp (pós-fix do 9º dígito do celular) · **Superfície:** fechamento Passo 5.2 no WhatsApp (`interactive-handlers.ts` → `handleOfferConfirm` → loop de `closingPresentation`)
- **Severidade:** baixa — o documento é OPCIONAL e o Passo 5.2 quase sempre roda em **janela 24h ABERTA** (é disparado pelo clique do usuário no card real), onde tudo sai corretamente. Só morde no caso raro da confirmação cair FORA da janela (vira template Meta).
- **Decisão do Kairo (2026-07-02):** deixar como está por agora — NÃO criar template Meta novo às cegas só pra cobrir esse edge. Registrado pra decidir com calma se vale o esforço de infra/aprovação Meta.

## Cenário
Depois do fechamento (Passo 5.2), o `closingPresentation` devolve, nesta ordem:
`text (reforço)` → `signature_handoff` → `document_upload` → `text (Parabéns)`.

No loop de `handleOfferConfirm` (`interactive-handlers.ts`), cada item vira uma mensagem via
`resolveAndSend(usageKey)`. O `document_upload` sai com a usageKey **default**
`"confirmacao_contratacao"` — a MESMA do texto de reforço (só `signature_handoff` troca pra
`"proposta_pronta"`).

- **Janela ABERTA (caso normal):** `resolveAndSend` usa `freeTextFallback` (manda a copy real) e
  `result.channel === "free_text"` → NÃO adiciona a chave a `templatedKeys`. Todos os itens saem,
  inclusive o convite de documento. ✅
- **Janela FECHADA (edge):** o reforço vira template Meta `confirmacao_contratacao` e adiciona a
  chave a `templatedKeys`. Quando chega o `document_upload` (mesma usageKey), o guard
  `if (templatedKeys.has(usageKey)) continue;` **PULA o convite** — o cliente nunca é avisado que
  pode mandar o RG/CNH. (O "Parabéns!" também é pulado, mas isso é a dedup INTENCIONAL de vários
  textos `confirmacao_contratacao` num único template; o `document_upload` é colateral.)

## Causa raiz
O `document_upload` não tem usageKey própria — herda a default `"confirmacao_contratacao"` e é
deduplicado junto com os textos de reforço/Parabéns fora da janela. É uma mensagem
SEMANTICAMENTE distinta (convite de envio de documento), não um reforço da confirmação.

## Correção proposta (a decidir)
- Dar ao `document_upload` uma usageKey própria (ex.: `"envio_documentos"`) no loop de
  `handleOfferConfirm` — assim não é deduplicado contra o reforço.
- **Depende de decisão de produto/infra:** fora da janela 24h essa nova usageKey precisa de um
  **template Meta aprovado** próprio (senão o `resolveAndSend` não tem o que enviar e o convite cai
  no enfileiramento/fallback). Como o doc é opcional, talvez não valha o esforço de aprovação Meta —
  avaliar custo × benefício.
- Alternativa mais barata: manter a copy do documento embutida no próprio template
  `confirmacao_contratacao` (sem mensagem separada) — cobre a janela-fechada sem template novo.

## Regressão exigida (quando for corrigir)
Camada 1 estrutural: teste do loop de `handleOfferConfirm` com janela FECHADA (mock do
`resolveAndSend` retornando `channel !== "free_text"`) asserindo que o `document_upload` NÃO é
pulado (a copy do RG/CNH é enviada/enfileirada). Espelhar a paridade com o web (`route.ts`
offer-confirm) se aplicável.

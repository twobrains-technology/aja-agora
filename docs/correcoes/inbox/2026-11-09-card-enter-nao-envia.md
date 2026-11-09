---
slug: card-enter-nao-envia
titulo: "No card de preenchimento, apertar Enter depois de preencher não envia; o lead tem que clicar no botão"
status: inbox
severidade: media
projeto: aja-agora
rodada: 2026-11-09
evidencia: []          # sem print nesta anotação (o card é o mesmo do bug 15)
mexe_em:
  - src/components/chat/artifacts/contract-form.tsx (botão type="button" + onClick={submit} na linha ~133; sem <form> nem onKeyDown)
  - src/components/chat/artifacts/telefone-do-desbloqueio.tsx (onSubmit só no botão, ~171)
  - src/components/chat/artifacts/whatsapp-optin.tsx (handleAccept só no botão, ~145)
  - (já tratam Enter: name-prompt.tsx:82 e value-picker.tsx:226 — usar como referência)
---

## Palavras do operador
> "outro problema de usabilidade no card é que, por exemplo, eu terminei de preencher o CPF e o celular, quando eu dou um enter, ele não faz o envio da resposta ali para o chat, e aí o cara tem que clicar no botão."

## Cenário
- **Rota/tela:** chat web, card "Vamos confirmar seu plano" (CPF + Celular).
- **Passos:** 1) preencher CPF e celular 2) apertar Enter no campo 3) nada acontece; só o clique em "Fazer a proposta" envia.

## Esperado × Atual
- **Esperado:** Enter em qualquer campo do card envia, quando os campos estão válidos (mesmo critério do botão). Comportamento igual em todos os cards de preenchimento.
- **Atual:** `contract-form`, `telefone-do-desbloqueio` e `whatsapp-optin` só enviam por clique; `name-prompt` e `value-picker` já tratam Enter.

## Pista de causa (A CONFIRMAR)
Falta de `<form onSubmit>` (ou `onKeyDown` de Enter) nesses cards. Mais limpo: envolver os campos em `<form>` com o botão `type="submit"`, para o Enter e a acessibilidade vir do navegador, mantendo a guarda de envio duplo já existente (`submittingRef`). Cuidado: com `<form>`, o Enter só envia se o botão não estiver `disabled`; alinhar com o bug 15 (campos e botão habilitados quando o card monta).

## Ligação
Mesma família e mesmos componentes dos bugs 13 (card velho depois de respondido) e 15 (foco e atraso): os três pedem um comportamento ÚNICO para todos os cards de preenchimento. Sugestão de desenho: um hook/componente comum (`useCardDePreenchimento`: foco ao montar, habilitado ao montar, Enter envia, selado depois de respondido) em vez de corrigir cada card isolado. Um worker só para 13, 15 e 16.

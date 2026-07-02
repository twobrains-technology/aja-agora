---
slug: chip-descarta-texto-digitado
titulo: "Chip de categoria na landing descarta o texto livre digitado (perde orçamento)"
status: inbox
severidade: media
projeto: aja-agora
rodada: 2026-07-02 — QA dono-de-produto, AUTO web contra PRODUÇÃO (ajaagora.com.br)
evidencia:
  - _evidencia/auto-web-chip-descarta-texto.png
mexe_em:
  - src/components (hero / landing chat form)
---

## Palavras do operador
> "QA dono-de-produto — repara em toda fricção e toda promessa que quebra confiança."

## Cenário
- **Rota/tela:** https://ajaagora.com.br — hero (form da landing).
- **Passos:** 1) digitar no textbox "Quero comprar um carro de uns R$ 70 mil, gastando perto de R$ 900 por mês." 2) clicar no chip **Carro** 3) clicar **Enviar**.
- **Dados usados:** texto livre com valor + orçamento.

## Esperado × Atual
- **Esperado:** o texto digitado (com o orçamento) é enviado ao agente — ou o chip apenas complementa a categoria sem apagar o texto.
- **Atual:** ao selecionar o chip e enviar, o POST `/api/chat` envia um **canned** `"Quero trocar de carro."`, **descartando** o texto do usuário (o orçamento R$ 70k / R$ 900 se perde). O agente então tem que re-perguntar tudo.
- **Contraste (caminho que funciona):** enviar **sem** clicar em chip preserva o texto — o POST envia a frase íntegra e o Rafael reconhece "carro de R$ 70 mil". Confirmado nos dois runs (chip = canned; texto puro = íntegro).

## Impacto de UX
O chip é grande e proeminente no mobile; é natural o usuário digitar e depois tocar o chip para "confirmar carro". Nesse gesto ele perde silenciosamente o que escreveu — contra a promessa central "diga o que quer e quanto cabe no mês".

## Pista de causa (A CONFIRMAR — não investigado a fundo)
O handler do chip provavelmente seta uma mensagem pré-definida por categoria e o `onSubmit` prioriza o chip sobre o valor do textbox. Ajustar para: se há texto, envia o texto (categoria vira metadado); se não há texto, usa o canned do chip.

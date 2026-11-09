---
slug: card-preenchimento-fica-velho
titulo: "Card de preenchimento (valor, nome, celular) continua ativo e com o estado inicial depois que o lead já respondeu"
status: inbox
severidade: media
projeto: aja-agora
rodada: 2026-11-09
evidencia:
  - _evidencia/card-preenchimento-fica-velho-print.png
mexe_em:
  - src/components/chat/artifacts/value-picker.tsx (linhas ~111-119 `respondidoNaConversa`, ~179 `return null`)
  - src/components/chat/artifacts/name-prompt.tsx
  - src/components/chat/artifacts/whatsapp-optin.tsx / telefone-do-desbloqueio.tsx
  - src/components/chat/artifact-renderer.tsx (selo de "já consumido")
---

## Palavras do operador
> "depois que escolhe o dado no card, ou fica o estado salvo, ou some com esses específicos de preenchimento daí"

## Cenário
- **Rota/tela:** chat web, card "Valor do bem / Parcela por mês" (value_picker).
- **Passos:** 1) o agente mostra o card (default R$ 80.000) 2) o lead responde "Uns R$ 240 mil" (a bolha dele aparece abaixo) 3) o card continua na tela com 80.000 e o botão "Ver cartas nesse valor" apagado.
- **Print:** `_evidencia/card-preenchimento-fica-velho-print.png`.

## Esperado × Atual
- **Esperado:** depois que o lead respondeu (pelo card ou digitando), o card de preenchimento tem UM de dois destinos: (a) fica salvo, em modo leitura, mostrando o que foi escolhido (240.000), sem botão ativo; ou (b) some. A escolha entre (a) e (b) é a regra do operador: "ou um, ou outro"; o que não pode é ficar com o estado inicial e enganoso.
- **Atual:** o card fica vivo, com o valor default e botão desabilitado, contradizendo a bolha do lead logo abaixo.

## Pista de causa (A CONFIRMAR)
O `value-picker.tsx` já tem uma regra para isso (`respondidoNaConversa`, linhas ~111-119, que dá `return null` na ~179 quando aparece mensagem de usuário nova), então a regra existe e NÃO está pegando neste caso: ver como `conhecidos`/`idsDeUsuario` são calculados (resposta digitada vs resposta por clique; histórico retomado) e se os outros cards de preenchimento (name-prompt, whatsapp_optin, telefone_desbloqueio) têm regra equivalente. Preferir um comportamento único e simples para todos os cards de preenchimento.

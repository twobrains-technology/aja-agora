---
id: FIX-340
titulo: "CPF pedido 2× (com desculpa fabricada) + botão 'Tenho interesse!\\n\\n' quebrado + números divergentes simulação × proposta"
status: todo
bloco: bloco-c-whatsapp-invariantes
arquivos:
  - src/lib/whatsapp/identify-capture.ts
  - src/lib/agent/system-prompt.ts
  - src/lib/whatsapp/interactive-handlers.ts
rodada: 2026-07-14 — loop-de-goal desamarra, rodada 1
---

# FIX-340 — três defeitos menores do WhatsApp (mesmo canal, mesmos arquivos)

## a) CPF pedido duas vezes, com desculpa inventada
Dossiê auto: o agente pede o CPF de novo e **fabrica uma justificativa** — "não consigo ver
dados anteriores" — que **não existe em lugar nenhum do código**. É alucinação pura.
Root cause: `identify-capture.ts:123` devolve `handled:false` quando o CPF já foi coletado, e o
turno cai no modelo sem o fato de que a identidade JÁ existe.
→ O contexto do turno tem que dizer ao modelo que a identidade já está coletada.

## b) Botão quebrado: `"Tenho interesse!\n\n"`
O título do botão vem com quebras de linha. Root cause achado pelo juiz: **contradição literal
dentro do próprio system-prompt** — a linha ~203 PROÍBE nomear o botão e a linha ~559 MANDA
nomear. Resolva a contradição (uma das duas sai) e limpe o título (`trim`).

## c) Números divergentes entre a simulação e a proposta real
Dossiê serviços: a simulação mostra um valor e a proposta criada tem outro. Root cause:
`interactive-handlers.ts:512-536` usa o valor NATIVO do catálogo em vez do valor-alvo do
usuário. (Em moto o mesmo sintoma foi visto, mas o juiz registrou como HIPÓTESE — confirme
antes de mexer.)

## Regressão exigida
- (a) Integração: identidade já coletada → o agente NÃO pede o CPF de novo.
- (b) Unit: título do botão sem `\n`; o system-prompt não se contradiz (teste estrutural).
- (c) Integração: o valor da proposta criada == o valor da simulação apresentada.

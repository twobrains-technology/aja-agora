---
data: 2026-09-28
titulo: "A forma do toque sai do que já está gravado (FIX-380) — sem coluna nova"
status: aceita
decisor: executor do bloco-toques (técnico, com evidência de código) — sem trade-off de produto em aberto
contexto: bloco-toques (`feat/toques-lista`), FIX-380 — "e como que foi?"
---

# ADR — FIX-380: a forma do toque é DERIVADA do banco, não uma coluna nova

O dono perguntou, na reunião de 22/09: *"já foram enviados oito — para quem que foi? E como que
foi? Foi o primeiro toque, o segundo ou o terceiro?"* O FIX-380 responde a segunda metade: se o
toque saiu como **turno de retomada** (o agente falou, dentro da janela de 24 h do cliente) ou como
**template** (fora dela) — e, neste caso, se já saiu ou se ainda está na fila esperando a Meta
aprovar.

A ordem do bloco era **reuso primeiro**: derivar a forma de `messages.template_name` +
`whatsapp_outbound_queue` e **só pedir migration se o reuso não cobrisse o caso**. A investigação
deste card achou o caminho completo — e uma lacuna pequena, nomeada abaixo. **Não foi criada
coluna.**

## O que o desenho do envio de fato grava (lido no código, não suposto)

| Caminho do toque | Onde está no código | Rastro que deixa |
|---|---|---|
| Fora da janela + template `APPROVED` | `template-dispatch.ts:148` (`sendTemplate`) | **nenhum** — não grava mensagem nem fila |
| Fora da janela + template não aprovado | `template-dispatch.ts:157` (`enqueue`) | linha em `whatsapp_outbound_queue` (`pending`); vira `sent` quando a fila esvazia |
| Dentro da janela (turno de retomada) | `remarketing-cycle.ts:994-1005` | mensagem `assistant` em `messages`; `conversations.metadata.retomada` |

Duas conclusões que decidem o card:

1. **`messages.template_name` NÃO serve como evidência do toque da régua.** O único escritor dessa
   coluna é a rota do painel do atendente
   (`src/app/api/admin/conversations/[id]/message/route.ts:201`). O ciclo de remarketing envia
   template por `template-dispatch`, que não grava mensagem — então confiar só nessa coluna daria
   "template" para o disparo manual e "nada" para o toque automático. Ela entra na derivação (é a
   evidência declarada do card e cobre o dia em que a régua passar a gravar), mas **quem responde
   pelo toque automático é a fila**.
2. **O formato do toque é distinguível pela presença/ausência de fala do agente.** O envio por
   template não grava mensagem no histórico justamente porque não é uma conversa: quem fala é a
   Meta. Então "há uma mensagem do agente logo depois do toque" ⇒ turno de retomada; "não há" ⇒
   template. A consulta ancora isso no `ultimo_toque_em` e descarta a mensagem que vem depois de um
   inbound do cliente (`NOT EXISTS` de `role='user'` no intervalo) — senão a resposta do agente a
   um cliente que escreveu na janela contaria como toque.

## A lacuna, nomeada e tratada como tal

**Envio direto de template aprovado não deixa rastro nenhum** — nem fila, nem mensagem. Quando os
templates `remarketing_oportunidade_*` estiverem `APPROVED`, os toques 02/03 (que saem fora da
janela) caem nesse caminho.

O reuso cobre esse caso **com uma leitura a mais**: `whatsapp_templates`, pelo `usageKey` do bem
(`templateDoObjetivo`, a mesma função que o motor usa — não uma segunda cópia da chave). Com o
template aprovado e sem fila e sem fala, a forma é `template`, com o nome.

O que **continua** sem resposta é o toque que não deixou rastro de NADA (envio que morreu entre o
`gravar` e o `sendTemplate`, ou template aprovado cujo nome saiu do cadastro). Para esses a forma é
`nao_registrado` — e essa é a decisão de desenho que o card pedia: **nunca "texto livre" por
omissão**. Não ter o dado não é o mesmo que ter o dado "não", a mesma disciplina do
`estadoHonestoDaRegua` e do `SemDados` do painel.

## Por que uma coluna seria pior aqui, e não só mais caro

- **Ela nasceria NULL para todo o histórico.** O próprio card antecipa o problema ("a tela diz que
  o histórico anterior é `NULL`"): a tela passaria a mostrar "não registrado" para tudo que já
  aconteceu, enquanto a derivação responde o passado **retroativamente** com o mesmo dado.
- **A verdade ficaria em dois lugares.** O ciclo gravaria a coluna e o banco já teria a fila e a
  mensagem; quando os dois divergissem (toque reenviado, fila esvaziada depois, migration atrás), a
  tela acreditaria na coluna e a evidência diria outra coisa.
- **O escritor está fora deste bloco.** A coluna só existe com migration (`src/db/schema.ts` +
  `drizzle/`) e com o ciclo gravando (`src/lib/workers/remarketing-cycle.ts`) — nenhum dos dois no
  escopo declarado do `bloco-toques`, e o ciclo é justamente a costura que a onda está mexendo.
- **A forma é consultada, não operada.** Ninguém filtra nem decide por ela; ela é rótulo de tela.
  Coluna em tabela de disparo é para o que o motor lê.

## Consequência para o painel

`LinhaDaTela.forma` passa a existir (`texto_livre` · `template` · `template_aguardando` ·
`nao_registrado`), com rótulo e explicação em português, derivada em `remarketing-tela.ts` (pura,
testada em `remarketing-forma.test.ts`) a partir da evidência colhida em `remarketing-queries.ts`.
O rótulo `nao_registrado` é uma resposta honesta — não um vazio.

## Residual (o que este ADR não resolve)

- **`messages.template_name` só passa a valer para a régua** quando o ciclo gravar o nome do
  template no envio. Hoje é evidência de segunda ordem.
- **O rótulo "Esgotou os 3 toques"** (`ROTULO_DA_SITUACAO`) segue com o número fixo enquanto o teto
  vem do cadastro (FIX-381) — fora do escopo declarado do card, registrado aqui para não virar
  surpresa na tela.
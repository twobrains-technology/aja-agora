---
data: 2026-07-01
bloco: bloco-entrada-welcome-upload
branch: fix/entrada-welcome-upload
itens: [FIX-121, FIX-122]
onda: divergencias-jornada (auditoria código×jornada 2026-07-01)
---

# Entrada e envio de documento: os dois canais falando a mesma língua

Duas arestas de canal que a auditoria da jornada canônica pegou — pequenas na
descrição, mas uma delas travava o cliente bem no fim da jornada. Ambas eram o
mesmo tipo de defeito: o WhatsApp e a web contando histórias diferentes ao
cliente. Agora contam a mesma.

## O que muda pro cliente

**1. A porta de entrada, igual em todo lugar (FIX-121).**
Quando o cliente abre a conversa, ele escolhe entre **Imóvel, Carro e Moto** —
três caminhos claros. No WhatsApp e na landing já era assim; só o chat web ainda
mostrava uma quarta opção fantasma ("Outros") que a equipe tinha aposentado
quando "Moto" entrou no lugar de "serviços". Cliente que entra pela web agora vê
exatamente as mesmas três portas de quem entra pelo WhatsApp. Nada se perdeu:
quem escreve "quero fazer uma reforma" continua sendo atendido normalmente — só
tiramos o botão a mais, não a capacidade.

**2. A foto do documento que sumia no ar (FIX-122).**
Esse era o grande. No fim da jornada, na hora de fechar a ficha, o agente do
WhatsApp dizia *"me manda a foto do seu RG ou CNH aqui mesmo"*. O cliente
mandava a foto — e nada acontecia. A imagem era simplesmente descartada, sem
aviso, sem confirmação, sem próximo passo. O cliente ficava olhando pra tela
esperando uma resposta que nunca vinha, justo no momento mais delicado: entregar
o documento de identidade.

Agora a promessa é cumprida. A foto chega, é processada e o cliente recebe
resposta na hora: *"Recebi a frente ✅. Agora me manda o verso"* e, ao final,
*"Sua ficha está completa!"*. Se algo falha, ele recebe uma orientação amigável
(ou o link oficial) — **nunca mais o silêncio**. É a mesma experiência que a web
já entregava; o WhatsApp finalmente alcançou.

## Como foi feito com responsabilidade

- **Paridade real, não remendo.** A foto do WhatsApp segue exatamente o mesmo
  caminho da foto enviada pela web (`uploadContractDocument`) — o mesmo destino,
  o mesmo tratamento. Não inventamos um fluxo paralelo só pro WhatsApp, que
  viraria dívida amanhã. A decisão de arquitetura (onde guardar o arquivo) foi
  levada ao Kairo e confirmada antes de uma linha ser escrita
  (`docs/correcoes/decisions/2026-07-01-bloco-entrada-welcome-upload.md`).
- **Anti-regressão de verdade.** Cada correção nasceu de um teste que falhava
  antes do conserto e passou depois. O envio de documento tem cobertura nas três
  camadas exigidas (estrutural, cassette de trajetória e comportamento do
  handler), incluindo todos os caminhos de erro — a garantia de que o cliente
  sempre recebe uma resposta virou teste automatizado.
- **Verde de ponta a ponta.** A suíte inteira (`pnpm test:unit`) roda em
  **206 arquivos, 2134 testes, zero falhas**, contra um banco real migrado.

## Honestidade sobre o escopo

- A **persistência dos documentos do nosso lado** (guardar cópia em storage
  próprio, divergência D12) continua sendo trabalho de outro bloco. A decisão
  consciente foi *não* antecipá-la só no WhatsApp — isso criaria uma nova
  assimetria entre os canais. Quando ela chegar, os dois canais herdam de graça,
  porque compartilham o mesmo ponto de entrega.
- O upload no WhatsApp coleta **frente e verso** do documento, espelhando o que
  a web coleta hoje. Nada além disso foi prometido ao cliente.

## Itens entregues

| Item | Divergência | O que era | O que virou |
|------|-------------|-----------|-------------|
| FIX-121 | D21 | chat web com 4ª categoria "Outros" | 3 categorias, em paridade com WhatsApp e landing |
| FIX-122 | D13 | foto de documento dropada em silêncio no WhatsApp | foto sobe pro mesmo destino do web, com confirmação e próximo passo |

Commits: `4c9947c` (FIX-121), `a3df11c` (FIX-122).

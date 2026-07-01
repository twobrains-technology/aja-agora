# Camada de streaming/fechamento do chat — 3 bugs de produção

**Data:** 2026-06-30 · **Branch:** `fix/streaming-chat-layer` · **Bloco:** `bloco-streaming-chat-layer`

Três defeitos que o Kairo viu em produção usando o chat na mão, todos na borda
entre o stream de respostas, o fechamento da proposta e o scroll. Atacados juntos
porque cheiravam a uma raiz comum na camada de streaming — a investigação mostrou
que **não eram a mesma raiz**, e cada um foi consertado com evidência própria.

## O que estava quebrado (na voz do usuário)

| # | Sintoma | Impacto pro negócio |
|---|---------|---------------------|
| **FIX-110** | "Do nada o agente não responde, fico esperando e nada. Aí quando eu falo, ele volta." | O cliente acha que o produto travou no meio da conversa — a pior hora pra perder confiança numa jornada de consórcio. |
| **FIX-112** | "Está totalmente bugado no final da proposta." Agente pedia o documento, o cliente dizia "bora" e ele respondia "Sem problema, quando quiser retomar" — beco sem saída, sem conseguir concluir. | Cliente decidido a fechar **não conseguia concluir** — perda direta de conversão no último metro. |
| **FIX-111** | "O scroll fica bugado, indo e voltando." | A tela treme sozinha durante a leitura — passa amadorismo e atrapalha ler a recomendação. |

## O que foi entregue

### FIX-110 — o agente nunca mais fica mudo
Três defesas em camadas pra garantir que **todo turno termina com uma resposta** ou
libera o cliente pra tentar de novo — nunca silêncio infinito:
- **Erro de stream sempre vira mensagem** (`onError` uniforme em todos os caminhos do chat).
- **Turno que fecharia vazio ganha um fallback honesto** ("Acho que me perdi por aqui,
  pode mandar de novo?") em vez de silêncio — só no turno de conversa livre, onde o
  agente sempre deveria responder.
- **Vigia de stream travado** no navegador: se a conexão morre sem avisar, o chat se
  recupera sozinho em vez de ficar "digitando" pra sempre.

### FIX-112 — dá pra concluir a proposta de novo
O motor do fechamento já estava correto (a ordem de chamadas à administradora estava
certa). O problema era de **condução do agente**: ele falava do envio de documento
cedo demais (antes de a oferta ser confirmada, quando ainda não existe nada pra
enviar) e interpretava um "bora" animado como desistência. Duas regras firmes no
roteiro do agente resolveram: o passo do documento **só** existe depois da oferta
confirmada, e "bora"/"estou pronto" é **avanço**, nunca recusa.

### FIX-111 — o scroll para de tremer
O chat decidia "seguir o fundo da conversa" com um único limite, e perto do fim cada
caractere novo fazia ele ligar e desligar — daí o tremor. Agora usa **histerese**
(uma zona morta entre dois limites): o scroll só muda de comportamento quando o
cliente realmente sobe ou volta ao fim, nunca por um pixel de diferença. E o
acompanhamento do fundo virou **um movimento por quadro** em vez de um por caractere.

## Decisões de design (X em vez de Y, porque Z)

- **FIX-110: investiguei antes de aplicar a hipótese do card, e ela caiu.** Um spike
  provou que, nesta versão do SDK, um stream sem `onError` **não engole** o erro
  (emite a mensagem do mesmo jeito). Como o input só libera quando o stream termina e
  o cliente conseguiu digitar "travou?", o turno **fechou vazio** — não ficou "preso".
  Decidi atacar o turno-vazio (a raiz real) em vez de só mexer no `onError`.
- **FIX-110: fallback de turno-vazio só no turno de conversa, não nos cliques de botão.**
  Porque há ações que legitimamente não respondem com texto (opt-in/recusa silenciosa);
  injetar fallback nelas criaria uma regressão pior (mensagem indevida).
- **FIX-110: vigia com teto de 45s, não menor.** Acima de qualquer turno real (buscas
  na Bevi + modelo levam segundos), mas finito — nunca "preso pra sempre".
- **FIX-112: corrigi o roteiro do agente, não o código do fechamento.** Porque a
  evidência (e os testes) mostraram que a ordem de chamadas já estava correta; o gap
  era 100% de comportamento da IA. Travei a ordem com testes pra ninguém quebrá-la depois.
- **FIX-111: histerese na decisão de scroll, em vez de "controlador único".** O card
  suspeitava de dois controladores brigando; verifiquei que o caminho real do chat tem
  **um só** (o `ChatLayout` com scroll de teclado é código morto, fora de uso). A raiz
  era o flip-flop do limite — resolvido com a zona morta.
- **Testes adaptados ao novo timing, não enfraquecidos.** O auto-scroll virou
  assíncrono (1 por quadro); os 2 testes afetados passaram a aguardar o quadro — a
  asserção "acompanha o fundo" continua valendo.

## Root cause: confirmado × hipótese

- **FIX-110 — DIVERGIU do card.** Confirmado por spike: stream sem `onError` não engole
  erro; o input estava liberado → turno fechou **vazio** (não preso). A hipótese do
  card ("onError engolido → preso em streaming") foi refutada empiricamente.
- **FIX-112 — CONFIRMADO no código.** O fechamento (`confirmOffer` ordena
  choose→getDocumentLinks; `uploadContractDocument` barra sem links; o card de upload só
  vem via `offer-confirm`) já estava correto. O gap confirmado é o roteiro do agente
  (prompt) não impedir a narração precoce do documento nem fixar "bora" como avanço.
- **FIX-111 — CONFIRMADO no código.** Único threshold no `handleScroll` → flip-flop perto
  do fim. Controlador duplicado descartado (caminho real tem um só).

## Cobertura de testes (gate: `pnpm test:unit` — 203 arquivos, 2079 testes, verde)

- **Camada 1 (estrutural):** `stream-error`, `stream-watchdog`, `empty-turn-guard`
  (funções puras); `system-prompt.fix-112` (regras no prompt); `scroll-intent`
  estendido (histerese pura, sem `waitForTimeout`); locks em `fulfillment.test.ts`
  (ordem choose→links + upload barrado sem links).
- **Camada 2 (cassettes):** `agent-trajectory.test.ts` — onError emite error part;
  turno vazio detectado; frase de adiamento do FIX-112 travada como regressão e
  afirmativo de avanço não casa com recusa.
- **Camada 3 (eval nightly):** não roda no gate (sem crédito/credencial no container);
  é o caminho real do agente, fora do escopo deste bloco.
- Validado num container Node transitório com o store pnpm compartilhado + Postgres
  efêmero migrado (`drizzle-kit migrate`, não push) — `node_modules` nunca tocou o host.

## Gaps honestos

- O **turno-vazio específico do print do FIX-110** não é reproduzível
  deterministicamente sem o agente real (Anthropic + Bevi) — não consegui cravar QUAL
  branch fechou vazio naquela conversa. O guard ataca o sintoma de forma genérica e
  segura (qualquer turno de conversa que feche sem nada visível), e o vigia do client
  cobre o caso de conexão morta. O cassette prova o mecanismo, não o branch exato.
- O **fallback de turno-vazio** é uma rede de segurança honesta, não um conserto da
  jornada: se o agente deveria ter disparado uma busca e não disparou, o fallback evita
  o silêncio, mas o cliente precisa reenviar. A causa de fundo (por que o agente às
  vezes não emite) é comportamento de LLM e fica pro eval nightly observar.
- **FIX-111** não tem E2E de scroll (Playwright medindo scrollTop monotônico) — fica
  como melhoria opcional gated, fora do CI, como o card já previa.

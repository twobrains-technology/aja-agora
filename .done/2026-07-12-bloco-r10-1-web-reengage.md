# Bloco r10-1 web-reengage — FIX-302

## Resumo

Único item deste bloco (onda 1, totalmente disjunto dos demais blocos da rodada 10). O
watchdog de re-engajamento (FIX-207, "usuário sumiu com um gate pendente") e a escada de
cobrança de 4 tentativas (FIX-211: pergunta direta → incentivo → reforço de segurança →
oferta de especialista) já existiam e eram testados no WhatsApp — o gap era 100% de ENTREGA
no canal web: o worker filtrava `channel === "whatsapp"` e exigia `waId`, então um usuário
web que sumisse no meio de um gate nunca era reengajado.

## Decisão de entrega

Ver ADR completa: [`docs/decisoes/blocos/2026-07-12-bloco-r10-1-web-reengage.md`](../docs/decisoes/blocos/2026-07-12-bloco-r10-1-web-reengage.md).

- **Decidi** persistir a mensagem de reengajamento na tabela `messages` (mesma função
  `saveMessage` usada pelo `web/adapter.ts` em turnos ao vivo) e reusar `GET /api/chat/resume`
  pra disponibilizá-la ao cliente **em vez de** criar um endpoint de poll dedicado ou fazer
  bridging cross-process do `message-bus` via Redis, **porque** o worker roda num processo
  separado do app (`scripts/proposal-worker.ts`), então o `message-bus` in-memory (usado hoje
  só na SSE de handoff) nunca alcançaria uma sessão SSE do processo do app — e a opção
  escolhida reusa 100% de infra já testada, sem endpoint novo, sem mudança de contrato.
- `AskUserQuestion` foi lançada pro Kairo com a opção escolhida recomendada em 1º lugar; sem
  resposta em tempo hábil, segui o default declarado no prompt do bloco ("reusa mais infra
  existente").
- **Decidi** que gates de coleta obrigatória (identify/credit/lance/lance-value/
  lance-embutido) no canal web reusam a escada FIX-211 e **re-armam o marcador** a cada ciclo
  de 90s até o teto de 4 tentativas **em vez de** disparar só uma vez como o WhatsApp faz hoje
  no watchdog, **porque** o fix-card exige explicitamente a "escada completa (4 tentativas)
  reproduzida no canal web" — sem re-armar, o watchdog silencioso só dispararia a 1ª tentativa
  e nunca escalaria (o WhatsApp escala via um mecanismo DIFERENTE, o guard de turno-mudo em
  `whatsapp/adapter.ts`, que não existe pro caso "usuário 100% silencioso" no web).

## Bug lateral corrigido no caminho

Reusar `reengageQuestionForGate` pro canal web expôs que a função sempre chamava
`gateQuestion` com `channel` implícito `"whatsapp"` — pro gate `identify`, o texto dizia "Seu
celular eu já pego aqui do WhatsApp", mentira no canal web (o form pede CPF **e** celular).
Corrigido com um parâmetro `channel` novo, default `"whatsapp"` preserva os 2 call sites
pré-existentes sem mudança de comportamento.

## Testes

- **Integração (DB real):** `src/lib/workers/gate-reengage-poll.integration.test.ts` — 3
  testes novos: (1) conversa web parada além do teto persiste a mensagem e ela aparece via
  `getResumableConversation` (a mesma função por trás de `/api/chat/resume`) sem reload
  manual; (2) escada completa de 4 tentativas simulando ciclos sucessivos de 90s (pergunta
  direta → incentivo → reforço → `SPECIALIST_EXIT_OFFER`, sem re-armar depois da 4ª); (3)
  handoff pendente no web nunca reengaja. Mais 1 teste garantindo que o WhatsApp **não
  regride** (continua via `fireGate`, nunca escreve na tabela de mensagens).
- **Unitário:** `src/lib/agent/gate-reengage.escada.test.ts` — cobre o novo parâmetro
  `channel` de `reengageQuestionForGate` (copy do `identify` diverge corretamente por canal;
  default preserva o comportamento pré-existente).
- **39/39 verdes** — rodado em container transitório atrelado à network `tb-local-net`
  (DATABASE_URL apontando pro Postgres shared do projeto, database próprio deste workspace
  clonado do template via `bootstrap-workspace.sh --db-only`); instalação de host bloqueada
  por convenção (worktree sem `node_modules`).

## Gate

- `pnpm exec vitest run` nos 4 arquivos tocados: **39/39 verdes**.
- Push: `fix/r10-1-web-reengage` — 1 commit (`93f5fc6d`).

## Gaps honestos

- **Frontend não consome ativamente ainda.** `theater-chat.tsx` só consulta
  `/api/chat/resume` uma vez no mount do painel teatro — não há poll periódico enquanto a
  aba fica ociosa. A mensagem de reengajamento fica **disponível** (a regressão exigida pelo
  card, validada por teste de integração), mas só chega visualmente ao usuário no próximo
  mount/reconexão, não "empurrada" numa aba já aberta. Fora do `escopo_arquivos` declarado
  no manifesto deste bloco (só backend: `gate-reengage-poll.ts`, `gate-reengage.ts`,
  `chat/resume/route.ts`) e sem regressão de teste mandatada pra isso — sinalizando aqui pra
  não virar "resolvido" silenciosamente. Fechar esse elo (poll leve em `theater-chat.tsx`,
  ou plugar no `message-bus` que já alimenta a SSE de handoff) é um follow-up natural.
- Não validei E2E ao vivo (browser) — proibido explicitamente neste bloco ("🚫 Sem smoke de
  browser"). A prova é via integração real (DB real, sem mocks de infra além de `fireGate`).

# Spec — Jornada humanizada: estudo dos problemas da conversa de 2026-07-12 + correção arquitetural

> 2026-07-12 · Claude (estudo solicitado pelo Kairo) · Status: **draft — aguardando decisão de escopo**
>
> Mockup de referência da NOVA jornada (fonte da intenção de produto):
> [`assets/2026-07-12-aja-dois-cenarios.html`](./assets/2026-07-12-aja-dois-cenarios.html)
> (cenário 1 "Madalena — vai juntando" e cenário 2 "Mario — sem entrada").

## Contexto e problema

Rodada de teste manual da jornada web (canal chat) rodando com um modelo barato em validação
(**Qwen 3.5 Fast** via gateway LiteLLM, `AI_MODEL` — roteado por `gateway-openai.ts`). A conversa
degradou em vários pontos: CPF pedido cedo demais, valor do bem apresentado friamente, reveal
atropelado (escolhe uma administradora direto), duas perguntas no mesmo balão, opt-in de WhatsApp
não pedido, um card completamente alucinado (chips "a"/"b"), resposta fora de escopo ao "não
entendi", e zero proatividade quando o usuário silencia.

Este estudo separa **o que é defeito de jornada** (a ordem/copy dos gates não bate com a intenção
nova do mockup), **o que é violação de lei de arquitetura** (invariante vivendo no prompt em vez de
código — quebra visível assim que o modelo enfraquece) e **o que é gap de canal** (web sem
reengajamento). Referência normativa: as 6 leis de `~/.claude/reference/arquitetura-agentes-ia.md`
(Lei 1: LLM não dirige fluxo; Lei 2: allowlist; Lei 3: nunca agir sobre entidade não-ancorada;
Lei 4: invariante crítico vira código, não regra-no-prompt).

**Princípio-mãe deste estudo:** a jornada tem que segurar o funil **mesmo com modelo fraco**. Tudo
que quebrou com o Qwen e não quebrava com Claude é, por definição, invariante que estava no lugar
errado (prompt) — a correção é movê-lo pra código, não trocar de modelo e esquecer.

---

## Estado atual do motor (mapa de referência)

A jornada NÃO é dirigida pelo LLM — é a cascata de `nextGate()` em
`src/lib/agent/qualify-state.ts:51-181` + os ramos determinísticos de `runTurn()`
(`src/lib/agent/orchestrator/index.ts`). Ordem real hoje:

```
[PRÉ-REVEAL]  name → desire(carro + "por que agora") → identify(CPF/celular) → credit(valor) → search
[REVEAL]      recommendation_card (hero, maior score) + comparison_table (server-side, FIX-290)
[PÓS-REVEAL]  experience → timeframe → lance → lance-value → lance-embutido → simulator-offer
              → scarcity → decision → [closing] contract_form → whatsapp handoff
```

Camadas de defesa existentes: `tool-policy.ts` (allowlist de tools por fase) → `tool-error` aborta
o turno com fallback determinístico → `artifact-guard.ts` (supressão por estado) → coerção
server-side de payload (`coerceRecommendationPayload` etc., contra `revealGroupsById`) →
`sanitizer.ts` (léxico banido, estado fabricado, preâmbulos). Observabilidade: `turn-trace.ts` +
`tool-io-log.ts` (input/output por tool, PII mascarada).

---

## Os problemas — evidência, causa-raiz e classificação

### P1 — CPF/celular pedido cedo demais (e colado na resposta do motivo)

**Evidência (conversa):** usuário responde o motivo ("uai o meu ta muito ruim, velho") e o agente
emenda "Me manda seu CPF e celular, só os números" + card de identidade — antes de qualquer troca
de ideia sobre o bem/valor.

**Causa-raiz (código):** duas decisões explícitas hoje corretas-por-design, mas que a nova jornada
inverte:
1. `nextGate()` põe `identify` ANTES de `credit` (`qualify-state.ts:77-85`, FIX-53 — comentário
   "precisa pedir os dados antes do valor").
2. `decideShowGate()` tem case especial que FORÇA o card de identidade no MESMO turno em que o
   usuário responde o "por que agora" (`qualify-state.ts:264-266`).

**Classificação:** defeito de jornada (regra mudou — mockup novo). Não é bug do modelo: qualquer
modelo faria isso, porque o servidor manda.

**Jornada nova (mockup, cenário Madalena):** nome → carro → motivo → **espelha a dor e declara o
objetivo** ("nosso objetivo já fica claro: te colocar num Corolla novo…") → **valor do bem**
(pergunta humana + card) → **só então** CPF/WhatsApp, com a moldura "Pra eu trazer as ofertas
**reais** das administradoras, preciso do seu CPF e WhatsApp".

### P2 — Valor do bem apresentado friamente

**Evidência:** "Qual valor do bem faz mais sentido pra você?" + slider, sem nenhuma referência ao
Corolla que o usuário acabou de citar.

**Causa-raiz:** copy fixa do gate em `gate-questions.ts:89-90` ("valor do bem", FIX-2). O gate não
usa o bem capturado no `desire` (`qualifyAnswers` já guarda o bem; só o caso FIX-284 de "valor
mencionado no desire" personaliza).

**Classificação:** defeito de copy/jornada. **Novo:** a pergunta referencia o bem — "E quanto custa
esse Corolla hoje?" — com o card de valor junto (o card continua; muda a moldura humana).

### P3 — Reveal atropelado: "já escolhe uma" sem moldura nem permissão

**Evidência:** após o valor, o agente emite "Encontramos boas opções… **Vamos te mostrar a mais
adequada**" e cai direto no hero da ITAÚ + "detalhamento completo" que ninguém pediu.

**Causa-raiz:** a cadeia pós-search é server-side (correto), mas a **coreografia** dela é a antiga:
`buildSearchSummaryDirective` → hero + comparison como par inseparável (FIX-290,
`recommendation-payload.ts:252-259`) → cadeia scarcity/decision. Não existe o beat intermediário
do mockup.

**Classificação:** defeito de jornada (coreografia do reveal mudou no mockup).

**Jornada nova (mockup):** reveal em **dois tempos com consentimento**:
1. **Lista primeiro** (`cardGrupos` = comparison com N administradoras, "repara na carta e na
   parcela de cada um") + explicação leve de por que as cartas variam;
2. gate `experience` ("você já fez consórcio antes, ou é a primeira vez?") — **uma pergunta só**;
3. se primeira vez → explicação curta + chips de dúvida (**explicação disponível, não empurrada**);
4. **pedir permissão**: "Posso te mostrar a opção que eu recomendo?" → só então o hero
   (`recommendation_card`) com prova social sóbria.

### P4 — Duas perguntas no mesmo balão (2 ocorrências)

**Evidência:** "Quer ajustar o valor do bem ou seguir com essa opção da ITAÚ mesmo? **Você já fez
consórcio antes?**" — o usuário não tem como responder as duas. (Já reportado antes; reincidiu.)

**Causa-raiz (a mais importante do estudo):** a regra "NUNCA mais de UMA pergunta por mensagem"
existe **só como regra-no-prompt** (`system-prompt.ts:59` e `:930`). Em código, a única
anti-colisão cobre o gate de motivo (`shouldAskMotive` + `decideShowGate`,
`qualify-state.ts:188-202,252-255`). Quando o orquestrador decide disparar a pergunta do gate
`experience` no mesmo turno em que o LLM narra livremente, nada impede o LLM de fechar a narração
com uma pergunta própria — com Claude a regra do prompt segura; com Qwen, não. **Violação direta
da Lei 4** (instruction-following degrada; prompt de ~1263 linhas com dezenas de regras duras).

**Classificação:** violação de arquitetura (invariante no prompt).

### P5 — Opt-in de WhatsApp aparece sem o usuário pedir

**Evidência:** card "Quero receber pelo WhatsApp" surge do nada após o reveal.

**Causa-raiz:** emissão é 100% server-side determinística e dispara **sozinha** quando
`revealCompleted && !whatsappOptinShown` (`whatsapp-optin-guard.ts:17-23`,
`orchestrator/index.ts:699-717`). O LLM já não consegue emitir (FIX-280) — o "problema" é a
**posição na jornada**, não a mecânica.

**Classificação:** defeito de jornada. **Novo (mockup, FECHO):** o momento WhatsApp é o
**fechamento/handoff**, depois da proposta aceita — "te mandei uma mensagem no WhatsApp, me
responde com um oi… em alguns minutos a especialista em cadastros te chama". O opt-in órfão
pós-reveal sai; a captura do número já aconteceu no gate de identidade.

### P6 — Card alucinado com chips "a"/"b" ("na verdade não preciso disso aqui")

**Evidência (print):** card com texto acinzentado "na verdade não preciso disso aqui", chips "a" e
"b", botão "← Voltar".

**Causa-raiz (CONFIRMADA no código):** é o **TopicPicker**
(`src/components/chat/artifacts/topic-picker.tsx` — o print bate campo a campo: `payload.prompt`
renderiza em muted, `topics[]` viram os chips, `includeBackButton` é o "Voltar"). A tool
`present_topic_picker` é a ÚNICA de apresentação com **labels de texto 100% livre**
(`topics: z.array(z.string().min(1)).min(2).max(5)`, `ai-sdk.ts:256-266`) e está liberada em
**todas as fases** (BASE, `tool-policy.ts:45-51`). O Qwen a chamou com lixo no gate `decision`
(onde a directive manda escrever UMA frase e **não** chamar tool) e o lixo passou na validação —
"a" e "b" são strings válidas. **Violação da Lei 3** (agir sobre entidade não-ancorada: labels
não resolvem contra nada real) e da Lei 2 (é a exceção da allowlist).

**Classificação:** violação de arquitetura, exposta pelo modelo fraco.

### P7 — "na entendi" → menu genérico e papo fora de escopo

**Evidência:** ao "na entendi", o agente abre um menu de opções ("escolhe o que quer entender
melhor") e ao segundo "uai nao sei voce nao me perguntou nada" repete o menu; depois, no
"em quanto tempo eu recebo o carro?", disserta sobre consórcio genérico em vez de reancorar na
decisão pendente.

**Causa-raiz:** no estado `decision`/pós-reveal, a recuperação de confusão do usuário é deixada à
narração livre do LLM (com o vetor do TopicPicker disponível — P6). Não existe um caminho
determinístico de "usuário confuso no gate X → reapresentar o gate X de forma mais simples". O
`doubts-wait` só existe pro gate `experience`.

**Classificação:** meio a meio — arquitetura (falta transição "clarify" na máquina de estados) e
jornada (o mockup resolve isso com explicação em camadas + chips de dúvida CANÔNICOS, ex.:
"o que é lance?" / "como funciona o sorteio?" / "e quando eu for contemplada?").

### P8 — Zero proatividade quando o usuário silencia (web)

**Evidência:** pedido explícito do Kairo ("se o usuário não responder, tem que dar uma chamada —
'cara, você ainda está aí?'").

**Causa-raiz (CONFIRMADA):** o reengajamento existe e é bom — escada de 4 tentativas
(`gate-reengage.ts:98-117`, timeout 90s, worker BullMQ a cada 30s) — **mas só roda no WhatsApp**:
a query filtra `channel === "whatsapp"` (`gate-reengage-poll.ts:53-59`) e o comentário nas linhas
14-15 admite: "Web fica fora deste worker (push server→client numa sessão SSE já fechada é
PENDENTE-KAIRO)". No web, usuário sumiu = conversa morta.

**Classificação:** gap de canal conhecido e documentado, agora promovido a requisito.

### P9 — O modelo (Qwen 3.5 Fast) está abaixo da régua — e a régua já existe

**Evidência (bakeoff, não opinião):** `.bakeoff/qwen-jornada.log` (2026-07-05): **4 falhas / 31
testes**, `fluxoScore 0.774` (alvo ≥ 0.85), `passo2.fidelidade 0.72` (alvo ≥ 0.75). Comparar:
Haiku 4.5 segurou o funil no bake-off anterior (64/69). Além do funil, o Qwen quebrou na conversa
regras de casca que Claude respeita: emoji ("✅" — a reforma zero-emoji está no prompt), nome em
minúscula ("Show, kairo!"), frases coladas ("…valor do bem?Fico à disposição…" — furo do
`normalizeGluedSentences` sob o streaming do gateway OpenAI-compat).

**Classificação:** decisão de produto + arquitetura de admissão: modelo só entra se passar a
régua mecânica que já existe (`scripts/bakeoff.sh`). E cada regra que só o modelo caro respeita é
um invariante no lugar errado (volta pra Lei 4).

### P10 — Cadência/casca degradada com o gateway OpenAI-compat

**Evidência:** frases coladas, balões picotados de forma estranha, emoji, capitalização.

**Causa-raiz (hipótese verificável):** o pipeline de balões (`EphemeralTextFilter`, FIX-188/189/
248/268) foi calibrado sobre o streaming Anthropic; o caminho Qwen entra por
`gateway-openai.ts` → chunking diferente. Confirmar com `turn-trace` da conversa real antes de
mexer. Capitalização de nome é corrigível determinística no save do `contactName`.

---

## Norte (critérios de sucesso verificáveis)

1. A jornada web reproduz o mockup nos dois cenários (Madalena e Mario) de ponta a ponta, com a
   ordem nova de gates — provado por teste de integração da sequência (`qualify-state.sequence`)
   e eval de jornada atualizado.
2. **Nenhum turno chega ao usuário com duas perguntas** — invariante em código, com teste de
   regressão usando a transcrição real desta conversa como cassette.
3. **Nenhum card com conteúdo livre do LLM** — toda opção clicável resolve contra um catálogo
   canônico (allowlist), provado por schema + teste.
4. Usuário inativo no web recebe reengajamento na escada existente (mesma régua do WhatsApp).
5. O eval da jornada (bakeoff) roda com o modelo candidato e é **gate de admissão**: abaixo da
   régua (fluxoScore ≥ 0.85 etc.), o modelo não vai pra dev/prod.

## Soluções arquiteturais (o plano de correção)

### S1 — Reordenar o funil pré-reveal (P1, P2)

Nova ordem em `nextGate()`: `name → desire(bem) → desire(motivo) → [espelho+objetivo] → credit →
identify → search`.

- Inverter `identify`/`credit` (`qualify-state.ts:77-88`) — reverte FIX-53 conscientemente
  (registrar ADR: a palavra nova vence; a razão antiga era "dados antes do valor", a intenção
  nova é rapport antes de dados, e a identidade continua obrigatória ANTES do `search` — o
  invariante real é `identityCollected` como pré-condição do `search`, não a posição no funil).
- Remover o case especial que cola identidade no turno do motivo (`qualify-state.ts:264-266`);
  no lugar, o beat pós-motivo é **espelhamento + declaração de objetivo** (directive server-side
  curta), e o `credit` entra no turno seguinte.
- Copy do `credit` contextual ao bem (`gate-questions.ts`): "E quanto custa esse {bem} hoje?"
  usando o dado do `desire` (já capturado); fallback genérico quando o bem não for específico.
- Copy do `identify` com a moldura do mockup: "Pra eu trazer as ofertas **reais** das
  administradoras, preciso do seu CPF e WhatsApp" (a justificativa vem antes do pedido).
- Atualizar: testes de sequência, `tool-policy` (fase qualify continua sem `contract_form`),
  `jornada-canonica.md` (nova seção SUPERSEDE datada).

### S2 — Reveal em dois tempos com consentimento (P3)

Recoreografar a cadeia server-side pós-search (orchestrator, não prompt):

1. `search` → emitir **só a `comparison_table`** (lista N administradoras) + directive de moldura
   ("olha a carta e a parcela de cada um; as cartas variam um pouquinho porque…").
2. Novo estado pós-lista: gate `experience` (já existe, só muda o ancoradouro — passa a vir
   ANTES do hero, não depois).
3. `experience = primeira vez` → directive de explicação curta + **chips canônicos de dúvida**
   (ver S4) — explicação disponível, não empurrada.
4. Novo gate leve `reco-consent` ("Posso te mostrar a opção que eu recomendo?") → resposta
   afirmativa → hero `recommendation_card` (o par inseparável do FIX-290 vira sequência com
   consentimento; manter o hero+tabela juntos apenas no caso de re-busca).

Toda a cadeia continua `emitServerCard` (Lei 1 preservada — nada disso volta pro LLM).

### S3 — Invariante em código: UMA pergunta por turno (P4)

Deixar a regra no prompt (ajuda os modelos bons), mas **enforçar no sanitizer**:

- Regra determinística no `EphemeralTextFilter`: quando o turno vai terminar com um **gate/card
  de pergunta do servidor** (`nextGateToFire` presente), qualquer sentença interrogativa da
  narração do LLM é **descartada** (mesma mecânica dos strips existentes FIX-188/190/249) — o
  servidor é o único dono da pergunta do turno.
- Quando NÃO há gate no turno: manter no máximo a ÚLTIMA sentença interrogativa do turno
  (drop das anteriores) — nunca duas perguntas chegam ao usuário.
- Cassette de regressão com a transcrição real ("Quer ajustar…? Você já fez consórcio antes?")
  em `tests/regression/`.

É a generalização do padrão anti-CK-1 que hoje só protege o motivo (`qualify-state.ts:188-190`).

### S4 — Matar o vetor de card alucinado: TopicPicker ancorado (P6, P7)

Aplicar Lei 2+3 na última tool de texto-livre:

- `present_topic_picker` deixa de aceitar strings livres: `topics` vira **enum de tópicos
  canônicos** (catálogo em código: "o que é lance?", "como funciona o sorteio?", "e quando eu
  for contemplado?", "por que as cartas variam?", …), validado por Zod `z.enum`/lookup — id
  resolve contra catálogo, copy do chip vem do catálogo, não do modelo.
- Restringir a fase: fora do `decision` e do closing (nos gates de decisão o servidor já emite
  os prompts canônicos; um menu do LLM ali é sempre ruído).
- `artifact-guard`: suprimir topic_picker em turno que já tem gate/card do servidor.
- Fallback "usuário confuso" determinístico (P7): intent `confused`/"não entendi" num gate →
  o orquestrador **reapresenta o gate corrente simplificado** (directive + mesmo card), em vez
  de deixar o LLM inventar um menu. Máquina de estados ganha a transição `clarify` (re-entra no
  mesmo estado com copy nível-2), sem estado novo persistente.

### S5 — WhatsApp no lugar do fecho (P5)

- Remover o disparo do opt-in pós-reveal (`orchestrator/index.ts:699-717` +
  `whatsapp-optin-guard.ts`): a condição passa de `revealCompleted` para **decisão aceita /
  closing** (pós `decision = sim`), integrado ao roteiro FECHO do mockup (mensagem enviada
  ativamente + "me responde com um oi" + expectativa "em alguns minutos a especialista te
  chama").
- Como o celular já foi coletado no `identify` (com consentimento LGPD), o card no fecho é
  confirmação de canal, não captura — reaproveitar `whatsapp_optin` com copy nova ou o fluxo de
  template HSM existente.

### S6 — Reengajamento proativo no web (P8)

Fechar o PENDENTE-KAIRO do `gate-reengage-poll.ts:14-15`. Recomendação (menor peça nova):

- **Reaproveitar o worker existente** (escada de 4 tentativas já pronta) removendo o filtro
  `channel === "whatsapp"`; o problema é só a ENTREGA no web (SSE fechado).
- Entrega: o cliente web mantém um canal de retomada — a rota de chat já persiste mensagens;
  basta o cliente fazer **poll leve** (ou reusar o mecanismo de resume/`web-resume` que já
  existe pra reidratar conversa) quando ocioso, exibindo mensagens de reengajamento gravadas
  pelo worker. Alternativa mais pesada (WebSocket/push) fica fora do MVP.
- Mesma escada de copy, com timeout maior no web (ex.: 2-3 min vs 90s) — decisão de produto a
  confirmar.

### S7 — Régua de admissão de modelo + casca por-gateway (P9, P10)

- **Gate de admissão**: nenhuma troca de `AI_MODEL` em dev/prod sem `scripts/bakeoff.sh` verde na
  régua (fluxoScore ≥ 0.85, fidelidade por passo, suíte de jornada). O Qwen 3.5 Fast, hoje,
  **reprova** (0.774) — com S1-S6 aplicados (invariantes em código), re-rodar o bakeoff; a
  expectativa é que a nota suba porque o funil deixa de depender de obediência ao prompt. Se
  ainda reprovar, o candidato barato viável mais próximo já medido é o Haiku 4.5.
- Casca determinística que não depende de modelo: strip de emoji no sanitizer (canal web também,
  já que a política é zero-emoji), capitalização do `contactName` no save, e verificação do
  chunking de frases no caminho `gateway-openai.ts` com turn-trace (hipótese P10).

## Decisões de design (a registrar em `docs/decisoes/` quando aprovadas)

1. Reversão consciente do FIX-53: o invariante "identidade antes do search" permanece; a posição
   "identidade antes do valor" cai (palavra nova do mockup vence).
2. "Uma pergunta por turno" promovida de regra-no-prompt a invariante do sanitizer (Lei 4).
3. TopicPicker deixa de ser texto livre: catálogo canônico de tópicos (Leis 2/3) — zero tools de
   apresentação com conteúdo livre do LLM.
4. Opt-in WhatsApp muda de gatilho: `revealCompleted` → closing/decisão aceita.
5. Bakeoff vira gate de admissão de modelo (processo, não código).

## Riscos e gaps honestos

- **Não confirmei com turn-trace a conversa real** (não sei qual ambiente/DB ela rodou). Duas
  hipóteses seguem abertas: (a) o "card gigante em branco" antes do "detalhamento completo da
  ITAÚ" — provável hero+comparison renderizando mal no copy/paste, mas pode ser payload coagido
  vazio; (b) o chunking de frases coladas no caminho OpenAI-compat (P10). Ambas se verificam
  barato nos logs `[turn-trace]`/`[tool-io]` da sessão antes de codar S7-casca.
- Reordenar o funil mexe no coração do `qualify-state` — a suíte de sequência é grande e vários
  testes cravam a ordem antiga; o custo é maioria atualização de teste, não lógica.
- O beat "espelho + objetivo" (S1) e o "reco-consent" (S2) adicionam 1-2 turnos ao funil — trade
  entre rapport e atrito; o mockup aceita esse custo, mas vale medir queda de conversão no eval.
- Reengajamento web por poll do cliente não cobre aba fechada — aí só WhatsApp/e-mail; é o limite
  aceito do MVP.
- Qwen: mesmo com invariantes em código, tool-calling fraco pode aumentar `tool-error`/turnos
  abortados (fallbacks determinísticos seguram a jornada, mas a "alma" do texto empobrece). A
  régua do bakeoff decide, não a torcida.

## Fora de escopo (YAGNI)

- WebSocket/push real no web (poll/resume resolve o MVP).
- Reescrever o system prompt de 1263 linhas (desejável emagrecer à medida que invariantes migram
  pra código, mas é faxina incremental, não pré-requisito).
- Mudanças no canal WhatsApp (a jornada nova é a mesma; este estudo só mexe na coreografia web e
  em invariantes compartilhados).
- Simulador/lance embutido (cenário Madalena, cardSmart): a mecânica já existe pós-reveal
  (FIX-215); só a coreografia entra em S2 — sem cálculo novo.

## Mapa problema → solução → arquivos-chave

| P | Solução | Arquivos principais |
|---|---|---|
| P1, P2 | S1 | `qualify-state.ts`, `gate-questions.ts`, testes de sequência, jornada-canonica |
| P3 | S2 | `orchestrator/index.ts`, `recommendation-payload.ts`, `directives.ts` |
| P4 | S3 | `sanitizer.ts`, `runner.ts`, cassette em `tests/regression/` |
| P6, P7 | S4 | `ai-sdk.ts` (schema), `tool-policy.ts`, `artifact-guard.ts`, `topic-picker.tsx` |
| P5 | S5 | `whatsapp-optin-guard.ts`, `orchestrator/index.ts` |
| P8 | S6 | `gate-reengage-poll.ts`, cliente web (resume/poll) |
| P9, P10 | S7 | `scripts/bakeoff.sh` (processo), `sanitizer.ts`, `gateway-openai.ts` (verificação) |

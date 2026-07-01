---
title: "Plano de teste funcional — Memória persistente cross-channel (Letta sidecar)"
date: 2026-05-16
owner: Product Owner — Aja Agora
related_adr: ~/obsidian-vault/01 - TwoBrains/decisions/2026-05-16-aja-agora-letta-sidecar-integration.md
status: ready_for_qa
feature: Phase 12 — Letta memory integration
---

# Plano de teste funcional — Memória persistente cross-channel

> Documento de **produto**, não de implementação. Define o *que* validar e por
> *que* importa. O agent QA traduz pra Vitest / Playwright / scripts de
> contrato Letta na sequência.

## 0. Glossário rápido (para evitar ambiguidade nos cenários)

- **Identidade**: chave estável que mapeia pessoa → agent Letta. Em ordem de
  precedência: `phone E.164` (sempre que conhecido) ou `aja_uid` (cookie web
  hex, fallback anônimo).
- **Threshold de engajamento (N=3)**: web anônimo só ganha agent Letta após
  o 3º turno do usuário no chat. Antes disso a conversa roda sem memória.
- **Reativação**: retorno do usuário após >= 1 dia da `lastInteractionAt`
  registrada no `memory_block`. Faixas que mudam o tom do hint: 1d, 2-6d, 7+d.
- **Reconciliação**: cópia do conteúdo do agent anônimo (cookie) pro agent
  permanente (phone) no momento em que o lead é capturado. Flag em
  `conversations.metadata.letta.reconciled = true` impede re-disparo.
- **Hint**: bloco de texto pre-pended ao system prompt, formato
  `[CONTEXTO DO USUÁRIO] ... [REATIVAÇÃO] ... [FATOS RELEVANTES ...]`.
- **Adapter ativo**: `Letta` em uso normal; `Noop` quando `MEMORY_ADAPTER=noop`
  no env OU quando o circuit breaker abriu por falha de health check.

---

## 1. Objetivos do teste (visão produto)

A feature existe para criar **diferenciação competitiva real** ("o agente
lembra de você") em um mercado onde concorrentes tratam cada conversa como
sessão isolada. Os testes precisam **provar** que esse diferencial está vivo
em produção e que **a forma como ele aparece** não machuca outros eixos do
produto (confiança, privacidade, performance, percepção de naturalidade).

### Riscos de negócio que os testes precisam cobrir

| Risco | Severidade | Por que importa |
|---|---|---|
| **Vazamento de memória entre pessoas distintas** | Crítico (P0) | "O agente sabe coisas que eu não contei pra ele" destrói confiança da plataforma em uma única tela. Em consórcio (produto de R$ 50k+) a recuperação é ~impossível. |
| **Cross-channel não funcionar** | Crítico (P0) | Esse *é* o diferencial vendido. Se falha, a feature não existe. |
| **Hint de reativação aplicado em todos os turnos** (incluindo mesma sessão) | Alto (P1) | Agent fica robótico ("vi que você voltou após 0 dias..."), mata percepção de naturalidade. |
| **Conteúdo do hint vaza dado errado** (ex: nome de outra pessoa) | Crítico (P0) | Pior que não ter memória — explicitamente expõe que houve mistura. |
| **App fica indisponível quando Letta cai** | Crítico (P0) | Memória é "nice to have"; chat funcionando é "must have". Letta down não pode derrubar o produto. |
| **PII (nome, phone) vaza em logs** | Alto (P1) | LGPD-adjacente. Phone em log claro é evidência forense desfavorável em audit. |
| **Stale memory vira contexto enganoso** | Médio (P2) | "Recomendação de 8 meses atrás" sendo retomada como atual induz o usuário a decisão errada. |
| **Reconciliação duplica ou perde memória** | Alto (P1) | Anônimo→identificado é o ponto único em que dois agents coexistem. Se algo der errado aqui, o usuário "perde tudo o que tinha conversado". |
| **Custo descontrolado** (Letta vira agent gigante por turno) | Médio (P2) | Archival sem limite + extrações duplicadas inflam billing (OpenAI embeddings) sem ganho. |
| **Latência percebida em P95** | Médio (P2) | 2s de timeout aceito, mas se acontecer em 30% dos turnos, percepção de lentidão mata UX. |

### Eixos a validar (resumo executivo)

1. **Continuidade do usuário** entre canais e ao longo do tempo (positivo).
2. **Isolamento** entre pessoas, ambientes, workspaces (negativo).
3. **Resiliência**: app funciona sem memória, fail-open por design.
4. **Tom**: hints aparecem só quando agregam, e o conteúdo é coerente.
5. **Privacidade operacional**: PII só onde aceito, nunca em log claro.
6. **Custo e performance** mantidos sob controle.

---

## 2. Cenários de uso (Given/When/Then)

> Linguagem é de **comportamento observável** pelo usuário ou por um auditor
> de produto, não de chamada de função. O QA escolhe a camada (unit /
> integration / e2e) que dá o sinal mais barato e mais confiável.
>
> Convenção: cada cenário marca o(s) **veredito(s) do ADR** (#1–#14) que ele
> protege. Se um veredito não aparece em nenhum cenário, ou o ADR é
> defensável só "por construção" (caso do #1, #11), ou está coberto
> implicitamente.

---

### PO-001 — Usuário reconhecido ao voltar após 5 dias no mesmo canal
- **Prioridade**: P0
- **Tipo provável**: integration (orquestrador + Letta local)
- **Veredito coberto**: #2, #5, #6, #14
- **Given**: pessoa "Maria" (+5511988887777) já interagiu uma vez no
  WhatsApp 5 dias atrás. Naquela conversa simulou R$ 60k em 36 meses, parcela
  R$ 1.900, categoria auto.
- **When**: Maria envia hoje "oi, queria retomar nossa conversa" pelo mesmo
  número de WhatsApp.
- **Then**:
  1. A resposta do agente **menciona** que ela já tinha simulado um auto,
     trazendo pelo menos um dos números (crédito, prazo ou parcela).
  2. A resposta **NÃO** começa do zero ("Olá! Bem-vinda ao Aja Agora.
     Vamos descobrir...").
  3. O hint injetado contém marcador `[REATIVAÇÃO]` com "5 dias" e ação
     "Pergunte se quer continuar onde parou ou se mudou algo".

---

### PO-002 — Cross-channel: começa web identificado, continua no WhatsApp
- **Prioridade**: P0 (este é o "core selling point" da feature)
- **Tipo provável**: e2e (chat web → DB → WhatsApp processor mock)
- **Veredito coberto**: #2, #3, #7
- **Given**: pessoa "João" entrou no site, conversou ~6 turnos, ativou lead
  capture e informou nome "João Silva" e phone "+5511966665555". Recebeu
  recomendação. Saiu. Site marcou `letta.reconciled = true` na conversa.
- **When**: 30 minutos depois João envia mensagem do mesmo número via
  WhatsApp Cloud API.
- **Then**:
  1. A primeira resposta do agente **chama João pelo nome**.
  2. O agente **referencia** a recomendação recebida no site (label ou
     valor da parcela).
  3. No registro de operação não foram criados dois agents distintos
     "para a mesma pessoa": agent atual carrega `reconciledFrom` apontando
     pro agent anônimo de origem.

---

### PO-003 — Mesma sessão: sem `[REATIVAÇÃO]` no segundo turno
- **Prioridade**: P1
- **Tipo provável**: unit (`buildReactivationHint`)
- **Veredito coberto**: #6
- **Given**: usuária com `lastInteractionAt` setado há 10 minutos.
- **When**: ela manda outra mensagem.
- **Then**: o hint montado não contém o marcador `[REATIVAÇÃO]`. Pode conter
  `[CONTEXTO DO USUÁRIO]` (sumário). Justificativa: tom de "voltou após 0
  dias" soa robótico e quebra a percepção de naturalidade.

---

### PO-004 — Faixas de reativação: 1d, 5d, 30d, 365d produzem tons distintos
- **Prioridade**: P1
- **Tipo provável**: unit (table-driven)
- **Veredito coberto**: #6
- **Given**: memory_block populado com `lastSimulation` e
  `lastRecommendation`.
- **When**: `buildReactivationHint` é chamado com 1, 5, 30 e 365 dias.
- **Then**:
  - 1 dia → texto contém "1 dia" e instrução "Retome de onde parou".
  - 5 dias → contém "5 dias", **detalhe da última ação** (simulação ou
    recomendação), e pergunta "se quer continuar onde parou ou se mudou
    algo".
  - 30 e 365 dias → contém `[REATIVAÇÃO LONGA]`, "tom acolhedor" e
    pergunta sobre o que mudou. Validação: agente **não** assume que o
    usuário ainda quer o mesmo produto.

---

### PO-005 — Usuário troca de número de telefone e volta no WhatsApp
- **Prioridade**: P2 (caso de borda real do produto B2C)
- **Tipo provável**: integration + observação manual de produto
- **Veredito coberto**: #2
- **Given**: "Carla" usava +5511 988887777 e tem memória rica. Trocou de chip
  pra +5511 977776666. Não notifica o sistema.
- **When**: Carla manda "oi, voltei" do número novo.
- **Then**: agente trata como nova pessoa (esperado dentro do escopo da
  decisão #2). Critério de aceite **negativo**: o sistema **não deve**
  espontaneamente alegar conhecê-la nem trazer dado do agent antigo. Limpeza
  do antigo cai no purge dos 365 dias.
- **Observação PO**: existe a opção produto de oferecer "merge por convite"
  no futuro (usuário declara "esse é meu número novo"). Fora de escopo MVP
  — registrar como tarefa de roadmap.

---

### PO-006 — Telefone compartilhado entre duas pessoas (mesma família)
- **Prioridade**: P1 (mais comum em consórcio B2C do que parece)
- **Tipo provável**: integration + análise de payload
- **Veredito coberto**: #2, #9
- **Given**: número +5511955554444 já tem agent populado com perfil "auto
  popular, R$ 60k".
- **When**: nova interação do mesmo número diz explicitamente "agora é a
  esposa, ela quer imóvel R$ 300k".
- **Then**:
  1. O agente **não trava**: ele atualiza o contexto à medida que a nova
     intenção é declarada.
  2. O memory_block resultante **convive** com os dois interesses (objections
     e channels deduplicam; histórico em archival mantém ambos).
  3. **Crítico**: o nome anterior **não** é usado pra cumprimentar a nova
     pessoa sem confirmação ("Oi, fulano!" quando o turno foi "agora é a
     esposa").
- **Observação PO**: este cenário expõe um limite real do design — phone =
  uma identidade. Se virar problema recorrente no support, voltar para nova
  ADR.

---

### PO-007 — Cookie web deletado: anônimo perde contexto, mas chat segue
- **Prioridade**: P1
- **Tipo provável**: e2e ou manual
- **Veredito coberto**: #2, #13
- **Given**: visitante navegou anonimamente, conversou 5 turnos (agent
  Letta foi criado no turno 3 e tem 2 entries no archival).
- **When**: ela limpa cookies e volta no mesmo dia.
- **Then**:
  1. Nova sessão começa sem qualquer referência ao histórico anterior (esperado).
  2. Após o 3º turno desta nova sessão, **outro** agent Letta anônimo é
     criado. **Não há vazamento** de memória da sessão antiga (cookie
     diferente → namespace diferente do agent name).
  3. O chat funciona normalmente em todo o intervalo.

---

### PO-008 — Letta indisponível: app responde sem memória, sem erro pro usuário
- **Prioridade**: P0
- **Tipo provável**: integration (injeta adapter que sempre throw)
- **Veredito coberto**: #8, #10, #11
- **Given**: Letta retorna 503 em todas as chamadas (ou tarda > 2s).
- **When**: usuário identificado manda mensagem.
- **Then**:
  1. A resposta do agente chega **dentro do SLA normal** (sem somar 2s de
     espera além do habitual).
  2. A resposta **não** menciona estado anterior (memória não foi carregada).
  3. O usuário **não vê** mensagem de erro/aviso.
  4. Log estruturado com `letta_op`, `letta_fallback: true` e razão
     (`timeout` ou `http_5xx`) é emitido.
  5. Após 60s o sistema **tenta de novo** automaticamente (re-check do
     circuit breaker). Se Letta voltou, próximo turno já usa.

---

### PO-009 — Phone inválido / estrangeiro / malformado não cria agent
- **Prioridade**: P1
- **Tipo provável**: unit (`normalizePhoneBR` + `identityFromWaId`)
- **Veredito coberto**: #2, #9
- **Given**: tentativas de input:
  - `"+1 415 555 0000"` (US)
  - `"abc123"` (lixo)
  - `"11 9999"` (curto demais)
  - `"+55 11 99999-9999"` (BR válido, espaços e hífen)
  - `"5511999999999"` (BR sem +)
- **When**: cada um passa pelo bridge de identidade.
- **Then**:
  - Os 3 primeiros retornam identidade nula → orquestrador segue sem
    memória, **sem erro pro usuário**.
  - Os 2 últimos são normalizados pro mesmo E.164 `+5511999999999` e geram
    o mesmo agent Letta (idempotência).
  - **Crítico**: nenhum agent Letta é criado pra phone inválido (verificável
    listando agents do namespace após N rodadas).

---

### PO-010 — Anônimo vira lead: reconciliação não duplica nem perde memória
- **Prioridade**: P0
- **Tipo provável**: integration (LettaMemoryAdapter contra Letta local)
- **Veredito coberto**: #3, #13
- **Given**: agent anônimo (cookie `abc123...`) tem 3 entries no archival
  e um memory_block com `category=auto`, `creditMax=60000`. Mesma sessão
  agora capturou lead `phone=+5511933332222`, `name="Ana"`.
- **When**: o orquestrador chama `reconcileIdentity(from=cookie, to=phone)`.
- **Then**:
  1. Agent `phone` agora tem **3 entries** novas no archival, taggeadas
     com `migrated:<sourceAgentId>`.
  2. Memory_block do `phone` tem `reconciledFrom=<cookie agent id>` e
     preserva `name="Ana"` (campo do destino vence em conflito).
  3. Chamar `reconcileIdentity` uma segunda vez **não duplica** entries
     (idempotência via flag `reconciledFrom`).
  4. `conversations.metadata.letta.reconciled` é marcado true após sucesso
     (responsabilidade do caller, mas o teste precisa cobrir).

---

### PO-011 — Threshold N=3: web anônimo abaixo do limiar não cria agent
- **Prioridade**: P1
- **Tipo provável**: integration
- **Veredito coberto**: #13
- **Given**: visitante anônimo na web, cookie presente, 0/1/2 turnos.
- **When**: cada turno completa.
- **Then**:
  1. Em turnos 1 e 2, **nenhum agent Letta é criado** (verificável: lista
     de agents do namespace permanece estável).
  2. **Nenhuma chamada** de store/load contra Letta acontece (verificável
     via spy/log).
  3. No turno 3, ao final, agent é criado e store dispara fire-and-forget.
- **Justificativa de produto**: 78% das visitas anônimas saem em < 2 turnos.
  Persisti-las explode custo de agents fantasmas.

---

### PO-012 — Múltiplos workspaces locais não misturam memória
- **Prioridade**: P1 (para dev, evita confusão e bug supérfluo durante MVP)
- **Tipo provável**: integration
- **Veredito coberto**: #7
- **Given**: dois worktrees do aja-agora rodando localmente com
  `LETTA_NAMESPACE` diferente (`aja-agora-local-wt1` e `aja-agora-local-wt2`),
  mesmo Letta backend.
- **When**: cada worktree faz turnos com o **mesmo** phone E.164.
- **Then**: dois agents Letta distintos são criados, um em cada namespace.
  Memória de um não aparece no contexto do outro.

---

### PO-013 — PII no memory_block, NÃO em logs
- **Prioridade**: P0 (privacidade)
- **Tipo provável**: unit + integration de inspeção de logs
- **Veredito coberto**: #9, #11
- **Given**: usuária com nome "Beatriz Andrade" e phone +5511944443333 com
  agent criado.
- **When**: turnos normais (load + store).
- **Then**:
  1. O memory_block "human" do agent **contém** name e phone (intencional —
     usabilidade do hint depende disso).
  2. Os **logs estruturados** emitidos durante o turno (`letta_op`, etc):
     - **NÃO** contêm o phone completo em claro (regex `\+?55\d{10,11}`
       não casa em nenhum log).
     - Podem conter prefixo (8 chars) pra debug, conforme o código já faz.
     - **NÃO** contêm o nome próprio do usuário.
  3. O hint pre-pended no system prompt (visível ao LLM, não ao usuário
     direto) pode conter nome — isso é intencional.

---

### PO-014 — Stale memory: recomendação de 6 meses atrás não é tratada como atual
- **Prioridade**: P2 (qualidade de produto, não bloqueador)
- **Tipo provável**: e2e + análise qualitativa da resposta
- **Veredito coberto**: #6 (cobertura parcial; ADR não trata explicitamente
  staleness — ver seção 5)
- **Given**: agent com `lastRecommendation` datada há 180 dias e
  `lastInteractionAt` há 180 dias.
- **When**: usuário volta com "quero ver opções de carro".
- **Then**:
  1. O hint montado contém `[REATIVAÇÃO LONGA]` (>= 7d) e pergunta sobre
     o que mudou.
  2. A resposta do agente **NÃO** apresenta a recomendação antiga como
     atual ("Continuando a recomendação X que vimos..."). Tom esperado:
     "Da última vez você buscava X — isso ainda faz sentido pra você?"
- **Cobertura**: a heurística determinística cobre o tom; conteúdo do LLM é
  avaliado por LLM-as-judge no pipeline de eval existente
  (`src/lib/eval/`).

---

### PO-015 — Threshold + saída precoce: usuário sai no turno 2 → nada persistido
- **Prioridade**: P2
- **Tipo provável**: integration
- **Veredito coberto**: #13, #14
- **Given**: visitante anônimo, 2 turnos, depois fecha aba.
- **When**: nada de novo acontece (sem turno 3).
- **Then**:
  1. Nenhum agent Letta foi criado.
  2. Nenhum archival entry existe.
  3. O cookie expira em 90 dias se nunca for usado de novo.

---

### PO-016 — Identidade nula mas histórico de conversa existe: app não trava
- **Prioridade**: P1
- **Tipo provável**: integration
- **Veredito coberto**: #8, #10
- **Given**: web turno 1 (sem cookie ainda — caso possível em primeiro
  request) E whatsapp com `waId` malformado.
- **When**: orquestrador chama `resolveIdentityForTurn` e recebe `null`.
- **Then**:
  1. `loadMemoryContextForTurn(null, ...)` retorna `null` sem fazer chamada
     externa.
  2. `storeMemoriesForTurn(null, ...)` é no-op.
  3. Resposta normal do agent acontece, sem memória, sem erro.

---

### PO-017 — Reconciliação idempotente sob retry
- **Prioridade**: P1
- **Tipo provável**: integration
- **Veredito coberto**: #3
- **Given**: agent destino já tem `reconciledFrom` setado para o agent
  origem (reconciliação anterior bem-sucedida).
- **When**: `reconcileIdentity` é chamado de novo com mesmos `from` / `to`.
- **Then**:
  1. **Nenhuma** nova entry no archival.
  2. Block não muda.
  3. Retorna `success: true`, idempotente.
- **Justificativa**: bug crítico se um retry de webhook (WhatsApp Cloud
  reentregando) disparasse reconciliação duas vezes.

---

### PO-018 — Mudança no schema do memory_block (futura) não quebra agents antigos
- **Prioridade**: P1
- **Tipo provável**: unit
- **Veredito coberto**: Risco listado no ADR ("schema evoluir")
- **Given**: memory_block JSON gravado por uma versão v1 (campos atuais).
- **When**: código atual lê esse block com `parseHumanBlock`.
- **Then**: parse não throw em nenhum campo opcional ausente. Campos novos
  ainda não existentes voltam `undefined`. `objections` e `channels` sempre
  vêm como array (nunca undefined). `schemaVersion` default = 1.
- **Validar também**: block com `value` que **não é JSON válido** (legado/
  conteúdo manual) — parse recupera com `name = valor cru`, não throw.

---

### PO-019 — Falsos-positivos de extração: turno sem dados estruturados não polui memória
- **Prioridade**: P2
- **Tipo provável**: unit (extractor)
- **Veredito coberto**: #4
- **Given**: turno onde usuário só disse "oi" — sem artifacts, sem
  qualifyAnswers preenchido, sem leadCollection.
- **When**: extrator roda.
- **Then**:
  1. `entries` = `[]`.
  2. `blockPatch` contém **apenas** `channels: [channel]`.
  3. Store ainda dispara (touch em `lastInteractionAt`), mas archival fica
     vazio.
- **Por quê importa**: heurística determinística deve ser conservadora.
  Memória ruim é pior que sem memória.

---

### PO-020 — Custo controlado: archival limit + dedup de objections
- **Prioridade**: P2
- **Tipo provável**: integration
- **Veredito coberto**: #4, #5 (cobertura parcial)
- **Given**: 20 turnos seguidos do mesmo usuário, todos com objeção
  "medo de não ser contemplado".
- **When**: cada turno dispara extrator.
- **Then**:
  1. `objections` no memory_block contém **uma única** entrada
     "medo de não ser contemplado" (dedup via `Array.from(new Set(...))`
     no adapter — já implementado).
  2. Archival cresce **proporcional** aos eventos genuinamente diferentes,
     não 20x a mesma string.
- **Observação PO**: archival sem ceiling pode virar problema. Sugestão pro
  time: alarm/alert quando count de passages por agent passar de N (ex:
  500) — fora de escopo deste plano, sinalizar.

---

### PO-021 — Latência: P95 do `loadContext` < 1.5s sob carga típica
- **Prioridade**: P1
- **Tipo provável**: integration de carga (k6/autocannon)
- **Veredito coberto**: #10
- **Given**: 50 turnos paralelos contra Letta local com agents pré-criados.
- **When**: cada turno chama `loadContext` com archival query.
- **Then**:
  - P50 < 500ms.
  - P95 < 1500ms.
  - 0 timeouts (todos < 2000ms).
- **Justificativa**: 2s é o teto duro; se em condições de teste o P95 já
  encosta nele, em produção vai estourar. Critério calibra cedo.

---

### PO-022 — Hint do contexto não mente sobre dados que não existem
- **Prioridade**: P1
- **Tipo provável**: unit (`summarizeBlock`)
- **Veredito coberto**: #6
- **Given**: memory_block com **apenas** `name` e `stage` preenchidos
  (sem simulação, sem recomendação, sem orçamento).
- **When**: `buildMemorySystemMessage` roda.
- **Then**: a string `[CONTEXTO DO USUÁRIO]` **NÃO** inclui linhas pra
  campos ausentes (não há "Crédito alvo: undefined", "Última simulação: -",
  etc). Cada linha gerada corresponde a um campo populado.

---

## 3. Riscos não cobertos / fora de escopo MVP

| Risco / cenário não coberto | Por que ficar fora agora |
|---|---|
| **Mudança de número com merge dirigido por usuário** | Produto não tem fluxo UI ainda. Cobrir quando virar feature. |
| **Concorrência: 2 turnos do mesmo usuário em paralelo (race em `lastInteractionAt`)** | Tráfego MVP é baixo; em produção real precisamos transactional update. Aceitar last-write-wins por hora. Adicionar quando tiver volume. |
| **Letta migrar pra Postgres+pgvector** | ADR já sinaliza como risco; teste de migração fica num plano específico de migração quando rolar. |
| **Eviction de archival quando agent tem > N passages** | Sem limite hard ainda. Teste de stress (PO-020) sinaliza, mas alarme + política de retenção é trabalho separado. |
| **Auditoria de `memory_events` table** | A tabela é citada na ADR mas o insert está TODO (ver `reconciler.ts` linha ~44). Quando implementar, abrir PO-023+. |
| **Resposta a "esqueça tudo de mim" (LGPD/right to forget)** | Não temos UI nem fluxo. Quando tiver, plano específico. Provisoriamente: SQL direto no Letta + delete da row em `conversations.metadata`. |
| **Mudança de namespace em prod (migração env)** | Operacional pré-deploy, não comportamento de runtime. |
| **Pessoa com 2 phones cadastrados em momentos diferentes (mesma email)** | ADR define phone como chave primária — email não funde phones. Comportamento esperado: dois agents distintos. Documentar, não testar. |
| **Custo de embeddings OpenAI (`text-embedding-3-small`) descontrolado** | Monitoring de billing, não teste funcional. |
| **Agent name colliding com prefixo de namespace de outro app no Letta compartilhado** | Convenção `aja-agora-` no namespace já isola. Teste cross-app fica em `letta-shared`, não aqui. |

---

## 4. Critério de "pronto" (Definition of Done — PO)

Para liberar pra produção, **todos** abaixo devem estar verdes:

- [ ] Todos os cenários **P0** passam em CI (PO-001, PO-002, PO-008, PO-010, PO-013).
- [ ] Todos os P1 passam ou têm justificativa de adiamento aceita pelo PO.
- [ ] Demo manual: PO-001 + PO-002 executados em ambiente real (não mock),
      gravados em vídeo de 3min e arquivados no Obsidian.
- [ ] Logs de 1 dia de tráfego de homol revisados:
  - [ ] Nenhuma ocorrência de phone E.164 completo em log (grep
        `\+55\d{10,11}`).
  - [ ] Nenhuma ocorrência de nome próprio (heurística: cross-check
        com leads em `conversations.metadata.leadCollection.name`).
  - [ ] Taxa de `letta_fallback: true` < 1% (se maior, calibrar timeout
        ou investigar).
- [ ] Smoke test "matar Letta no meio da sessão" executado em homol
      (PO-008 manual). App não retorna 500 ao usuário, recovery acontece
      < 90s após Letta voltar.
- [ ] PO-005 (mudança de número) e PO-006 (telefone compartilhado) têm
      decisão de produto documentada — se vamos endereçar via fluxo
      explícito ou aceitar o comportamento atual. Sem decisão, **não**
      bloqueia release, mas vai pra TASKS.md como tech-debt aberto.
- [ ] ADR 2026-05-16 referenciado no PR de release; vereditos não cobertos
      por teste listados explicitamente.
- [ ] Job de purge 365d (#12) tem teste pelo menos unitário **OU** é
      adiado por escrito como tarefa pós-MVP (não bloqueia release —
      cleanup só importa após 1 ano de tráfego).

---

## 5. Perguntas em aberto pro time

> Pontos onde o ADR está ambíguo ou onde a implementação atual deixa
> decisão de produto pendente. Antes de produção, decidir explicitamente.

1. **Definição operacional de "stale"** (PO-014). Hoje 7+ dias dispara
   `[REATIVAÇÃO LONGA]` mas nada distingue 30d de 365d. Vale ter um
   bucket extra (`> 90d` = "muito frio, possivelmente outro objetivo")?
   Sugestão PO: testar com usuário real antes de mais código.

2. **Cap de archival por agent** (#5, PO-020). Sem limite, agents
   longevos podem ter milhares de passages, inflando latência de search e
   custo de embedding. Quando definir o teto? 200? 500? E como evict
   (oldest? least-relevant?)?

3. **Erro silencioso em store fire-and-forget** (#14). Hoje uma falha
   só aparece em log. Sem alarme (#11), uma falha sustentada em 100% das
   stores fica invisível por dias. PO sugere: contador agregado e alarme
   quando > 10% de stores falharem em 1h, mesmo na fase 1.

4. **Vereditos #2 + #6 sob telefone compartilhado** (PO-006). Decisão
   formal: aceitamos misturar histórico de duas pessoas no mesmo agent?
   Sinalizar opção produto (separar por nome+phone composto) antes do
   primeiro caso real chegar no support.

5. **Reconciliação automática vs explicita** (#3). Hoje o disparo é
   automático quando lead é capturado. Existe risco de reconciliar para
   o phone errado se o usuário digitar phone de outra pessoa por engano.
   Vale adicionar verificação OTP antes da reconciliação? (Aumenta
   atrito; depende do volume de fraude.)

6. **Comportamento esperado quando `MEMORY_ADAPTER=noop` está ativo**
   (#8). Hoje o app funciona normal mas sem qualquer hint. Esse modo é
   pra qual cenário? Dev local sem Letta? Killswitch em prod? Documentar
   e adicionar runbook curto.

7. **`memory_events` audit table** (#3 + reconciler.ts:44). Implementação
   pendente. PO precisa decidir: bloqueia release ou aceita ir sem
   auditoria local nesta fase? Trade-off: sem ela, debug de "memória
   sumiu" depende do log do Letta + log da app sincronizados.

8. **Visibilidade pro usuário do que o agent sabe**. Em algum momento
   o usuário pode pedir "o que você sabe sobre mim?". Hoje o agent vai
   alucinar baseado no hint. Decidir se temos tool dedicada
   (`recall_user_memory`) ou se confiamos na transparência implícita do
   hint. (Provavelmente fase 2, mas decidir antes que vire incidente.)

---

## Apêndice — Mapeamento veredito → cenário

| Veredito ADR | Cenários que cobrem |
|---|---|
| #1 Sidecar REST | Coberto por construção (testes integration do adapter) |
| #2 Phone E.164 primário | PO-001, PO-002, PO-005, PO-006, PO-009, PO-013 |
| #3 Merge anônimo → identificado | PO-002, PO-010, PO-017 |
| #4 Extração heurística | PO-019, PO-020 |
| #5 Archival memory ativo | PO-001, PO-002, PO-010, PO-020 |
| #6 Reativação por hint | PO-001, PO-003, PO-004, PO-014, PO-022 |
| #7 Namespace por env | PO-012 |
| #8 Adapter + circuit breaker | PO-008, PO-016 |
| #9 PII permitida | PO-006, PO-013 |
| #10 Timeout 2s | PO-008, PO-016, PO-021 |
| #11 Logs estruturados | PO-008, PO-013 |
| #12 Retenção 365d | Adiado (DoD item, não cenário) |
| #13 Lazy create após N=3 | PO-007, PO-011, PO-015 |
| #14 Fire-and-forget | PO-001, PO-008, PO-019 |

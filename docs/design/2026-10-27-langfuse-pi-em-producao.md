# Ligar o rastro do Pi em PRODUÇÃO — receita para o dia da promoção do motor

**Status:** não executado. A produção do aja roda a `main`, que ainda é o motor LangGraph e **já** manda
trace ao Langfuse pelo SDK. Este documento existe para o dia em que o motor Pi for promovido: o que fazer,
em que ordem, e o que vigiar. Nada aqui foi rodado em produção.

Escrito em 27/10/2026, junto com a entrega em dev (D-0014). Tudo que está aqui foi medido **em dev**
primeiro; onde a produção difere, está dito.

## 1. O que a promoção leva

O código já está na `develop`; a promoção para a `main` leva, junto com o motor Pi:

- `src/lib/agent/pi/langfuse.ts` (gate, caminho do plugin, identidade por sessão)
- `src/lib/agent/pi/sessao.ts` (`additionalExtensionPaths`, `{ id: conversationId }`, identidade em volta
  do reload), `converse.ts`, `turno-livre.ts`
- `Dockerfile` — o `COPY` dos escopos `@langfuse` e `@opentelemetry` no estágio `runner`. **Sem ele a
  imagem não carrega o plugin** e o turno roda sem trace, em silêncio (foi o que aconteceu no dev em
  27/10/2026: `Cannot find module '@langfuse/pi-observability-plugin/package.json'`).
- `next.config.ts`, `package.json` + `pnpm-lock.yaml` (plugin em `0.1.2`, exato)

## 2. As seis chaves no secret `tb/prod/aja-agora/env` (sa-east-1)

Acrescentar, sem remover nada:

```
LANGFUSE_TRACING_ENABLED=true
LANGFUSE_BASE_URL=https://langfuse.twobrainstechnology.com
LANGFUSE_PUBLIC_KEY=<par do projeto aja-agora — vault: credentials-langfuse.md>
LANGFUSE_SECRET_KEY=<idem>
LANGFUSE_TRACING_ENVIRONMENT=pi-production
PI_LANGFUSE_MAX_CHARS=40000
```

**`LANGFUSE_TRACING_ENABLED=true` é obrigatório.** O gate do app exige a flag ligada (`true`/`1`/`yes`/`on`)
**e** as três chaves (`src/lib/agent/pi/langfuse.ts:65-86`). Sem a flag, com todas as chaves postas, nada
liga — é o "desligado por padrão" ao pé da letra. O plugin sozinho se comportaria diferente (ele só entende
o literal `"false"` como desligado): quem manda é o nosso gate.

**Por que `pi-production` e não `production`:** a `main` hoje manda trace do LangGraph pelo SDK com
environment `production`. Durante a transição as duas medidas convivem no **mesmo** projeto; com
environment separado, somar custo e latência de um lado não contamina o outro, e comparar antes × depois do
motor vira um filtro. Quando o LangGraph sair de vez, renomeie para `production`.

## 3. Task definition: registrar revisão NOVA

O workflow de deploy **não registra task definition** — ele faz `--force-new-deployment` e só troca a
imagem (`.github/workflows/aws-ecr-deploy.yml`, passo "Force ECS service to pull new image"). Logo, chave
nova no secret **não chega ao container** sozinha. E há uma segunda armadilha: o workflow renderiza a task
definition **no início da run**, então gravar o secret depois de disparar o deploy deixa as chaves de fora.

Ordem correta:

1. gravar o secret (§2) e **conferir** que ele tem as 6 chaves;
2. registrar a revisão nova a partir da atual, acrescentando os 6 `secrets`
   (`...:secret:tb/prod/aja-agora/env-XXXX:CHAVE::`), como foi feito em dev (`aja-agora-dev:12` → `:13`);
3. `aws ecs update-service --cluster tb-cluster --service aja-agora-prod --task-definition <nova>`;
4. esperar `services-stable` e conferir que a revisão nova é a `PRIMARY`;
5. **só então** considerar deployado.

Rollback: `update-service --task-definition <revisão anterior>` (guardar o número antes).

## 4. Verificação (o aceite é o trace)

Um turno real no chat de produção e, na API do Langfuse:

```
GET /api/public/v2/observations?limit=50&environment=pi-production
```

Tem de aparecer: `SPAN Conversational Turn`, uma `GENERATION LLM Call` por chamada (com `usageDetails` e
custo), `TOOL Tool: buscar_cartas` (ou a ferramenta que o turno usar), `sessionId` igual ao
`conversationId` da conversa e `userId` preenchido (cookie `AJA_UID` na web, `wa:<telefone>` no WhatsApp).

Se o turno responder normalmente e **não** houver trace: primeiro o log da task. As duas mensagens
possíveis são `[langfuse] plugin indisponível` (o `COPY` não entrou na imagem ou o pacote sumiu do
`node_modules`) e ausência total de log (a flag não chegou ao processo — volte ao §3).

## 5. O que vigiar

**Provider de OTel por turno, nunca desligado.** O plugin cria um `NodeTracerProvider` por sessão
(`src/index.ts:404`) e `session.dispose()` **não** emite `session_shutdown` — o provider só seria desligado
em `reason === "quit"` (`src/index.ts:972-981`), que não acontece num servidor. O dado sai (o flush é feito
em `agent_settled`, `:965`), mas sobra um provider vazio por turno, com o timer do batch processor.

- Em dev, com pouco volume, é irrelevante.
- Em produção: na primeira semana, olhar a memória da task (RSS no CloudWatch/Container Insights) depois de
  algumas centenas de turnos.
- Se crescer, as saídas são: (a) ligar a observabilidade só em parte do tráfego, (b) chamar
  `session.dispose()` no fim do beat e emitir `session_shutdown` explicitamente, (c) fork do plugin — que o
  mandato proíbe, então só com decisão do dono.

**Custo.** O custo por turno passa a aparecer no Langfuse (`totalPrice`). É a primeira vez que se vê custo
por conversa em produção com o motor Pi; vale comparar com o livro-caixa local (`registrarUsoDeIa`) nos
primeiros dias para garantir que os dois batem.

## 6. O que NÃO fazer

- **Não** setar `LANGFUSE_USER_ID` no ambiente de produção: o app o define **por sessão**, sob fila
  (`comIdentidadeDoTurno`, `langfuse.ts:181`). Fixá-lo no container sobrescreveria a identidade de toda
  conversa com um valor só.
- **Não** apontar `LANGFUSE_BASE_URL` para a instância local (`langfuse.orb.local`) em produção.
- **Não** usar `LANGFUSE_HOST`: nosso gate lê `LANGFUSE_BASE_URL`.
- **Não** reutilizar o projeto `pi-agentes-aja` para o vendedor: ele é dos agentes de trabalho.

## 7. Botão de pânico

`LANGFUSE_TRACING_ENABLED=false` (literal) no secret + revisão de task definition: o app volta ao
comportamento de antes, sem instrumentação nenhuma, e o turno não muda. É a mesma alavanca que liga.

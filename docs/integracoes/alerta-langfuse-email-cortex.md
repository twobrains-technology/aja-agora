# Alerta do Langfuse → e-mail + ocorrência no Cortex

> 2026-08-13 · Pedido do Kairo depois das duas sessões de WhatsApp que morreram em produção
> (`a68b1945` e `04fda013`): **"quero um alerta disso no Langfuse e tem que chegar no e-mail
> com todo o trace cruzado"**, mais a abertura de uma ocorrência no Cortex.

## Por que existe uma rota nossa no meio

Os **Monitors** do Langfuse alertam para **Slack**, **webhook** (POST assinado por HMAC) ou
**GitHub Actions** (`workflow_dispatch`). **Não há saída de e-mail.** E Monitors/Automations
**não têm API pública** (`/api/public/monitors` → 404, não estão na OpenAPI) — a configuração
deles não é versionável em script, só existe na UI. Por isso este documento: o que está no
código está versionado; o que está na UI está **aqui**, e em nenhum outro lugar.

A ponte é `POST /api/observability/alerta-langfuse`
(`src/app/api/observability/alerta-langfuse/route.ts`):

1. valida a assinatura `x-langfuse-signature` (`t=<unix>,v1=<hmac-sha256 de "t.corpo">`);
2. reconstrói os turnos da **janela do alerta** pela API do Langfuse (`dossie.ts`) —
   fala do cliente, fala do agente, tools chamadas, tools que falharam, erros reais e scores;
3. manda o e-mail (SendGrid) com o dossiê;
4. abre a ocorrência no Cortex (MCP sobre HTTP, `abrir_ocorrencia`).

**O e-mail sai primeiro, e o Cortex nunca o bloqueia** — integração de terceiro fora do ar não
pode calar o alerta.

### Detalhes que não são óbvios e já custaram tempo

- A rota responde **200 mesmo em falha parcial**. Devolver erro faz o Langfuse reenfileirar e,
  **na quinta falha seguida, DESABILITAR a automação sozinho**. O que falhou vai no log
  (`[alerta-langfuse]`) e no corpo da resposta.
- Sem `LANGFUSE_WEBHOOK_SECRET` a rota responde **503** e não processa nada. Endpoint sem
  assinatura é um botão público para disparar e-mail e abrir ocorrência em nosso nome.
- O `GraphInterrupt` é **filtrado** da lista de erros do dossiê: ele é o human-in-the-loop
  normal (esperando a resposta do cliente) e aparece como `level=ERROR` em **todo** turno.
  Sem esse filtro o alerta gritaria em 100% dos casos, que é o mesmo que não alertar.
- Na v4 do Langfuse, `/api/public/traces`, `/api/public/sessions` e `/api/public/v2/scores`
  são **404**. O dossiê usa `/api/public/v2/observations` (com `fields=io`, que é o que traz a
  fala) e `/api/public/v3/scores`. O filtro `sessionId` do endpoint de scores volta **vazio**
  na v4 — por isso os scores são buscados **por `traceId`**, um por turno.

## Variáveis de ambiente

| Var | Para quê |
|---|---|
| `LANGFUSE_WEBHOOK_SECRET` | Segredo `lf-whsec_…` gerado pelo Langfuse ao criar a Automation. Sem ele → 503 |
| `ALERTA_OBSERVABILIDADE_TO` | Destinatários, separados por vírgula. Default `contato@twobrainstechnology.com` |
| `CORTEX_MCP_URL` | `https://tb-cortex.twobrainstechnology.com/api/mcp` |
| `CORTEX_MCP_TOKEN` | Bearer do Cortex. Vazio = no-op (o e-mail sai do mesmo jeito) |
| `CORTEX_PROJETO` | Nome do projeto no Cortex. Default `Ajaagora` |

Já existentes e reaproveitadas: `LANGFUSE_BASE_URL`, `LANGFUSE_PUBLIC_KEY`,
`LANGFUSE_SECRET_KEY`, `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`.

Em produção, tudo isso entra pelo Secrets Manager — **a taskdef mapeia secret chave a chave**,
então env nova no secret **sem entrada nova na taskdef não chega ao container**.

## O que criar na UI do Langfuse (a parte não versionável)

Em `https://langfuse.twobrainstechnology.com` → projeto **aja-agora**.

### 1. Automation (a saída)

**Automations → New → Webhook**
- URL: `https://ajaagora.com.br/api/observability/alerta-langfuse`
- Copiar o **signing secret** (`lf-whsec_…`) → é o `LANGFUSE_WEBHOOK_SECRET`.

> ⚠️ Crie a Automation **depois** de a rota estar no ar. Enquanto ela responder 404, cada
> alerta conta como falha de entrega — e cinco falhas seguidas desabilitam a automação.

### 2. Monitors (os quatro gatilhos aprovados pelo Kairo)

Métrica de score **booleano**: a **média é a taxa**. É por isso que os sinais nascem booleanos.

| # | Monitor | Métrica | Alerta quando | Janela | O que pega |
|---|---|---|---|---|---|
| 1 | **Tool falhou** | score `tool_falhou` (média) | `> 0` | 1h | Tool fora do toolset da fase ou tool que estourou. Foi o que matou a sessão `a68b1945` |
| 2 | **Turno mudo** | score `turno_mudo` (média) | `> 0` | 1h | O agente processou e não escreveu uma letra. No WhatsApp é silêncio absoluto |
| 3 | **Gate afundado** | score `gate_entregue` (média) | `< 1` | 1d | O funil parou: o gate disparou e não chegou ao cliente |
| 4 | **Sem tráfego** | observations (contagem) | estado **`NO_DATA`** notificando | 1h | Cliente escrevendo e **nenhum turno rodando** — a falha mais silenciosa de todas |

Em todos: ligar a Automation do passo 1 e **marcar `NO_DATA` para notificar**, não para tratar
como zero.

### 3. Depois de criar

- Uma entrega falhando 5× seguidas **desabilita a automação**. Se o alerta sumir, olhe
  **Automations** antes de culpar o monitor.
- O `tool_falha_nome` (categórico) é quem diz **qual** tool consertar; ele não vira monitor,
  vira a coluna do painel e o corpo do e-mail.

## Os sinais que alimentam isto (código, versionado)

| Score | Onde nasce | Tipo |
|---|---|---|
| `tool_falhou`, `tool_falha_nome`, `tool_falha_tipo` | `src/lib/agent/langgraph/tool-falha.ts` + `funil-scores.ts` | booleano + categóricos |
| `gate_entregue`, `gate_afundado` | `funil-scores.ts` (`scoreDeEntregaDoGate`) | booleano + categórico |
| `turno_mudo`, `artefato_suprimido`, `handoff`, `tools_chamadas`, `gate`, `funil_passo` | `funil-scores.ts` (`scoresDoTurno`) | vários |

Todos determinísticos, emitidos pelo servidor. Juiz de LLM avalia **qualidade da fala** e
nunca enxerga funil parado — no turno que matou a venda em `a68b1945`, os quatro juízes
(`judge_resolved`, `judge_avancou`, `judge_tone`, `judge_hallucination`) **aprovaram**.

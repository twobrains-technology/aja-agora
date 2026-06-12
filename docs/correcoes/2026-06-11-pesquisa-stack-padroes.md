# Pesquisa — padrões mai/jun 2026 pro stack (Next 16 + AI SDK 6) × defeitos da rodada

> Pedido do Kairo (2026-06-11): "quero que voce faca pesquisa na web sobre as
> nossas tecnologias utilizadas aqui e estrategias para esses problemas em
> maio junho 2026... veja se te enriquece". Pesquisa executada por agente web
> na mesma data. Itens enriquecidos: FIX-27..FIX-32 (seções "Estado da arte").

## 1. Estado conversacional ignorado (re-coleta de dados — FIX-27)

- **Slots em estado estruturado fora do transcript**: separação context ≠
  state ≠ memory; slots coletados (telefone etc.) viajam como campos
  estruturados de session state, nunca "o modelo acha no histórico".
  [Agent Memory and Context — editorialge.com](https://editorialge.com/agent-memory-and-context/) (21 mai 2026).
- **Padrão OpenAI Cookbook (Context Engineering for Personalization)**:
  (1) objeto de estado persistente; (2) gravação do slot NO MESMO fluxo do
  submit (server-side); (3) estado injetado como YAML no system prompt a cada
  turno; (4) precedência explícita "última mensagem > sessão > memória >
  defaults". [developers.openai.com/cookbook](https://developers.openai.com/cookbook/examples/agents_sdk/context_personalization).
- **Tool gating determinístico por slot** via `prepareStep` + `activeTools`
  (AI SDK): slot preenchido → tool de coleta SAI do array. Determinismo >
  instrução no prompt. [ai-sdk.dev — Tool Calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling) ·
  [Loop Control](https://ai-sdk.dev/docs/agents/loop-control) · [vercel/ai #7787](https://github.com/vercel/ai/issues/7787).
- **FSM/workflow graph como orquestração** (LLM opera DENTRO do nó; transição
  é código): [arXiv 2505.23006](https://arxiv.org/pdf/2505.23006) (mai 2025) ·
  [Anthropic — Scaling Managed Agents](https://www.anthropic.com/engineering/managed-agents) (abr 2026).

## 2. Ações de UI generativa mal roteadas (FIX-29)

- **Clique de botão NÃO vira texto livre**: data parts tipados
  (`UIMessage<never, {...}>` — schema único front↔back, reconciliação por id)
  e/ou tool approval flow (`needsApproval` + `addToolApprovalResponse`).
  O clique chega como resposta ESTRUTURADA com id estável.
  [Streaming Custom Data](https://ai-sdk.dev/docs/ai-sdk-ui/streaming-data) ·
  [Chatbot Tool Usage](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage).
- **Validação server-side de intents é mandatória** — o próprio SDK lançou
  patch de segurança nisso: `ai@6.0.202` (11 jun 2026) re-valida tool
  approvals do histórico do cliente com HMAC.
  [Releases vercel/ai](https://github.com/vercel/ai/releases).
- **Ação com efeito determinístico conhecido pode nem passar pelo modelo**:
  rotear direto no handler e notificar o modelo via part no turno seguinte
  ("tool-call render pattern").
  [Generative User Interfaces](https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces).

## 3. Dados financeiros em artifacts (FIX-30 e padrão FIX-6/C3)

- **`toModelOutput` (novo no v6)**: `execute` retorna o payload completo
  (vira data part → UI), e `toModelOutput` controla o que volta PRO MODELO —
  pode ser só uma referência ("oferta #123 renderizada"). O modelo nunca vê
  os números crus → não pode redigitá-los. Upgrade natural do nosso
  artifact-guard/coação: corta o problema na ORIGEM; coação vira 2ª linha.
  [vercel.com/blog/ai-sdk-6](https://vercel.com/blog/ai-sdk-6) ·
  [reference tool](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool) ·
  [vercel/ai #9368](https://github.com/vercel/ai/issues/9368).
- **Guardrail = runtime policy, não prompt** + **audit trail de cada coerção**
  (valor que o modelo tentou × valor injetado) — em fintech regulada,
  "hallucinated transaction summaries become examiner findings".
  [toolhalla.ai — guardrails 2026](https://toolhalla.ai/blog/ai-agent-guardrails-io-validation-2026) ·
  [getmaxim.ai — LLM guardrails fintech](https://www.getmaxim.ai/articles/llm-guardrails-for-fintech-compliance-hallucination-prevention-and-audit-trails/).
- **inputSchema Zod estreito é gate nativo no v6** (int de centavos, z.enum de
  prazos reais) — `InvalidToolInputError` re-prompta antes do execute.
  [digitalapplied.com — AI SDK 6 deep dive](https://www.digitalapplied.com/blog/vercel-ai-sdk-6-deep-dive-features-tool-calls-2026) (15 mai 2026).

## 4. Dedupe de resultados de API de terceiros (FIX-28)

- Sem material 2026 específico; pipeline canônico: normalização → dedupe por
  **chave composta de negócio** (fuzzy se precisar) → exibição. Pro nosso
  caso: dedupe determinístico no adapter por
  `administradora+grupo+prazo+crédito+parcela`, nunca delegado ao modelo.
  [grepsr.com — dedupe em pipelines](https://www.grepsr.com/blog/data-deduplication-normalization-grepsr-web-pipelines/).

## Novidades AI SDK 6 / Next 16 (mai-jun 2026) — relevantes pra nós

- **`ai@6.0.202` (11 jun 2026)**: patch de segurança — re-validação
  server-side de tool approvals + HMAC. Atualizar se formos usar
  `needsApproval`.
- **`ai@6.0.201`**: fix de Zod transforms em array output mode.
- **v6 GA estabilizada**: `ToolLoopAgent`, `needsApproval`, `toModelOutput`,
  objeto `Output`, MCP completo, DevTools por step.
  [Migração 5→6](https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0).
- **Bugs conhecidos de duplicação no useChat** (checar versão pinada ao
  executar FIX-31): [#8131](https://github.com/vercel/ai/issues/8131)
  (assistant repetida com tools), [#8227](https://github.com/vercel/ai/issues/8227)
  (parts vazando entre mensagens), [#10926](https://github.com/vercel/ai/issues/10926),
  [#13160](https://github.com/vercel/ai/issues/13160) (resume com text-delta).
- **Next.js 16.2 (mar 2026)**: dev server ~87% mais rápido, Adapters,
  experimental Agent DevTools. 16.3 ainda preview (10 jun 2026).
  [nextjs.org/blog/next-16-2](https://nextjs.org/blog/next-16-2).

## Síntese pras decisões de implementação

1. Re-coleta (FIX-27) se mata **por construção**: slot gravado no submit do
   form (server-side) + `prepareStep`/`activeTools` gateando tool de coleta
   por slot preenchido + snapshot estruturado dos slots no prompt.
2. Intents de botão (FIX-29): enum Zod compartilhado em data parts tipados,
   roteados server-side ANTES do modelo, validados contra o estado.
3. `toModelOutput` (FIX-30/padrão FIX-6): números fora do contexto do modelo
   na origem; logar cada coerção como trilha de auditoria.
4. Dedupe (FIX-28): determinístico no adapter, chave de negócio.

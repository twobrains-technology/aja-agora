# Revisão adversarial — bloco-rev-a-agente-nucleo

**Data:** 2026-06-28
**Revisor:** Opus 4.8 (modelo certo) — rede de segurança contra o código escrito por modelo fraco
**Área:** `src/lib/agent/**`, `src/lib/llm/**`, `src/lib/conversation/**`, `src/lib/memory/**` + testes da área + `tests/regression/agent-trajectory.test.ts` + `tests/eval/**`
**Branch:** `rev/agente-nucleo` (worktree isolado)

## Resumo

Área auditada por leitura integral (54 arquivos de produção) + 4 sub-revisores adversariais
em paralelo, cada achado **verificado pessoalmente** antes de corrigir e validado contra a doc
real das libs (Vercel AI SDK `ai`/`@ai-sdk/anthropic`, `drizzle-orm`, Next.js) via context7.

**7 bugs reais corrigidos** (TDD strict: regressão vista falhar → fix → verde), 1 commit
`test+fix:` por bug. Baseline 1939 testes → **1960** (+21 testes de regressão novos).
Suíte `pnpm test:unit` **verde**, typecheck limpo na área de produção.

Achado recorrente e revelador: **3 testes do modelo fraco abençoavam o próprio bug** —
codificavam o shape/valor errado e ficavam verdes testando o cenário que nunca ocorre em
runtime. Corrigidos junto com o código.

### O que foi verificado e está LIMPO (sem bug)
- **Remoção do Letta:** zero import/cliente/chamada HTTP de runtime; sem dep no `package.json`.
  Só sobraram comentários e nomes de campo de meta (`meta.letta.reconciled`) — permitidos.
- **APIs de lib inventadas:** nenhuma. `ToolLoopAgent`/`stepCountIs`/`generateObject`/`tool()`
  validados contra a doc da AI SDK 6; todo Drizzle usa `eq(col, x)`/`and`/`onConflictDoUpdate`
  reais (zero `col.eq(x)`). Typecheck verde confirma (pega símbolo/método inexistente em código tipado).
- **`require("@/")` em runtime:** nenhum (só `import`/`await import`, que o bundler resolve).
- **Mock em runtime:** nenhum import de `adapters/mock` fora de teste.
- **Prompt cache:** `builder.ts`/`mesa-copilot` cacheiam só o bloco STABLE (cacheControl ephemeral
  no 1º bloco); dynamic/memory sem cache. Sem bug de custo.
- **Agent loop:** tools de domínio disparam via `streamText`/`tool({inputSchema,execute})`+`stepCountIs`;
  nenhuma tool órfã (registry × tool-policy por fase cruzados, fail-closed).
- **3 camadas de regressão:** estruturais + 79 cassettes (`agent-trajectory.test.ts`, MockLanguageModelV3)
  + eval nightly — presentes e verdes.
- **Cripto de identidade** (`conversation/identity.ts`): AES-256-GCM correto, CPF nunca em claro/log.

---

## Bugs corrigidos

### 1. [ALTO] `assist` 500a em prod — HARD_RULES.md não existe no bundle standalone
**`src/lib/agent/assistant-prompt.ts`** · commit `eb9f42e9`
`loadHardRules()` lia `fs.readFileSync(process.cwd()/src/lib/agent/HARD_RULES.md)`. Com
`output:"standalone"` (next.config) o Dockerfile copia só `.next/standalone` + assets — **nunca
`src/`** — então em prod (`cwd=/app`) o arquivo não existe → `ENOENT` → a rota
`/api/admin/personas/[id]/assist` 500a em toda chamada. Funcionava só em dev (cwd na raiz).
**Fix:** conteúdo embutido como módulo (`hard-rules.ts`, gerado do `.md` via `JSON.stringify`) →
entra no bundle JS, sem fs nem cwd. `HARD_RULES.md` segue como fonte (testes estruturais);
teste de sincronia byte-a-byte trava drift. Regressão reproduz o cenário via `chdir` (ENOENT antes do fix).

### 2. [MÉDIO] single-option guard MORTO no caminho `search_groups` → card duplicado
**`src/lib/agent/orchestrator/discovery-count.ts`** · commit `14166e9c`
`extractDiscoveryCount("search_groups")` testava `Array.isArray(output)`, mas `executeSearchGroups`
devolve `{groups,total}` — nunca array. O count saía sempre `null`, então o single-option guard
(FIX-7) nunca disparava num reveal de opção única via `search_groups` e o `recommendation_card`
voltava a duplicar o grupo do detalhamento (o FIX-7 só cobriu `recommend_groups`).
**Teste do modelo fraco que abençoava o bug:** passava um array cru `[{id}]` (shape que a produção
nunca emite) e ficava verde. **Fix:** lê `output.groups`. Camada 1 (shape real) + Camada 2 (cadeia
search_groups → count → guard suprime).

### 3. [MÉDIO] directive do simulador ensinava o agent a descrever gesto de UI
**`src/lib/agent/orchestrator/directives.ts`** (`buildSimulatorDialDirective`) · commit `9d006207`
Dava como frase-modelo "arrasta a agulha pro mês que você quer e ve como fica" — descrição do gesto
físico da UI, proibida pelo `system-prompt.ts` ("Não descreva a UI ('arraste')"). O directive é
injetado por turno e tende a vencer o prompt estável. O detector estrutural existente só barrava a
string exata "arraste o slider", deixando "arrasta a agulha" escapar.
**Fix:** frase-modelo trocada por uma que fala do que a pessoa DESCOBRE (quando contempla). Cassette
barra qualquer verbo de gesto (`arrast`/`desliz`/`puxa a agulha`) no directive.

### 4. [MÉDIO] ortografia — verbo "dá" sem acento nas frases-modelo ao cliente
**`directives.ts` + `system-prompt.ts`** · commit `e3663b42`
Frases-exemplo entre aspas (copy que o agent reproduz ao usuário) com o verbo dar SEM acento:
"da pra fazer um lance", "da pra antecipar", "da uma olhada na simulação/faixa", "da pra ver quando…"
(anti-UI do simulador). Regra inviolável de PT-BR. O varredor de acentuação não inclui "da"/"ve"
(ambíguos — "da"=de+a é válido), então passavam.
**Fix:** acentuadas as frases-modelo (directives de reação + system-prompt). NÃO toca a lista de
frases PROIBIDAS do prompt nem prosa instrucional interna. Teste cirúrgico nos builders/trechos.

### 5. [MÉDIO] `numeric()` truncava valor BR com separador de milhar em 1000x
**`src/lib/memory/extractor.ts`** · commit `7e4a8865`
`.replace(/[^\d.,-]/g,"").replace(",",".")` transformava "100.000,00" em "100.000.00" e
`Number.parseFloat` parava no 2º ponto → **100**. `creditMax`/`monthlyBudget` do cliente eram
truncados no hint de reativação ("Buscava auto de até R$ 100").
**Teste do modelo fraco que abençoava o bug:** "R$ 50.000,00" → `expect(toBe(50))` com comentário
"aceitamos limitação". Corrigido pro valor real (50000).
**Fix:** remove separador de milhar (ponto seguido de 3 dígitos e fim/não-dígito) antes de converter;
decimal genuíno de 2 casas ("100.50") é preservado.

### 6. [BAIXO] `normalizePhoneBR` mutilava número do DDD 55 (chave de identidade)
**`src/lib/memory/identity.ts`** · commit `d16f409d`
Removia "55" inicial sempre, assumindo código de país. Um móvel do DDD 55 (Santa Maria-RS) sem CC
("55999998888", 11 díg) virava 9 dígitos e era REJEITADO (`null`). Como o phone E.164 é a chave de
identidade da memória, esse usuário nunca casava histórico entre turnos/canais.
**Fix:** só trata "55" como CC quando o total tem ≥12 dígitos. Mesmo guard de `lead-collection.ts`.

### 7. [BAIXO] frase PROIBIDA "vou reservar essa opção" como modelo num directive landmine
**`src/lib/agent/orchestrator/directives.ts`** (`buildSimulationInterestDirective`) · commit `25fbbc73`
Dava "Show, vou reservar essa opção pra você" como frase-modelo positiva — mas essa frase é banida
no system-prompt e no `buildAdjustValueDirective` (a plataforma é self-service). Função sem callers
em produção hoje, mas landmine: religar o fluxo "Tenho interesse" → `present_lead_form` emitiria a
frase banida ao cliente.
**Fix:** frase-modelo trocada por fechamento self-service + proibição explícita. Cassette cirúrgico
no builder + sincronia com a proibição do prompt.

---

## PENDENTE-KAIRO (decisão de arquitetura — não verificável daqui)

### M2 — fallback do gateway LLM usa a virtual key do LiteLLM e quebra (Anthropic 401)
**`src/lib/llm/gateway-anthropic.ts:46,61`**
`createGatewayAnthropic()` fixa `apiKey: LITELLM_API_KEY ?? ANTHROPIC_API_KEY`. Quando o gateway
não resolve (SRV transitoriamente falho → `resolveGatewayHost()` retorna `null`), `gatewayFetch`
faz fallback **direto pra `api.anthropic.com`** mas com a **virtual key do LiteLLM** como `x-api-key`
→ Anthropic responde **401**. O próprio comentário do arquivo (linha 7) promete "fallback exige
`ANTHROPIC_API_KEY` viva", contradizendo o código. Resultado: numa falha transitória de DNS/SRV,
em vez de degradar pro Anthropic direto, **toda chamada LLM falha**.
**Por que não corrigi:** o fix correto depende de QUAL key existe em cada ambiente de prod (a virtual
key existe justamente pra não distribuir a real — talvez `ANTHROPIC_API_KEY` nem esteja setada no
gateway). Isso é decisão de infra/arquitetura LLM que não consigo verificar deste worktree (regra:
não cravar o que não verifiquei).
**Fix proposto:** passar `ANTHROPIC_API_KEY` como apiKey do provider e, no `gatewayFetch`, TROCAR o
header `x-api-key` pela virtual key SÓ quando a request vai pro gateway (mantendo a real no fallback
direto). OU remover a promessa de fallback do comentário se ela não é suportada. Decisão pendente do Kairo.

## Observações BAIXO (resiliência — funcionam no caminho feliz; não corrigidas)

Documentadas pelos sub-revisores; deixei intactas por serem edges de robustez cujo fix tem
trade-off ou risco maior que o benefício no momento ("não reescreva o que funciona"):

- **`runner.ts` payload `undefined` → coluna `jsonb notNull`:** se o modelo chamar um `present_*`
  de schema-objeto SEM args, `part.input` pode ser `undefined` e o INSERT viola NOT NULL. Raro
  (Anthropic quase sempre manda `{}`). Fix proposto trivial: `let payload = input ?? {}` no
  `runner.ts` (caminho crítico — preferi não mexer sem teste determinístico forte no gate).
- **`postgres-adapter.ts` race no 1º write concorrente:** `SELECT … FOR UPDATE` não trava linha
  inexistente; dois turnos cross-channel simultâneos de identidade NOVA podem sobrescrever o patch
  do vencedor. Janela estreitíssima (só o 1º write de uma identidade nova). Fix: merge via `excluded`
  no `onConflictDoUpdate` ou advisory lock.
- **`postgres-adapter.ts` `reconcileIdentity` não marca/limpa a origem:** diverge do contrato
  (`adapter.ts` promete "marca origem como migrada"); idempotência preservada via `reconciledFrom`.
- **`reconciler.ts` retorna `success:true` mesmo com falha engolida** pelo adapter best-effort →
  `meta.letta.reconciled=true` marca sem re-tentar. Ligado ao legado de reconciliação Letta.
- **`gateway-anthropic.ts:51` força `http:`** (hardcoded) — ignora `https` se configurado; aceitável
  pro gateway VPC-interno, frágil se mudar.

## Observações informativas (não-bug)
- `dial-payload.ts:24` comentário diz "em %" mas o campo é R$ (o código converte certo).
- Prosa instrucional interna dos directives/prompt tem acentuação inconsistente (faca/botao/comeca)
  — é instrução pra LLM, não copy ao cliente; fora do escopo da regra de ortografia de UI.
- Typecheck whole-repo: 1 erro pré-existente em `src/app/api/admin/conversations/[id]/message/route`
  (RouteHandlerConfig Next 16) — FORA da minha área (rota admin, provável dono de outro bloco da onda);
  não toquei para não colidir.

## NÃO TOCADO (dono = bloco-rev-e)
`src/db/schema.ts`, `drizzle/**` — nenhuma coluna/migration faltando detectada na minha área.
Nenhum PENDENTE-REV-E.

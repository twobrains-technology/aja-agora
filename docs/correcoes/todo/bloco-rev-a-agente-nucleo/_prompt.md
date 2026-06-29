Você é o **REVISOR ADVERSARIAL** do bloco `bloco-rev-a-agente-nucleo`, rodando com **Opus** (modelo certo) num worktree isolado (branch `rev/agente-nucleo`).

**Por que você existe:** TODO o código desta área foi escrito por sessões Superset que rodaram com um **modelo FRACO**. Erros reais já confirmados nesse código (no chat-mesa): `require("@/db/schema")` (o alias `@/` NÃO resolve em require de runtime), `conversations.id.eq(x)` (API Drizzle **inventada** — não existe), e uma coluna nova no schema **sem migration** (quebrou a develop). Sua missão é **caçar esse tipo de erro** na sua área e **corrigir**, com o rigor que o modelo fraco não teve.

**ÁREA / ARQUIVOS:** `src/lib/agent/**` (~107 arquivos — orchestrator/runner, `tools/ai-sdk.ts`, system-prompt, builder, classificador), `src/lib/llm/**`, `src/lib/conversation/**`, `src/lib/memory/**`, e os testes da área + `tests/regression/agent-trajectory.test.ts` + `tests/eval/**`.

**FEATURES QUE ENTRARAM AQUI:** jornada-bevi-lance-embutido, correcoes-qa-jornada, funil-e-retorno-para-sessao, remocao-letta (memória migrou pra Postgres), litellm-gateway (roteamento LLM).

**FOCO EXTRA desta área:**
- Agent loop: as tools de domínio disparam de fato via `streamText`/`tool({inputSchema,execute})` + `stepCountIs`? Tool órfã (definida e não registrada em `active_tools`)? `generateObject` com schema Zod no classificador?
- `system-prompt`/`builder`: frases canônicas PRESENTES, frases proibidas AUSENTES, gates da jornada corretos, prompt cache no bloco *stable* certo, invariantes injetadas. NÃO pode haver meta-narrativa do mecanismo nem alucinação de UI.
- **Remoção do Letta:** confirme que não sobrou chamada/import a Letta em caminho de runtime (memória agora é Postgres). Resíduo órfão = bug.
- As **3 camadas** de regressão de agent (structural + cassette + eval) existem e PASSAM (CLAUDE.md).

**CHECKLIST DE AUDITORIA** (cada arquivo de PRODUÇÃO):
1. **Imports/módulos** — `require()` de alias `@/` em runtime; import quebrado; default×named trocado; símbolo/pacote inexistente.
2. **APIs de lib inventadas** — método que NÃO existe. VALIDE contra a doc via `context7` (Vercel AI SDK `ai`, `@ai-sdk/anthropic`, `drizzle-orm`). Ex real: `col.eq(x)` não existe → `eq(col, x)`.
3. **Lógica** — null/undefined, array vazio, `await` faltando, promise solta, catch vazio engolindo erro, condição invertida, off-by-one, race, estado intermediário.
4. **Regras CLAUDE.md** — pnpm único; **PROIBIDO mock em runtime**; frases canônicas/proibidas do agente; texto sem cara de IA pro cliente; ortografia PT-BR plena em qualquer texto de UI/agente.
5. **Testes** — RODE-os. `.skip`/`.only` esquecido; assertion vaga; teste que não cobre o cenário; mock de serviço interno. Bug de comportamento de agente → 3 camadas (structural + cassette em `tests/regression/agent-trajectory.test.ts` + eval).
6. **Segurança** — input não-validado, secret logado, prompt-injection via dado do usuário. Achou? **PERGUNTE** via `AskUserQuestion` (recomendada em 1º) — não decida segurança sozinho.

**🚫 NÃO TOQUE** (dono = `bloco-rev-e`): `src/db/schema.ts`, `drizzle/**`. Achou coluna/migration faltando → registre em **PENDENTE-REV-E** no `.done` (tabela, coluna, tipo). Migration nunca na mão contra banco.

**PROCESSO:**
1. Audite (leia + RODE os testes). Liste cada bug com **evidência** (`arquivo:linha` + por quê).
2. Cada bug → **TDD strict**: regressão PRIMEIRO (ver FALHAR com a assinatura certa) → fix → ver PASSAR.
3. `pnpm test:unit` **VERDE** antes do push (use local-dev em container se precisar de DB).
4. **1 commit Conventional PT-BR por bug** — `test+fix:`.
5. **Push** `git push origin rev/agente-nucleo`. **NÃO** abra PR, **NÃO** merge, **NÃO** deploy/restart, **NÃO** crie reminder.
6. `.done/{data}-bloco-rev-a-agente-nucleo.md`: bugs achados (com evidência) + corrigidos + PENDENTE (rev-e/Kairo). Nada achado? Diga explícito: "área auditada, N arquivos lidos, testes rodados, 0 bugs" + o que verificou.

**REGRA DE OURO:** seja CHATO e adversarial — você é a rede contra o modelo fraco. "Parece ok" não basta: **prove rodando**. Mas NÃO invente refactor por estética — corrija **bugs**, não reescreva o que funciona.

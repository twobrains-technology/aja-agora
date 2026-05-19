---
feature: AI Assistant no Cadastro/Edição de Agente (Persona) — Backoffice
slug: ai-assistant-persona-edit
date: 2026-05-19
qa: QA crítico (primeiro QA do produto)
branch: feat/ai-assistant-persona-edit
status: NO-SHIP (com ressalvas) — 4 FAILs sérios + 7 SKIPs por ausência de E2E/integration
test-plan: docs/test-plans/ai-assistant-persona-edit.md
---

# QA crítico — AI Assistant no Cadastro/Edição de Persona

## 1. Resumo executivo (5 linhas)

A engenharia entregou base forte: Camadas 1+2+3 todas verdes (`test:unit` 778/778, 10/10 cassettes `BUG-ASSISTANT-*`, 5/5 eval LLM real em 13s). Schema Zod, route guards (401/403/404/400/429 + isolamento por admin + path traversal), HARD_RULES drift detection, executeProposePatch e prompt structural estão sólidos e bem cobertos.

**Mas** a feature **NÃO está pronta para ship**. Quatro FAILs sérios contra critérios binários do plano: (1) **botão "Editar" do DiffCard não existe** — CA-04 e CA-09 inteiramente FAIL; (2) **`setValue` sem `shouldValidate: true`** — CA-06 FAIL no flag; (3) **sidebar é Sheet, não persistente** — CA-01 e D2 FAIL no UX prometido; (4) **zero E2E Playwright + zero integration** — todos P0-01..07, P1-04 race, S-04/S-05 sem cobertura observável.

Riscos antifraude do próprio plano (RA-03 stale window, RA-05 React Compiler quirks, RA-09 DiffCard usa `patch.before` direto, RA-06 R$ inventado no example) **continuam abertos**. Server-side não bloqueia tópico canônico no `forbiddenTopic.add` nem condition fraca em `handoffTrigger.add`, embora HARD_RULES.md liste essas restrições.

Pode shipar como **MVP interno bloqueado por feature flag** (`FEATURE_PERSONA_ASSISTANT=true`) só pro Kairo/Bruna mexerem, mas **não está pronto para uso por admin leigo real** que é o público-alvo da feature.

---

## 2. Tabela de critérios — PASS/FAIL/SKIP por critério

| CA  | Status | Evidência |
|-----|--------|-----------|
| CA-01 sidebar persistente lado-a-lado, viewport ≤768px vira Sheet | **FAIL** | `src/components/admin/personas/persona-edit-shell.tsx:120-138` usa `Sheet` em todos viewports. Não há `<aside>` lado-a-lado do form. Spec D2 explícito: "persistente". |
| CA-02 Textarea + ScrollArea + indicador streaming | PASS | `ai-assistant-sidebar.tsx:122-205` tem ScrollArea, Textarea, `Loader2` cursor. |
| CA-03 mensagens user/assistant ordenadas com role distinto | PASS | `ai-assistant-sidebar.tsx:134-138`. |
| CA-04 DiffCard com 3 botões `Aplicar` / `Editar` / `Rejeitar` | **FAIL** | `diff-card.tsx:109-128` só tem `Aplicar` e `Descartar`. `grep -n "Editar\|onEdit"` em todos os componentes retorna **vazio**. Botão Editar não foi implementado. |
| CA-05 ask_clarification renderiza apenas texto | PASS | `ai-assistant-sidebar.tsx:179-193` renderiza `output.question` em div azul, sem DiffCard. |
| CA-06 `setValue` com `{ shouldDirty: true, shouldValidate: true }` | **FAIL** | `ai-assistant-sidebar.tsx:42-93` chama setValue só com `{ shouldDirty: true }`. Flag `shouldValidate` **ausente em todos os 7 paths** (voiceTone/example.add/example.remove/forbiddenTopic.add/forbiddenTopic.remove/handoffTrigger.add/handoffTrigger.remove). CA exige binário. |
| CA-07 visual "✓ aplicado" após Aplicar | PASS | `diff-card.tsx:72-76`. |
| CA-08 visual "✕ descartado" após Rejeitar | PASS | `diff-card.tsx:77-81`. Teste estrutural cobre (`diff-card.test.tsx:99-110`). |
| CA-09 Editar inline (Textarea + Salvar/Cancelar) | **FAIL** | Sem implementação (consequência de CA-04). |
| CA-10 sair da rota descarta conversa | PASS estrutural (sem persistência) | useChat in-memory, sem storage. Sem teste E2E que confirme sair-volta — só inferência arquitetural. |
| CA-11 conversa não persiste em nenhuma tabela | PASS estrutural | Nenhum INSERT no route. Não há `assistant_sessions` schema. **SKIP** integration (sem teste real). |
| CA-12 SSE text/event-stream | PASS | `route.ts:88` `result.toUIMessageStreamResponse()`. Test mock devolve content-type correto. |
| CA-13 401/403 sem session/role | PASS | `route.test.ts:77-99`. `requireRole("admin")` retorna 401 sem session, 403 com role errada. Suite verde 7/7. |
| CA-14 rate limit 10/min/admin | PASS | `assistant-rate-limit.ts` + `route.test.ts:138-224` valida 10x200 → 11ª 429, isolamento por admin. |
| CA-15 server lê persona + injeta no system prompt | PASS | `route.ts:54-86` + `assistant-prompt.test.ts:51-91` confirma `displayName`, `role`, `category`, `voiceTone`, examples como JSON. |
| CA-16 server valida `patch.before === row[field]` | PASS | `assistant-tools.ts:115-127` + cassette `BUG-ASSISTANT-DIFF-BEFORE-MATCHES-CURRENT`. Mensagem amigável: "copie o texto EXATO". |
| CA-17 server valida `personaVersionSeen === row.version` | PASS estrutural | `assistant-tools.ts:108-113` + cassette. **SKIP** integration test 2 sessions — não existe. |
| CA-18 HARD_RULES bloqueia patch inválido server-side | PASS | `assistant-tools.ts:104-159` cobre voiceTone/example.add/forbiddenTopic.add/handoffTrigger.add. Cassette `BUG-ASSISTANT-NO-CTA-LEAK`. |
| CA-19 ANTHROPIC_API_KEY não vaza client-side | PASS no bundle | `grep -r "sk-ant-" .next/static/` retorna 0 hits. **WARN cross-cutting**: `.env` raiz tem `ANTHROPIC_API_KEY=sk-ant-api03-...` em texto puro → Next standalone copia pra `.next/standalone/.env`. Não vaza pro browser, vaza pro artefato de build/deploy. Higiene fora da feature, mas reportar. |
| CA-20 histórico truncado em 12 turns | **FAIL no número** | `route.ts:14` `MAX_HISTORY = 24` (não 12). CA-20 do plano diz 12; R4 do spec também diz 12. Spec sec 9 Camada 2 espera `expect(messages.length).toBeLessThanOrEqual(12 + 1 system)`. Implementação usa 24. Decisão arquitetural mudou silenciosamente — spec/plano não atualizado. |
| CA-21..26 schema Zod | PASS | `persona-patch.test.ts` 14/14, cobre todos os 7 kinds + invariantes. |
| CA-27 HARD_RULES.md estrutura | PASS | 240 linhas, cobre as 4 seções obrigatórias. |
| CA-28 HARD_RULES sync test | PASS | `HARD_RULES.test.ts` 5/5. **Validei adversarialmente**: adicionei frase canônica fake → 3/5 testes falham (HARD_RULES.md, cassettes, system-prompt.ts). Detector funciona. |
| CA-29 voiceTone.after sem frase proibida | PASS | `executeProposePatch` bloqueia, cassette cobre. Eval LLM real (`EVAL-ASSISTANT-LESS-FORMAL`) valida. |
| CA-30 example.add.agentReply sem frase proibida | PASS | `assistant-tools.ts:129-137` + cassette `BUG-ASSISTANT-INTERNAL-REASONING-LEAK`. |
| CA-31 ambíguo → ask_clarification | PASS | Cassette `BUG-ASSISTANT-AMBIGUOUS-MUST-ASK` + eval real EVAL-ASSISTANT-LESS-FORMAL. |
| CA-32 viola HARD_RULE → explica em texto, sem patch | PASS estrutural | Server rejeita; teste eval `EVAL-ASSISTANT-NO-CTA-LEAK` cobre. |
| CA-33 concierge não propõe valor de parcela | **WARN** | Sem teste estrutural ou cassette dedicado. `assistant-tools.ts` **não recebe role/category** no ctx — validação só por substring ("R$ X") não existe. Confio no LLM seguir HARD_RULES.md (Camada 3 eval) mas server-side não enforça. Eval dedicado também ausente. |
| CA-34 specialist auto/imovel respeita categoria | **WARN** | Mesmo problema CA-33. Sem cassette `BUG-ASSISTANT-RESPECT-PERSONA-CATEGORY`. Sem eval dedicado. Defesa só via prompt + LLM. |
| R-01..R-05 regressão dos 5 bugs | PARCIAL | R-01/R-03 cobertos (`BUG-ASSISTANT-NO-CTA-LEAK`, `BUG-ASSISTANT-INTERNAL-REASONING-LEAK`). **R-02 META-NARRATIVE, R-04 RESPECT-3-GATES, R-05 NO-PROMISE-NO-RENDER ausentes** como cassettes próprios do assistant. Frases-base cobertas via FORBIDDEN_PHRASES, mas plano explicitamente requer cassette por bug. |
| S-01 non-admin 401/403 | PASS | route.test.ts cobre. |
| S-02 rate limit 11+ | PASS | route.test.ts cobre. |
| S-03 ANTHROPIC_API_KEY no payload | PASS no client | Streamtext payload não inclui chave. |
| S-04 SQL injection | PASS estrutural | Drizzle paramentariza. **SKIP** pentest manual — não rodado. |
| S-05 XSS no rationale | PASS estrutural | `diff-card.tsx` não usa `dangerouslySetInnerHTML` (`grep` retornou vazio). React escapa por default. **SKIP** Playwright XSS escape spec — não existe. |
| S-06 path traversal no `[id]` | PASS | route.test.ts:226-245 explicitamente testa `../../etc/passwd` → 404. |
| P-01..P-03 performance/latência | **SKIP** | Sem instrumentação de timing, sem trace, sem teste manual reportado. |
| **P0-01 admin pede "mais simpática"** | **SKIP** | Sem E2E Playwright. Eval Camada 3 cobre parcialmente o lado LLM (`EVAL-ASSISTANT-LESS-FORMAL`), mas não há UI navigation. |
| **P0-02 Aplicar preenche form sem persistir** | **SKIP** | Sem E2E. Lógica de setValue existe (`ai-assistant-sidebar.tsx:42-94`) mas falta `shouldValidate`. |
| **P0-03 Salvar persiste + bump version + invalida cache** | **SKIP** | Sem E2E. Rota PATCH existing já estava no projeto pre-feature. |
| **P0-04 Rejeitar não muda form** | PASS estrutural | `diff-card.test.tsx:99-110` cobre. |
| **P0-05 ambíguo → clarification** | PASS via Cassette+Eval | OK. |
| **P0-06 clarification → example.add válido** | PASS via Cassette/Eval indireto | OK estrutural. |
| **P0-07 sair → descarta conversa** | **SKIP** | Sem E2E. Inferência arquitetural sem prova. |
| P1-01..P1-12 edge cases | **MAJ SKIP** | Só P1-03 (BUG-ASSISTANT-DIFF-BEFORE-MATCHES-CURRENT) e P1-10 (schema rejeita kind errado) cobertos. P1-04 race, P1-06 reject loop adapta, P1-07 fora escopo activeTools, P1-08 concierge, P1-09 30 examples, P1-11 tópico canônico, P1-12 multi-tab — **todos ausentes**. |

**Resumo numérico**:
- **PASS**: 22 / 38 critérios mensuráveis
- **WARN**: 2 (CA-33, CA-34 — só LLM-defendido)
- **FAIL**: 4 (CA-01, CA-04, CA-06, CA-09, CA-20)
- **SKIP**: 10 (E2E inteiro + integration + perf + manual UI)

---

## 3. FAILs detalhados

### FAIL-01 — Botão "Editar" do DiffCard não existe (CA-04, CA-09)

**Como reproduzir**:
```bash
grep -n "Editar\|onEdit\|editar inline" src/components/admin/personas/diff-card.tsx
# → vazio
grep -n "Editar\|onEdit" src/components/admin/personas/diff-card.test.tsx
# → vazio
```

**Comportamento esperado** (CA-04, CA-09, spec D3, plano sec 4 + sec 2 frontend/UX):
DiffCard tem 3 botões pending: Aplicar, **Editar**, Rejeitar. Editar abre Textarea inline + Salvar/Cancelar. Salvar chama setValue com valor editado; Cancelar volta ao estado pending.

**Comportamento observado**:
`src/components/admin/personas/diff-card.tsx:109-128` renderiza apenas `Aplicar` e `Descartar`. Type `DiffCardState` (linha 10) só prevê pending/applied/rejected — sem estado `editing`.

**Fix sugerido**:
- Adicionar estado `editing` ao `DiffCardState`
- Adicionar `<Textarea>` inline em `diff-card.tsx` controlado por state local
- Receber `onApply` com valor editado (assinatura `onApply: (patch: PersonaPatch, overrideAfter?: string) => void`)
- Cobrir com teste em `diff-card.test.tsx`

**Impacto**: admin leigo não pode tweak fino do `after` sugerido pela IA — tem que pedir nova proposta. Reduz a métrica de sucesso (3min/sessão).

---

### FAIL-02 — `setValue` sem `shouldValidate: true` (CA-06)

**Como reproduzir**:
```bash
grep -n "shouldValidate" src/components/admin/personas/ai-assistant-sidebar.tsx
# → vazio
```

**Esperado** (CA-06 binário): `formMethods.setValue(field, after, { shouldDirty: true, shouldValidate: true })`.

**Observado**: `ai-assistant-sidebar.tsx:42-93` chama setValue com **apenas** `{ shouldDirty: true }` em todos os 7 paths.

**Fix sugerido**: trocar `{ shouldDirty: true }` por `{ shouldDirty: true, shouldValidate: true }` em todas as chamadas dentro de `applyPatch`. RA-05 do plano alerta: React Compiler 1.0 do React 19.2 + Next 16 pode pular re-render do botão Salvar sem `shouldValidate`.

**Impacto**: form pode ficar dirty=true mas isValid=false não recomputado → botão Salvar visualmente habilitado mas submit explode na PATCH route por validação do zodResolver. UX feio.

---

### FAIL-03 — Sidebar NÃO é persistente, é Sheet (CA-01, spec D2)

**Esperado** (CA-01): "sidebar `AIAssistantSidebar` renderiza **ao lado** do form. Em viewport ≤ 768px, vira `Sheet` colapsável". Spec D2: "Sidebar lateral **persistente** (padrão Cursor/Copilot)".

**Observado**: `persona-edit-shell.tsx:120-138` usa `<Sheet>` em **todos** os viewports — admin precisa clicar botão "AI Assistant" pra abrir drawer.

**Fix sugerido**: layout responsivo split-pane em viewports ≥ md (768px+) — render `<aside>` direto na grid. Fallback `<Sheet>` só em mobile. Pode usar Tailwind responsive: `hidden md:flex` no `<aside>` + `md:hidden` no `<SheetTrigger>`.

**Impacto**: UX prometida (chat sempre visível ao lado do form) não materializou. Admin tem que abrir/fechar drawer perdendo contexto. Feature parece "menos AI-first" do que vendida.

---

### FAIL-04 — `MAX_HISTORY = 24` mas plano/spec exigem 12 (CA-20, R4 do spec)

**Esperado**: CA-20: "Histórico passado pro LLM é truncado em **últimos 12 turns**". Spec R4: "Limita histórico ao últimos 12 turns".

**Observado**: `route.ts:14` `const MAX_HISTORY = 24;`.

**Fix sugerido**: três opções:
1. Trocar pra 12 (cumprir spec sem questionar)
2. Manter 24, **atualizar spec/plano**, justificar (custo de token aceitável, contexto melhor pro LLM raciocinar)
3. Confirmar com Bruna se 24 era decisão consciente

**Impacto**: custo de token ~2x do previsto. Conversa longa entrega ~12k tokens extras em prompts. Pode ser ok arquiteturalmente, mas é **drift silencioso** — plano/spec não atualizados.

---

## 4. Riscos de falsa aprovação NÃO cobertos (RA-NN do plano)

| RA | Status | Comentário |
|----|--------|------------|
| RA-01 prompt drift vs cassette | **MITIGADO** | Camada 1 `assistant-prompt.test.ts` + sync test cobrem. |
| RA-02 HARD_RULES.md rotted | **MITIGADO** | Validado adversarialmente — drift quebra 3 testes. |
| RA-03 stale window de ~500ms entre fetch e emit do patch | **ABERTO** | `currentRow` é capturado no início do POST. Stream dura 5-30s. Outro admin pode editar nesse window. Sem refetch da `version` no emit. Plano explicitamente lista mitigação que **NÃO foi implementada**: "Validar `version` no momento do emit do patch (não só no início do POST). Pegar `SELECT version FROM personas WHERE id = ...` dentro de `propose_patch.execute()`". |
| RA-04 E2E mock vs prod cookie/session | **ABERTO** | Sem E2E nenhum. Não testou nem com mock nem com session real. |
| RA-05 React Compiler memoization quirks | **ABERTO** | Sem E2E pra checar `Salvar.toBeEnabled()` após Aplicar. Combinado com FAIL-02 (`shouldValidate` ausente), risco amplificado. |
| RA-06 R$ inventado em `agentReply` | **ABERTO** | `executeProposePatch` aceita `assistantResponse` com `R$ 800/mes` sem erro. Tested adversarialmente — passa green. Sem regex `/R\$\s*[\d.]+/` na lista. |
| RA-07 rate limit em prod com Redis | **ABERTO** | Implementação in-memory (`assistant-rate-limit.ts`) admite isso. Se ECS rodar 2+ tasks (típico de prod), admin pode contornar abrindo abas roteadas em tasks diferentes. Sem integration test com Redis real. |
| RA-08 `validate_against_rules` ordering | PARCIAL | Sem assertion explícita de ordem `validate → propose` em cassette; defesa server-side em `propose_patch.execute` cobre o caso pior. |
| RA-09 DiffCard usa `patch.before` direto do LLM | **ABERTO** | `diff-card.tsx:90` renderiza `{patch.before}` direto. LLM poderia inventar `before` plausível enquanto server valida vs DB → admin vê diff bonito, mas Aplicar sobrescreve valor diferente do esperado. Server-side bloqueia (porque rejeita patches com `before !== row.voiceTone`), então em prática não acontece — **mas se aplicado por bug no validator, UX desalinhada**. Fix do plano: "DiffCard busca o valor do form atual via `formMethods.getValues(field)` para mostrar visualmente". |
| RA-10 conversa stateless perde trabalho em reload | **N/A** | Decisão de produto explícita (D8). Sem mitigação esperada. |

**Riscos adversariais novos encontrados** (NÃO listados no plano):

- **A-01**: `forbiddenTopic.add` aceita topic="consórcio" — server-side **não bloqueia** tópicos canônicos. HARD_RULES.md sec 4.3 lista os 6 canônicos ("consórcio", "simulação", "carta de crédito", "parcela", "lance", "contemplação"), mas só no doc — `executeProposePatch` só valida `responseWhenAsked` por frase proibida. Adversarial test confirmou: `kind="forbiddenTopic.add", topic="consórcio"` retorna `{ok: true}`. **Camada 3 eval depende do LLM seguir o doc** — não há defesa server-side.

- **A-02**: `handoffTrigger.add` aceita `condition="user diz ajuda"` — HARD_RULES.md sec 4.4 proíbe condition fraca ("ajuda", "dúvida"). Validator só roda `detectViolations(condition, "handoffTrigger.condition")` que cobre frases proibidas, **não** condition fraca.

- **A-03**: `example.remove` com `targetId` que **não existe** na ficha atual retorna `{ok: true}`. Server não cruza com `currentRow.examples`. Aplicar gera noop (filter no front), mas DiffCard mostra "REMOVER id 000..." pro admin como se fosse legítimo.

- **A-04**: Persona role/category **não chegam** ao `executeProposePatch`. `assistant-tools.ts:6-15` `AssistantToolsContext` só tem `personaId`, `personaVersion`, `currentRow`. CA-33/CA-34 (concierge não dá valor; auto não fala imóvel) só ficam por conta do LLM. Server-side `concierge` poderia propor `example.add` com `assistantResponse: "A parcela é R$ 800"` e passa direto. Defesa só via prompt + LLM.

- **A-05**: `MAX_HISTORY = 24` **conflita** com CA-20/R4 mas o teste assistant-prompt não trava esse número. Drift detectable só por leitura humana do código vs doc.

---

## 5. Sugestões de teste adicional (gaps no plano)

1. **E2E Playwright completo** — `tests/e2e/admin-persona-assistant.spec.ts` cobrindo P0-01..07. **Bloqueante de release** segundo Definition of Done do plano sec 12.

2. **Integration test 2-sessions race** (`tests/integration/persona-assist-race.test.ts`) — confirma CA-17 em DB real. Mockar dois admins, simular UPDATE entre POST e emit, observar resposta.

3. **Cassettes faltantes**: `BUG-ASSISTANT-NO-META-NARRATIVE`, `BUG-ASSISTANT-RESPECT-3-GATES`, `BUG-ASSISTANT-NO-PROMISE-NO-RENDER`, `BUG-ASSISTANT-RESPECT-PERSONA-ROLE`, `BUG-ASSISTANT-RESPECT-PERSONA-CATEGORY`, `BUG-ASSISTANT-HISTORY-TRUNCATION` (esse vira teste estrutural de `MAX_HISTORY`), `BUG-ASSISTANT-CANONICAL-TOPIC-PROTECTION`. Plano sec 10 lista 16 cassettes esperados; só 4 implementados.

4. **Server-side rejection de tópicos canônicos** — adicionar lista no `executeProposePatch` quando `kind === "forbiddenTopic.add"`:
   ```ts
   const CANONICAL_FUNNEL_TOPICS = ["consórcio", "simulação", "carta de crédito", "parcela", "lance", "contemplação"];
   if (CANONICAL_FUNNEL_TOPICS.some(t => normalize(patch.after.topic).includes(normalize(t)))) {
     return { ok: false, error: "tópico canônico do funil — não pode bloquear" };
   }
   ```

5. **Server-side rejection de condition fraca em handoffTrigger.add**.

6. **Passar role/category no `AssistantToolsContext`** + validações server-side de CA-33/CA-34 (concierge não propõe `R$\s*\d+`; auto não menciona "imóvel|apartamento|casa"; imóvel não menciona "carro|moto").

7. **Re-fetch da `version` no `propose_patch.execute`** (RA-03 mitigação explícita do plano).

8. **DiffCard busca `before` do form** (RA-09 mitigação explícita).

9. **Smoke pós-deploy em dev** — fluxo P0-01..03 em ambiente real. Definition of Done item antifraude. Não rodado.

10. **Manual UI confirm pelo Kairo** — item antifraude do DoD. Não realizado.

---

## 6. Definition of Done — checklist do plano sec 12

### Gate de release (P0)
- [ ] CA-01..CA-34 verificados — **FAIL**: CA-01, CA-04, CA-06, CA-09, CA-20 reprovados; CA-33, CA-34 só por LLM
- [ ] P0-01..P0-07 passando em Playwright — **FAIL**: sem E2E nenhum
- [x] R-01..R-05 em Camada 2 — **PARCIAL**: R-01/R-03 sim, R-02/R-04/R-05 não
- [ ] S-01..S-06 em integration + manual — **PARCIAL**: S-01/S-02/S-06 estruturais; S-04/S-05 sem manual
- [x] `npm run test:pre-commit` verde — **PASS** (3s suite verde 778/778 + eval 5/5)
- [ ] `tests/integration/**` verde — **N/A**: arquivos não existem
- [ ] `tests/e2e/admin-persona-assistant.spec.ts` — **N/A**: arquivo não existe

### Gate de qualidade (P1)
- [ ] P1-01..P1-12 cassette ou manual — **PARCIAL**: 2/12 cobertos
- [ ] P-01..P-03 latência/frame rate — **N/A**: sem instrumentação

### Documentação
- [x] HARD_RULES.md versionado
- [x] HARD_RULES.test.ts em sync
- [ ] Spec atualizado com decisões (MAX_HISTORY=24 vs spec=12, ausência de botão Editar)
- [ ] Done report em `.done/2026-05-19-NNNN-ai-assistant-persona-edit.md` — **N/A** (não emitido pela engenharia)
- [ ] Manual UX confirmado pelo Kairo — **N/A**

### Antifraude
- [ ] RA-01..RA-10 endereçados — **3 mitigados, 6 abertos, 1 N/A**
- [ ] Smoke pós-deploy em dev — **N/A**

---

## 7. Veredito final

**NO-SHIP no estado atual.** Bloqueadores duros:
1. CA-04/CA-09 (botão Editar ausente) — feature prometida ao usuário, não entregue
2. CA-06 (`shouldValidate` ausente) — bug latente no estado do form
3. CA-01 (sidebar não persistente) — UX prometida no spec não materializou
4. Zero E2E — não há prova de que o fluxo end-to-end funciona em browser real
5. RA-03 ainda aberto — race window de stream-time não tratada

**Recomendação**: voltar pra engenharia com a lista de FAIL/A-NN, fechar bloqueadores, rodar E2E (pelo menos P0-01..04), e re-submeter. Não negociar critérios pra "fechar" — eles foram acordados no test plan.

**Pode shipar como soft-launch interno** (Kairo + Bruna apenas, atrás de `FEATURE_PERSONA_ASSISTANT` por user.id) pra validar UX sem expor admin leigo (público-alvo) ao estado quebrado. Mas isso é decisão de produto, não QA.

**Tempo gasto no QA**: ~12min. Comandos verdes em <30s total. Eval LLM real 13s. Adversarial drift test 5s. Sem custo Anthropic além do `test:eval:quick` único (~$0.01).

---

## Apêndice — comandos executados

```bash
npm run test:unit                                                 # 3.0s — 778/778 PASS
npx vitest run tests/regression -t "BUG-ASSISTANT"                # 0.34s — 10/10 PASS
npx vitest run src/lib/agent/HARD_RULES.test.ts                   # 0.4s — 5/5 PASS
npx vitest run src/lib/validations/persona-patch.test.ts          # 0.45s — 14/14 PASS
npx vitest run src/app/api/admin/personas/[id]/assist/route.test  # 0.82s — 7/7 PASS
npx vitest run src/lib/agent/tools/assistant-tools.test.ts        # incl. test:unit — 15/15 PASS
npm run test:eval:quick                                           # 13.4s — 5/5 PASS (eval LLM real)
npx tsc --noEmit                                                  # 19 erros pré-existentes — ZERO novos em assistant/diff-card/persona-patch/HARD_RULES
grep -r "sk-ant-" .next/static/                                   # 0 hits — client bundle limpo
grep -r "sk-ant-" .next/standalone/                               # 2 hits em .env standalone (higiene do .env raiz, pre-existente)
```

Adversarial drift simulation: adicionado fake phrase ao `CANONICAL_FORBIDDEN_PHRASES` → 3/5 testes do `HARD_RULES.test.ts` falharam corretamente (HARD_RULES.md/cassettes/system-prompt.ts). Revertido. Detector funciona.

Adversarial executeProposePatch (10 vetores): case-mix, espaços extras, newline, homoglyph cyrillic, tópico canônico, condition fraca, targetId inexistente, R$ inventado, concierge com valor — **6/10 passaram quando deviam falhar** (gaps de validação documentados em A-01..A-04).

# QA Crítico — Lote "Correções dos testes manuais do Kairo (2026-06-05)"

> **Persona:** QA crítico e chato, primeiro QA do produto Aja Agora.
> **Régua:** [`docs/test-plans/correcoes-testes-manuais-2026-06-05.md`](correcoes-testes-manuais-2026-06-05.md) (PO Lead).
> **Spec:** [`docs/correcoes/2026-06-05-testes-manuais-kairo.md`](../correcoes/2026-06-05-testes-manuais-kairo.md).
> **Commits auditados:** `af44b35..3ccf3da` (11 commits — FIX-1..FIX-10 + probe de cota).
> **Restrição:** cota Anthropic do workspace ESGOTADA (probe = HTTP 400 "usage limits", volta 2026-07-01). E2E conversacional e eval LLM **impossíveis agora** → auditoria ESTÁTICA + testes determinísticos.
> **Método:** leitura de diff/produção + execução de vitest (Camadas 1+2). Suites rodadas: `tests/regression/agent-trajectory.test.ts` (133 pass), `test:unit` (1173 pass/4 skip), todos os `route*.test.ts` (1 FAIL), integration (41 pass).

---

## Tabela resumo — critério → veredito

| Critério | Veredito | Evidência curta |
|---|---|---|
| **FIX1-CA1** directive cita papel Aja Agora | ✅ PASS | `directives.ts:37` "papel da plataforma… encontrar o grupo com maior chance… prazo que voce deseja" |
| **FIX1-CA2** cassette regex papel | ✅ PASS | cassette `FIX-1-PAPEL-AJA-AGORA` (3 testes verdes) |
| **FIX1-CA3** sem auto-apresentação | ✅ PASS | `directives.ts:37` "NAO diga Aqui e Helena/Rafael" + cassette |
| **FIX1-CA4** returning ≤2 frases, sem explicar produto | ✅ PASS | `buildExperienceReturningDirective` `directives.ts:41` "UMA frase… NAO explique o produto" |
| **FIX1-CA5** rubric cobra papel (nightly) | ⚠️ INCONCLUSIVO-SEM-LLM | rubric tem âncora `jornada-rubric.ts:142`, mas C3 não roda (cota) |
| **FIX2-CA1** gate credit "valor do bem", sem "faixa de crédito" | ✅ PASS | `gate-questions.ts:19` |
| **FIX2-CA2** label slider = "Valor do bem" | ✅ PASS | `web/adapter.ts:32` + `plan-estimate-picker.tsx:99` |
| **FIX2-CA3** sem "carta de crédito" SECA em gate/label | ✅ PASS | grep: única ocorrência é educação docx-literal (`gate-questions.ts:31`, com explicação acoplada) |
| **FIX2-CA4** payloads Bevi intactos | ✅ PASS | `creditValue/creditMin/creditMax` preservados (id interno "credit" mantido) |
| **FIX2-CA5** WhatsApp formatter copy amigável | ✅ PASS | `formatter.ts` linhas trocadas (diff d5dc071) |
| **FIX2-CA6** cassette reveal sem jargão seco, valores literais | ✅ PASS | cassette de reveal verde + `jargao-valor-do-bem.test.ts` (15 asserts) |
| **FIX2-CA7** rubric atualizada (nightly) | ⚠️ INCONCLUSIVO-SEM-LLM | `jornada-rubric.ts:132` usa "valor do bem"; C3 não roda |
| **FIX3-CA1** componente popula qualifyAnswers | ✅ PASS | `route.ts:601-612` merge de targetMonth/lanceValue/lanceEmbutido |
| **FIX3-CA2** nextGate pula gate preenchido | ✅ PASS | `qualify-state.ts:42-61` + cassette "plano completo pula pro identify" |
| **FIX3-CA3** selo de estimativa SEMPRE | ✅ PASS | `plan-estimate-picker.tsx:192-195` + test |
| **FIX3-CA4** quem só conversa: funil canônico intacto | ✅ PASS | `qualify-state.lance-embutido.test.ts` percorre funil sem componente |
| **FIX3-CA5** zero Bevi pré-identify | ✅ PASS | `plan-estimate.ts` é heurístico puro; nenhum import de adapter self-contract |
| **FIX3-CA6** agente CONFIRMA, não re-pergunta | ✅ PASS | `buildPlanReactionDirective` `directives.ts:62-70` + cassette |
| **FIX3-CA7** simulator-offer determinístico pós-reveal | ✅ PASS | `qualify-state.ts:73` + `runner.simulator-gate.test.ts` verde |
| **FIX3-CA8** CONTEXT.md aval Bernardo pendente | ✅ PASS | `CONTEXT.md` D9 |
| **FIX4-CA1** copy gate lance-embutido | ✅ PASS | `gate-questions.ts:29-34` |
| **FIX4-CA2** nextGate lance-embutido determinístico p/ hasLance=yes | ✅ PASS | `qualify-state.ts:55` (todo hasLance respondido) |
| **FIX4-CA3** NÃO dispara p/ maybe/no?** ⚠️ DIVERGÊNCIA INTENCIONAL | ✅ PASS (com ressalva) | `qualify-state.ts:55` agora dispara p/ TODOS — ver QA-1 |
| **FIX4-CA4** cassette + reação curta não explica | ✅ PASS | cassette `FIX-4-LANCE-EMBUTIDO-PRA-TODOS` + `buildLanceReactionDirective` |
| **FIX4-CA5** 1ª "carta de crédito" acoplada | ✅ PASS | `gate-questions.ts:31` explicação na mesma frase |
| **FIX4-CA6** rubric cobra ramo (nightly) | ⚠️ INCONCLUSIVO-SEM-LLM | `jornada-rubric.ts:51`; C3 não roda |
| **FIX5-CA1** guard pré-reveal false | ✅ PASS | `whatsapp-optin-guard.test.ts` verde |
| **FIX5-CA2** regra no prompt (NUNCA WhatsApp junto/antes) | ✅ PASS | `system-prompt.ts:726` (locked) "PROIBIDO… pedir WhatsApp" |
| **FIX5-CA3** cassette detector 2 perguntas | ✅ PASS | cassette `FIX-5-OPTIN-TEXTO-PRE-REVEAL` (detector `asksWhatsappWithoutTool`) |
| **FIX5-CA4** sem meta-narrativa identidade | ✅ PASS | locked stage não tem frases-modelo; cassette |
| **FIX5-CA5** gates não engolidos | ✅ PASS | cassette + `E2E-REAL optin pré-reveal suprimido` verde |
| **FIX5-CA6** E2E web opt-in só pós-reveal | ⛔ INCONCLUSIVO-SEM-LLM | requer chat conversacional em tela (sem LLM) |
| **FIX6-CA1** dial payload == oferta ativa | ✅ PASS | `dial-payload.ts:54-62` + `runner.ts` coage na emissão |
| **FIX6-CA2** input "errado" do modelo é corrigido | ✅ PASS | `dial-payload.test.ts` (20k→35k) + cassette `FIX-6` |
| **FIX6-CA3** creditValue dial == card | ✅ PASS | snapshot vem do mesmo âncora (recommendation/simulation/group) `runner.ts:193-204` |
| **FIX6-CA4** simulator-offer copy docx | ✅ PASS | `gate-questions.ts:47-49` "3, 6 ou 12 meses" + cassette verde |
| **FIX6-CA5** motor puro inalterado | ✅ PASS | `contemplation-dial.test.ts` verde |
| **FIX6-CA6** eval nightly (passo 4) | ⚠️ INCONCLUSIVO-SEM-LLM | C3 não roda |
| **FIX6-CA7** posição registrada CONTEXT.md | ✅ PASS | `CONTEXT.md` D9 "simulador passo 4 PERMANECE" |
| **FIX7-CA1** 1 opção = card único | ✅ PASS | `runner.ts:194` suprime recommendation_card se `discoveryCount===1` |
| **FIX7-CA2** cassette sem plural enganoso | ✅ PASS | cassette `FIX-7-REVEAL-1-OPCAO` + directive announce honesto `directives.ts:159-163` |
| **FIX7-CA3** badge qualitativo no card; % só comparativo | 🟡 PASS PARCIAL | card usa `scoreLabel` (sem %) `recommendation-card.tsx`; **comparison-table NÃO mostra % de compatibilidade** — ver QA-2 |
| **FIX7-CA4** insufficientOptions marcado | ✅ PASS | `recommendation.ts` (regressão existente) |
| **FIX7-CA5** escassez comunicada | ⚠️ PARCIAL | directive instrui (`directives.ts:166`); cassette não cobre o caminho 0/insufficient — ver QA-3 |
| **FIX7-CA6** sim card sem CTA "Tenho interesse" duplicado | ✅ PASS | `simulation-result.tsx` filtra `/tenho interesse/i` das actions |
| **FIX7-CA7** ≥2 opções inalterado | ✅ PASS | `buildSearchSummaryDirective` ramo ≥2 + `REVEAL-ORDER` verde |
| **FIX8-CA1** unit cálculo (3 casos) | ✅ PASS | `offer-mapper.test.ts` (sem campo→null, 0→null, real preservado) |
| **FIX8-CA2** render nunca "R$ 0,00" seco | ✅ PASS | `simulation-result.tsx:124` `> 0 &&` + `simulation-result.test.tsx` |
| **FIX8-CA3** fonte real, fallback 43% eliminado | ✅ PASS | `offer-mapper.ts:133-136` (heurística removida) |
| **FIX8-CA4** consistência com FIX-6 | ✅ PASS | dial usa `computeContemplationDial`; mapper só toca `necessaryBidToContemplate` |
| **FIX8-CA5** offer-mapper.test fixture real | ✅ PASS | usa `BeviOffer`; fixture `ok-selfcontract-simulation.json` tem campo real >0 |
| **FIX8-CA6** WhatsApp formatter sem "R$ 0,00" | ✅ PASS | `formatter.ts:177-181` só renderiza com `>0` |
| **FIX9-CA1** handler injeta CPF mascarado + celular | ✅ PASS | `runner.ts:196-202` loadIdentity → `enrichContractFormPayload` |
| **FIX9-CA2** render mascarado quando prefill | ✅ PASS | `contract-form.tsx:80-100` modo confirmação |
| **FIX9-CA3 (SEGURANÇA)** payload sem CPF em claro | ✅ PASS | `contract-form-prefill.ts:13` só 3 primeiros+2 últimos; cassette "NUNCA carrega CPF em claro" |
| **FIX9-CA4** LGPD permanece | ✅ PASS | `contract-form.tsx:135-147` |
| **FIX9-CA5** guard duplo-submit | ✅ PASS | `contract-form.tsx:46,56-58` submittingRef |
| **FIX9-CA6** CONTEXT.md follow-up concluído | ✅ PASS | `CONTEXT.md` D12 |
| **FIX10-CA1** upload 1 slot não auto-envia | ✅ PASS | `document-upload.tsx:60-93` onPick sem sendAction |
| **FIX10-CA2** mensagem só explícita/ambos | ✅ PASS | `document-upload.tsx:51-58` finish() via botão ou ambos slots |
| **FIX10-CA3** estado por slot independente | ✅ PASS | `document-upload.tsx:43,81-89` |
| **FIX10-CA4** transporte base64 intacto | ✅ PASS | `/api/chat/document/route.ts` slot/fileBase64/filename/mimeType |
| **FIX10-CA5** "Pular por agora" inalterado | ✅ PASS | `document-upload.tsx:171-186` document-skip |
| **FIX10-CA6** E2E só frente → sem msg; verso → 1 msg | ⛔ INCONCLUSIVO-SEM-LLM | requer fluxo passo 5 em tela com bot respondendo (sem LLM) |

### Contagem

- **PASS:** 47 (inclui 2 PASS-com-ressalva: FIX4-CA3, FIX7-CA3-parcial)
- **FAIL:** 0 critérios do plano *diretamente* (mas há 1 regressão de teste fora do plano — QA-4, P0)
- **INCONCLUSIVO-SEM-LLM:** 9 (FIX1-CA5, FIX2-CA7, FIX4-CA6, FIX5-CA6, FIX6-CA6 nightly; FIX5-CA6 e FIX10-CA6 E2E)

> ⚠️ **Atenção:** nenhum critério do plano falhou, MAS o lote deixou **uma suíte de regressão pré-existente VERMELHA** (`route.lead-form-prefill.test.ts`) — achado P0 abaixo. "Feito" do lote (item 6: matriz de regressão 100% verde) **NÃO** está satisfeito.

---

## Achados adversariais

### QA-4 — [P0] FIX-5 deixou `route.lead-form-prefill.test.ts` VERMELHO (regressão de teste não corrigida)

**Severidade:** P0 — viola a "Definição de feito" do próprio lote (item 6: matriz de regressão 100% verde) e a regra do projeto "Camadas 1+2 verdes no CI".

**Evidência (executei):**
```
FAIL src/app/api/chat/route.lead-form-prefill.test.ts:245
> Bug B — system prompt … narrativa estratégica ao oferecer o WhatsApp (anti-regressão)
AssertionError: Nenhum padrão de narrativa estratégica … encontrado no system prompt das specialists.
expected false to be true
```

**Causa-raiz:** FIX-5 (commit `1a70230`) MOVEU as 4 frases-modelo de opt-in (com a narrativa "instabilidade / não perder atendimento / continuar por lá") de `SPECIALIST_BASE_PROMPT` (estável) para o bloco dinâmico `whatsappOptinSection("open")` (`system-prompt.ts:743-751`). O teste antigo `route.lead-form-prefill.test.ts:240` afirma a narrativa em `SYSTEM_PROMPT + SPECIALIST_BASE_PROMPT` (estático) — agora vazio dessas frases.

**Contradição direta no repo:** o próprio FIX-5 introduziu `system-prompt.whatsapp-optin-stage.test.ts:87` que afirma o OPOSTO (`SPECIALIST_BASE_PROMPT` NÃO contém "Posso anotar seu WhatsApp"). Os dois testes não podem ficar verdes juntos sem o teste antigo ser atualizado pra olhar o bloco dinâmico.

**Por que escapou:** o pre-commit (`.husky/pre-commit`) roda `test:unit`, que **exclui** `--exclude='src/**/route*.test.ts'`. O workflow GHA (`.github/workflows/aws-ecr-deploy.yml`) **não roda testes** (só build+deploy Docker). Ou seja, **nenhum gate automático** pega esse arquivo. A narrativa estratégica continua viva no produto (bloco "open"), mas o teste anti-regressão está cego pra ela.

**Correção esperada (não apliquei — só reporto):** atualizar `route.lead-form-prefill.test.ts:237-246` pra incluir `whatsappOptinSection("open")` no texto combinado verificado (a narrativa migrou pra lá, não sumiu). O produto está correto; o teste está desatualizado.

---

### QA-1 — [P2] FIX-4 mudou semântica do gate lance-embutido: agora dispara p/ Não/Talvez (FIX4-CA3 do plano dizia o oposto)

**Severidade:** P2 — divergência **intencional e documentada**, mas o plano do PO Lead (FIX4-CA3) e os cenários FIX-4 do spec ("lance maybe/no → gate NÃO dispara") afirmam o **contrário** do que foi implementado.

**Evidência:** `qualify-state.ts:55` `if (q.lanceEmbutido === undefined) return "lance-embutido"` — sem checar `hasLance`. Comentário (`qualify-state.ts:49-54`) e `CONTEXT.md` D10 justificam: docx diz que o lance embutido "ajuda quem não possui todo o valor do lance hoje" = quem respondeu Não/Talvez. A `jornada-canonica.md` foi atualizada (commit eb3f84a) com a interpretação fixada.

**O ponto de atenção:** o **plano FIX4-CA3** ("`nextGate()` NÃO retorna lance-embutido quando maybe/no") está agora em conflito com o código. A implementação seguiu o spec FIX-4 reclassificado (educa TODO MUNDO), mas o critério binário FIX4-CA3 do plano não foi reescrito. **Régua desatualizada vs código** — decidir qual é a verdade (a interpretação D10 parece a correta e foi aprovada). Marquei FIX4-CA3 como PASS porque o código segue a decisão aprovada D10, mas o critério literal do plano falharia. **Recomendo corrigir o critério no plano** pra não confundir auditoria futura.

---

### QA-2 — [P2] FIX7-CA3 meio-órfão: % de compatibilidade não existe na comparison-table

**Severidade:** P2 — a metade load-bearing do critério (tirar "43% compatível" do card) está PASS; a outra metade ("% numérico aparece SÓ na comparison table") é **insatisfazível** porque a comparison-table nunca mostrou % de compatibilidade.

**Evidência:** `recommendation-card.tsx` agora usa `scoreLabel(payload.score)` (qualitativo, sem %). Mas `comparison-table.tsx` só exibe `adminFeePercent.toFixed(1)%` (taxa de admin) — `grep "score|compat"` na comparison-table = vazio. Logo "% compatível na comparison" não existe em lugar nenhum.

**Impacto:** a queixa real do Kairo (43% minando confiança no card único) está resolvida. O critério do plano assumiu uma feature (% comparativo na tabela) que o produto não tem. Não é regressão — é critério mal-especificado. Reporto pra rastreabilidade.

---

### QA-3 — [P2] FIX-7 escassez: caminho 0-opções / insufficientOptions sem cassette nem branch explícito de anúncio

**Severidade:** P2 — cobertura incompleta de um edge que o spec pediu investigar.

**Evidência:**
- O guard de supressão só pega `discoveryCount === 1` (`runner.ts:194`). Com **0 opções**, nenhum card é suprimido (não há card a suprimir de qualquer forma).
- A directive (`directives.ts:159-163`) tem braços de anúncio só pra "3+/2/1" — **não há braço explícito pra 0**. Confia no passo 5 (`insufficientOptions=true` → `directives.ts:166`).
- **Não há cassette** cobrindo o turno com `insufficientOptions=true` nem com 0 resultados — FIX7-CA5 ("agente comunica escassez") só tem a instrução no prompt, não um detector determinístico.

**Risco:** comportamento de escassez/0-opções depende 100% da LLM seguir a directive — sem cassette, uma regressão futura no prompt passaria batido. O spec FIX-7 explicitamente pediu "Edge (0 opções)" e investigar por que veio 1 opção pra moto R$ 20k (investigação não documentada nos commits).

---

### QA-5 — [P2] FIX-8 deixou OUTROS campos heurísticos sem selo (`embeddedBidValue`, `receivedCredit`)

**Severidade:** P2 — fora do escopo literal do FIX-8 (que mirou só `necessaryBidToContemplate`), mas a mesma regra PROIBIDO-mock se aplica.

**Evidência:** `offer-mapper.ts:124-125`:
```ts
const embeddedBidValue = round2(offer.embeddedBid ?? (offer.finalValue * embeddedPercent) / 100);
const receivedCredit  = round2(offer.receivedCredit ?? offer.finalValue - embeddedBidValue);
```
Esses dois mantêm **fallback heurístico** (% inventado) quando a Bevi não manda o campo — e são EXIBIDOS na UI ("Valor que você recebe", bloco lance embutido) **sem selo de estimativa**.

**Mitigação atual:** a fixture real (`ok-selfcontract-simulation.json`) traz os 3 campos (`embeddedBid`, `receivedCredit`, `necessaryBidToContemplate`) com valores >0, então no caminho happy os fallbacks não disparam. Mas se uma oferta real vier sem `embeddedBid`, o usuário verá um número heurístico mascarado de dado real — exatamente o vício que o FIX-8 matou pra `necessaryBidToContemplate`. **Recomendo aplicar a mesma política (dado real ou omitir/selar) a esses dois campos.**

---

### QA-6 — [P2] Código morto deixado pelo FIX-3: `value-picker.tsx` + branch `slider` no gate-renderer

**Severidade:** P2 — sem impacto funcional, mas confunde manutenção e o branch ainda pode ser acionado por engano.

**Evidência:** após FIX-3, o gate `credit` emite `kind: "plan"` (`web/adapter.ts:81-88`). Nenhum gate emite `kind: "slider"` mais. Mas `gate-renderer.tsx:72-81` mantém o fallback pra `ValuePicker` e `value-picker.tsx` continua no repo. O `handleSliderSubmit` (`gate-renderer.tsx:41-57`) é inalcançável.

**Recomendação:** remover `value-picker.tsx`, o branch `slider` e `handleSliderSubmit` — ou documentar por que ficam (ex.: rollback rápido). Não é bug; é dívida.

---

### QA-7 — [P3] FIX-3: lance slider pode ficar com valor stale acima do novo max ao reduzir o valor do bem

**Severidade:** P3 — cosmético/UX, sem corromper dado.

**Evidência:** `plan-estimate-picker.tsx:139` `max={Math.round(assetValue * 0.8)}`. Se o usuário sobe lance (ex.: R$ 16k com bem de R$ 20k) e depois reduz o bem pra R$ 10k, `lanceValue` (state) não re-clampa — fica R$ 16k > novo max R$ 8k. O engine usa `Math.max(0, lanceValue)` (`plan-estimate.ts:108`) e só compara `lanceDisponivel >= ownCashNeeded`, então o estimate fica coerente; só o thumb do slider visualmente passa do trilho e o "lance coberto" pode exibir true otimista. Sem impacto em `qualifyAnswers` (lance vai cru pro merge). Reporto pra completude adversarial.

---

### QA-8 — [P1] Camada 3 (eval LLM) genuinamente INCONCLUSIVA — drift de modelo NÃO está sendo validado neste lote

**Severidade:** P1 — não é defeito do código, é **gap de validação** que precisa ficar gritante.

**Evidência:** probe direto à API Anthropic (executado por mim agora) = `HTTP 400 → "usage limits"`. `tests/eval/anthropic-availability.ts` está correto (só pula em indisponibilidade externa, nunca mascara assert). MAS isso significa que **9 critérios C3/E2E** (FIX1-CA5, FIX2-CA7, FIX4-CA6, FIX5-CA6, FIX6-CA6, etc.) **não foram validados de fato** — só estruturalmente. O comportamento real da LLM (o agente realmente fala o papel da Aja Agora? realmente não vaza WhatsApp pré-reveal em texto NOVO? realmente confirma sem re-perguntar?) está coberto por **cassettes determinísticos da fala observada no bug**, não pelo modelo vivo. Cassette pega a regressão exata; **não pega uma formulação nova** que viole a regra. Ver pendências abaixo.

---

## Pendências quando a cota Anthropic voltar (2026-07-01)

Validar com LLM real / E2E em tela — o que cassette+structural NÃO consegue garantir:

1. **FIX-1 (E2E web):** clicar "É a primeira vez" e confirmar que a resposta REAL do agente contém o papel da Aja Agora E o tom de afinidade pedido — não só que a directive instrui. Rodar `jornada-rubric` nightly (critério passo 1).
2. **FIX-5 (E2E web — CRÍTICO):** percorrer a qualificação real (entre `lance` e `lance-value`) e confirmar que o agente NÃO escreve "Posso anotar seu WhatsApp?" em texto livre num turno de gate. Era intermitente — o cassette só prova a fala antiga; o modelo precisa ser exercitado N vezes no estágio `locked`. **FIX5-CA6 está aberto.**
3. **FIX-4 (eval):** confirmar que pra `hasLance=no/maybe` o gate educativo dispara E o agente não explica lance embutido por conta na reação curta (intermitência original).
4. **FIX-6 (eval/E2E):** reveal CANOPUS real → simulator-offer → dial; confirmar números do dial == card (35k, 475,93, 96m) com o modelo escolhendo o input livre. Cassette prova a coerção; falta o modelo vivo gerar input divergente de verdade.
5. **FIX-3 (E2E):** submeter "Planeje sua conquista" e confirmar que o agente CONFIRMA a estratégia ("fechado assim?") sem re-perguntar valor/prazo/lance, e que o funil pula direto pro identify.
6. **FIX-7 (eval):** reveal com 1 opção real — confirmar texto SEM plural enganoso e card único; **e investigar/reproduzir o caso 0-opções e insufficientOptions** (QA-3) com o agente comunicando escassez.
7. **FIX-10 (E2E passo 5):** subir só a frente → confirmar ZERO mensagem auto-enviada e bot silencioso; subir verso (ou "Pronto, enviei tudo") → 1 mensagem única + 1 resposta do bot. **FIX10-CA6 está aberto.** (Passo 5 contra Bevi real bloqueado por D3 — usar seam no `create-proposal`.)
8. **Todos os 9 critérios C3** (rubric/eval nightly) — re-rodar `npx vitest run --config vitest.eval.config.ts` e exigir verde antes de declarar o lote 100% feito.

### Item a corrigir ANTES de mergear (não depende de cota)

- **QA-4 (P0):** atualizar `route.lead-form-prefill.test.ts` pra olhar `whatsappOptinSection("open")` — suíte de regressão precisa voltar ao verde. Sem isso, "feito" do lote (matriz 100% verde) é falso.

### Itens de higiene (P2, opcionais pré-merge)

- QA-2 / QA-1: reescrever os critérios FIX7-CA3 e FIX4-CA3 do plano pra refletir a realidade do produto/decisão aprovada (régua desatualizada).
- QA-5: aplicar política PROIBIDO-mock a `embeddedBidValue`/`receivedCredit` no offer-mapper.
- QA-6: remover código morto (`value-picker.tsx`, branch `slider`).

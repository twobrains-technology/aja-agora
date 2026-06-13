# Plano de Teste — Lote "Correções dos testes manuais do Kairo (2026-06-05)"

> **Status:** PO Lead (skill QA sênior) · fonte de verdade do que "feito" significa neste lote.
> **Spec do lote:** [`docs/correcoes/2026-06-05-testes-manuais-kairo.md`](../correcoes/2026-06-05-testes-manuais-kairo.md) (FIX-1 a FIX-10 + decisões aprovadas).
> **Regra da jornada:** [`docs/jornada/jornada-canonica.md`](../jornada/jornada-canonica.md) — critérios validam contra o **docx**, não contra a implementação.
> **Decisões/desvios:** [`docs/jornada/CONTEXT.md`](../jornada/CONTEXT.md) (D1 CPF antecipado, DES-1 assinatura) · [`docs/jornada/proposta-simulador.md`](../jornada/proposta-simulador.md) (conceito Bernardo).
> **Ambiente E2E:** `http://aja-feat-jornada-bevi-lance-embutido.orb.local` (local containerizado, branch `feat/jornada-bevi-lance-embutido`).

---

## Princípios de aceite (valem para TODO FIX)

1. **Critério binário ou não-validado.** Cada critério abaixo é "passa/não-passa". Nada de "deveria".
2. **3 camadas de regressão de agent** (CLAUDE.md):
   - **C1 Structural** (`src/**/*.test.ts`, <1s): assert contra source de produção (substring no prompt/diretiva, campo em payload, ordem de gates, matemática pura).
   - **C2 Cassette** (`tests/regression/agent-trajectory.test.ts`, <30s): `MockLanguageModelV2` + `simulateReadableStream`; 1 `describe` por bug; detector + asserts estruturais. Determinístico, zero Anthropic/DB.
   - **C3 Eval LLM-judge** (`tests/eval/jornada-aja-agora.eval.test.ts` + `src/lib/eval/jornada-rubric.ts`, nightly): não bloqueia merge; pega drift.
3. **PROIBIDO mock em runtime.** Nenhum número exibido vem de JSON fictício. Fixtures = capturas reais Bevi em `src/lib/adapters/bevi/__fixtures__/` (`ok-selfcontract-simulation.json`, `ok-simulation.json`), **só em teste**.
4. **`persistMeta` faz MERGE.** Todo write de meta usa `reloadMeta` + spread (`{...refreshed, campo}`) — nunca sobrescreve metadata inteiro. Critério estrutural negativo em qualquer fix que toque meta.
5. **Determinismo > probabilismo.** Bugs intermitentes de LLM (FIX-4, FIX-5) só passam quando o comportamento vira **determinístico** (gate dirigido pelo orquestrador / guard / verificação), nunca "o modelo geralmente acerta".
6. **Web × WhatsApp.** Copy visível alterada (FIX-1/2/4/7) cobre os dois canais — `src/lib/whatsapp/formatter.ts` é alvo de assert quando o artifact/texto existe no WhatsApp.

### Dados de teste / fixtures / personas

| Recurso | Onde | Uso |
|---|---|---|
| Oferta real CANOPUS (R$ 35.000, parcela R$ 475,93, 96m) | `__fixtures__/ok-selfcontract-simulation.json` | FIX-6/7/8 — fonte da "oferta ativa" |
| Resposta de simulação Trilho A | `__fixtures__/ok-simulation.json` | FIX-8 — campos `embeddedBid`/`necessaryBidToContemplate` |
| Self-contract vazio / multiproposal | `__fixtures__/ok-selfcontract-empty.json`, `…-multiproposal.json` | FIX-7 — 0 e 1 opção |
| Persona web | "Kairo", moto, R$ 20k, lance "sim" R$ 4k, lance embutido "sim" | reproduz o cenário dos prints |
| Identidade pré-coletada (gate identify) | `storeIdentity`/`loadIdentity` (AES-256-GCM, `IDENTITY_ENC_KEY`) | FIX-9 — CPF/celular já no DB |
| Latência Bevi | ~29s na 1ª descoberta | E2E: `browser_wait_for` no card, NUNCA `waitForTimeout` |

### Pontos de falha conhecidos do domínio (aplicar como edge a cada FIX)

- Intermitência de LLM → cassette + structural, não "rodei e passou".
- Race gates × artifacts: `mayEvaluateGates`/`allowGateWithArtifacts` (`runner.ts:48,365`) — turno com artifact não emite gate, EXCETO simulator-offer no turno do reveal.
- `persistMeta` sobrescreve metadata inteiro se não fizer merge (`runner.ts` usa `reloadMeta`+spread).
- Canal web×WhatsApp divergente (formatter próprio).
- Bevi `create-proposal` cria proposta REAL (D3) → E2E real do passo 5 **bloqueado**; usar fixture/seam.

---

## FIX-1 — Explicação de "primeira vez" precisa do papel da Aja Agora + tom com afinidade

**Onde:** Passo 1, ramo `experience="first"`. Diretiva `buildExperienceFirstDirective` (`src/lib/agent/orchestrator/directives.ts:32`).
**Regra docx** (`jornada-canonica.md` linha 19): a explicação de quem não fez consórcio DEVE conter *"Nosso papel na Aja Agora é encontrar o grupo com maior chance de atender seu objetivo no prazo que você deseja."* — hoje **faltando**.

### Cenários
- **Happy:** usuário clica "É a primeira vez" → explicação inclui o papel da Aja Agora + os 3 bullets do docx (sem juros / contemplação sorteio-ou-lance / diferença de financiamento) com tom acolhedor.
- **Edge:** ramo `doubts` (`buildExperienceDoubtsDirective`) — verificar se o papel da Aja Agora também cabe (docx só exige no "primeira vez", mas tom de afinidade vale).
- **Edge:** ramo `returning` — NÃO despejar a explicação longa (regressão: não pode passar a explicar produto pra quem já conhece).
- **Regressão:** diretiva continua proibindo auto-apresentação ("Aqui é Helena/Rafael") e tools no turno.

### Critérios de aceite
| ID | Critério (binário) |
|---|---|
| FIX1-CA1 | `buildExperienceFirstDirective` contém âncora que obriga o agente a citar o papel da Aja Agora (substring "papel" + "encontrar o grupo" / equivalente do docx). **C1.** |
| FIX1-CA2 | Cassette do turno "É a primeira vez": resposta contém regex `/papel.*Aja Agora|Aja Agora.*encontrar o grupo/i`. **C2.** |
| FIX1-CA3 | Cassette: resposta NÃO contém auto-apresentação (`/Aqui (é|e) (Helena|Rafael|Camila)/i`) nem "anos de (experiência|mercado)". **C2.** |
| FIX1-CA4 | Ramo `returning`: resposta ≤ 2 frases, NÃO explica o produto (sem "sem juros" + "taxa de administração" juntos). **C2.** |
| FIX1-CA5 | `jornada-rubric.ts` (fidelidade passo 1) cobra o bullet do papel da Aja Agora; eval nightly não regride. **C3.** |

**Output esperado:** texto do agente com o papel da Aja Agora; meta inalterado; sem tool-call no turno.

---

## FIX-2 — Linguagem amigável: eliminar jargão "crédito"/"carta de crédito" da copy visível

**Onde:** copy visível em toda jornada. Alvos: `gate-questions.ts` (gate `credit` linha 17), `value-picker.tsx` (label do slider), `recommendation-card.tsx` (linha 95 "Crédito"), `simulation-result.tsx` (linha 75 "Valor do crédito"), `contemplation-dial.tsx` (linha 114 "Crédito que você recebe"), `closing-presentation.ts`, `contract-summary.ts`, `whatsapp/formatter.ts`, system-prompt/diretivas.
**Regra docx:** usa "valor do bem"; a 1ª menção de "carta de crédito" acopla explicação ("o valor que você recebe pra comprar o seu bem").
**⚠️ NÃO tocar:** schema, payloads Bevi (`creditValue`/`creditMin`/`creditMax`), código interno.

### Cenários
- **Happy:** gate `credit` pergunta usando "valor do bem" (não "faixa de crédito" seco). Label do slider = "Valor do bem".
- **Happy:** 1ª menção de "carta de crédito" na jornada vem acoplada à explicação; menções seguintes usam termo amigável.
- **Edge:** componentes onde "crédito" aparece como métrica (recommendation/simulation/dial) — trocar o rótulo VISÍVEL, mantendo o campo do payload (`creditValue`).
- **Regressão (crítica):** valores literais da Bevi continuam exibidos sem arredondar (system-prompt linha 470) — troca de copy não pode mexer em número.
- **Regressão:** WhatsApp formatter espelha a copy nova.

### Critérios de aceite
| ID | Critério (binário) |
|---|---|
| FIX2-CA1 | `gateQuestion("credit")` NÃO contém "faixa de crédito" seco; contém "valor do bem". **C1.** |
| FIX2-CA2 | Label do slider de `value-picker`/componente do gate credit = "Valor do bem" (assert no payload `field.label`, não "Crédito"). **C1.** |
| FIX2-CA3 | Assert NEGATIVO: nenhuma pergunta de gate nem label visível contém a string "carta de crédito" SECA (sem explicação acoplada na mesma frase). **C1.** |
| FIX2-CA4 | Payloads/schema Bevi inalterados: `creditValue`/`creditMin`/`creditMax` continuam nos types e adapters (grep não-vazio). **C1.** |
| FIX2-CA5 | `whatsapp/formatter.ts` usa a copy amigável nos mesmos campos (assert de substring). **C1.** |
| FIX2-CA6 | Cassette afetado (reveal/detalhamento): texto do agente não introduz "carta de crédito" seca; valores literais preservados. **C2.** |
| FIX2-CA7 | `jornada-rubric.ts`: se citava "crédito" como âncora de fidelidade, atualizado para a copy nova; nightly verde. **C3.** |

**Output esperado:** copy de gate/labels/cards em "valor do bem"; campos de payload intactos; números literais.

---

## FIX-3 — Gate de crédito vira o componente dinâmico do Bernardo (4-5 indicadores) — e investigação do simulador sumido

**Onde:** Passo 2, gate `credit`. Hoje: `value-picker` com 2 sliders (Crédito + Parcela) + "Buscar opções".
**Decisão aprovada (3):** **HÍBRIDO VENDEDOR** — o componente preenche `qualifyAnswers`; `nextGate()` pula o que já está preenchido; agente confirma em conversa em vez de re-perguntar; ramo educativo do lance embutido **sobrevive sempre**. Estimativas do componente SEMPRE exibem o selo "estimativa — valores reais virão da busca" (decisão 1 + critério explícito do projeto).
**Indicadores (visão Kairo, a refinar):** (1) Valor do bem, (2) Quando pretende usar (range de datas/tempo até contemplação), (3) Parcela mensal, (4) Valor do lance, (+5) Lance embutido. Mexeu em um → os outros recalculam.
**⚠️ Constraint:** conceito do Bernardo — implementar como proposta; registrar aval pendente no CONTEXT.md.

### Cenários
- **Happy (componente):** usuário mexe nos indicadores → `qualifyAnswers` recebe `creditMax`/`monthlyBudget`/`prazoMeses`/`lanceValue`/`lanceEmbutido` conforme mexido; ao submeter, `nextGate()` pula os gates já preenchidos e o agente CONFIRMA ("Vi que você quer a moto em ~6 meses e R$ 4 mil de lance — fechado assim?").
- **Happy (selo):** o componente exibe o selo de estimativa enquanto os números são heurísticos (pré-busca). **Critério explícito do projeto.**
- **Edge (só conversa):** usuário IGNORA o componente e responde tudo por texto/chips → sequência canônica de gates `credit → timeframe → lance → lance-value → lance-embutido → identify` permanece intacta (não pode quebrar pra quem não usa o componente).
- **Edge (parcial):** usuário preenche só alguns indicadores → gates restantes perguntam normal (decisão 3).
- **Regressão (crítica):** ramo educativo do lance embutido (`gate lance-embutido`) sobrevive SEMPRE — mexer no componente não pode engolir o gate (cruza com FIX-4).
- **Regressão:** NUNCA chamar Bevi pré-identify (decisão 1) — o componente é 100% heurístico/local até o gate `identify`.
- **Investigação (subtarefa):** por que `simulator-offer` "nunca apareceu" no 1º teste manual. Hoje é dirigido determinístico (`nextGate` linha 69, `decideShowGate` linha 107, `allowGateWithArtifacts` runner:48). Confirmar caminho e que `runner.simulator-gate.test.ts` cobre.

### Critérios de aceite
| ID | Critério (binário) |
|---|---|
| FIX3-CA1 | Componente do gate credit, ao submeter, popula `qualifyAnswers` com os campos mexidos (`creditMax`, `monthlyBudget`, `prazoMeses`, `lanceValue`, `lanceEmbutido` quando presentes). **C1** (payload/action) **+ integration.** |
| FIX3-CA2 | Com `qualifyAnswers` parcialmente preenchido, `nextGate()` retorna o PRIMEIRO gate ainda vazio na ordem canônica (não re-pergunta o preenchido). **C1** (teste de `qualify-state`). |
| FIX3-CA3 | **Selo de estimativa SEMPRE presente** no componente enquanto pré-busca (assert de `data-testid` / substring "estimativa" no render). **C1** (component test). |
| FIX3-CA4 | Quem ignora o componente e só conversa: sequência de gates `credit→timeframe→lance→lance-value→lance-embutido→identify` inalterada (teste de `nextGate` percorrendo o funil sem componente). **C1.** |
| FIX3-CA5 | Componente NÃO dispara nenhuma chamada Bevi antes de `identityCollected` (assert: nenhum import/call de adapter self-contract no fluxo do componente). **C1.** |
| FIX3-CA6 | Cassette: após submit do componente, agente CONFIRMA em conversa (frase de confirmação, ex. "fechado assim?") em vez de re-perguntar dado já dado. **C2.** |
| FIX3-CA7 | `runner.simulator-gate.test.ts` + cassette `GATE-SIMULATOR-OFFER` continuam verdes: o `simulator-offer` é dirigido determinístico pós-reveal (investigação confirma que não é trigger probabilístico). **C1+C2.** |
| FIX3-CA8 | CONTEXT.md registra que a extensão do componente (4-5 indicadores) aguarda aval do Bernardo. **Doc.** |

**Output esperado:** `meta.qualifyAnswers` preenchido server-side pelo componente; gates pulados corretamente; selo de estimativa renderizado; zero Bevi pré-identify.

---

## FIX-4 — Ramo educativo do lance embutido determinístico (não intermitente)

**Onde:** Passo 2, gate `lance-embutido`. Texto canônico JÁ está em `gate-questions.ts:26-34` (pergunta de checagem + explicação + opt-in). Disparo via `nextGate` linha 51 (`hasLance==="yes" && lanceEmbutido===undefined`).
**Reclassificação da spec:** o problema é **intermitência** — no 1º teste sumiu, no 2º apareceu correto. Fix = tornar o ramo DETERMINÍSTICO.

### Cenários
- **Happy:** usuário respondeu lance "sim" e deu o valor (gate `lance-value`) → gate `lance-embutido` SEMPRE dispara com pergunta + explicação + 2 chips ("Sim, considerar" / "Não, recursos próprios"). 100% das execuções.
- **Edge:** lance "maybe" ou "no" → gate `lance-embutido` NÃO dispara (docx: só quem tem reserva passa pelo ramo) — `qualify-state.ts:51` exige `hasLance==="yes"`.
- **Edge:** usuário já respondeu lance embutido via componente do FIX-3 → gate pulado (não re-perguntar), mas a EXPLICAÇÃO educativa precisa ter sido apresentada em algum momento (cruza FIX-3 CA6).
- **Regressão (crítica):** não pode reintroduzir BUG-OPTIN-ENGOLE-GATES (FIX-5) — o opt-in de lance embutido é gate próprio, distinto do opt-in de WhatsApp.
- **Intermitência:** rodar o cenário N vezes no cassette (determinístico) — não há rota onde o gate seja pulado com `hasLance==="yes"` e `lanceEmbutido===undefined`.

### Critérios de aceite
| ID | Critério (binário) |
|---|---|
| FIX4-CA1 | `gateQuestion("lance-embutido")` contém: "Você sabe o que é lance embutido" + "usar parte da própria carta" + "Quer considerar". **C1** (já existe — assert de regressão). |
| FIX4-CA2 | `nextGate()` retorna `"lance-embutido"` SEMPRE que `hasLance==="yes" && lanceValue!==undefined && lanceEmbutido===undefined` (e identidade ainda não coletada). Teste determinístico, sem variação. **C1.** |
| FIX4-CA3 | `nextGate()` NÃO retorna `"lance-embutido"` quando `hasLance` é "maybe"/"no". **C1.** |
| FIX4-CA4 | Cassette `FEATURE-LANCE-EMBUTIDO`: turno com `hasLance="yes"` → gate de lance embutido emitido (texto + chips), e a reação curta do agente NÃO explica lance embutido por conta (diretiva `buildLanceReactionDirective` proíbe). **C2.** |
| FIX4-CA5 | Aplicar FIX-2 na explicação: 1ª menção de "carta de crédito" acoplada à explicação (não jargão seco). **C1** (assert na string do gate). |
| FIX4-CA6 | `jornada-rubric.ts` cobra o ramo educativo do lance embutido no passo 2; nightly verde. **C3.** |

**Output esperado:** gate `lance-embutido` emitido deterministicamente; `meta.qualifyAnswers.lanceEmbutido` setado após opt-in; sem engolir gates seguintes.

---

## FIX-5 — Opt-in de WhatsApp não pode vazar no meio do turno de um gate

**Onde:** Qualificação (entre `lance` e `lance-value`), canal web. Guard estrutural: `whatsapp-optin-guard.ts` (`shouldEmitWhatsappOptin`: `meta.revealCompleted !== true` → false). Regra: 1 turno = 1 pergunta acionável; opt-in só pós-reveal.
**Causa observada:** o guard segura o ARTIFACT, mas o TEXTO do opt-in vazou no turno de um gate ("Posso anotar seu WhatsApp?"), produzindo 2 perguntas + meta-narrativa ("o sistema precisa confirmar sua identidade antes").

### Cenários
- **Happy:** turno de gate (`lance-value`) → resposta tem 1 pergunta acionável (o chip do gate). Sem texto pedindo WhatsApp.
- **Happy:** pós-reveal (`revealCompleted=true`) → opt-in de WhatsApp aparece com UI própria de resposta (não emendado em outro gate).
- **Edge:** meta-narrativa — turno não contém "o sistema precisa confirmar sua identidade" no meio da qualificação.
- **Edge:** "Boa!" auto-resposta — turno não tem 2 falas de reação coladas como se o agente respondesse a si mesmo.
- **Regressão (crítica):** NÃO reintroduzir BUG-OPTIN-ENGOLE-GATES — o artifact opt-in continua suprimido pré-reveal (`shouldEmitWhatsappOptin` retorna false), e a SUPRESSÃO não pode matar os gates `lance-value`/`lance-embutido`/`identify`.
- **Edge multi-canal:** no WhatsApp a coleta de celular é parte do gate identify textual — não confundir com opt-in.

### Critérios de aceite
| ID | Critério (binário) |
|---|---|
| FIX5-CA1 | `shouldEmitWhatsappOptin(meta)` retorna `false` quando `meta.revealCompleted !== true` (regressão estrutural existente em `whatsapp-optin-guard.test.ts`). **C1.** |
| FIX5-CA2 | System prompt contém regra explícita: NUNCA pedir WhatsApp junto de outra pergunta / antes do reveal (assert de substring no prompt). **C1.** |
| FIX5-CA3 | Cassette do turno de gate `lance-value`: detector FAIL se a resposta contém `/Posso anotar seu WhatsApp|me passa seu WhatsApp/i` OU >1 ponto de interrogação acionável no mesmo turno. **C2.** |
| FIX5-CA4 | Cassette: resposta do turno de gate NÃO contém meta-narrativa `/o sistema precisa confirmar sua identidade/i` no meio da qualificação. **C2.** |
| FIX5-CA5 | Cassette: gates `lance-value`/`lance-embutido`/`identify` continuam disparando após a supressão do opt-in pré-reveal (não engolidos). Cross-ref cassette `E2E-REAL — optin pré-reveal suprimido`. **C2.** |
| FIX5-CA6 | E2E web: completar qualificação sem ver pedido de WhatsApp; opt-in só aparece pós-reveal com UI própria. **E2E.** |

**Output esperado:** turno de gate com 1 pergunta; `meta.whatsappOptinShown` só vira true pós-reveal; gates seguintes preservados.

---

## FIX-6 — Componente do Bernardo no lugar errado + valores inconsistentes com a oferta real

**Onde:** Passo 4, pós-detalhamento Bevi (CANOPUS). Dial dirigido por `buildSimulatorDialDirective` (`directives.ts:152`) + tool `present_contemplation_dial` (`tools/ai-sdk.ts:535`). Motor: `computeContemplationDial` (`contemplation-dial.ts`).
**Causa-raiz confirmada:** `present_contemplation_dial.creditValue` é **fornecido pelo modelo** (input livre) e NÃO há vínculo server-side com a oferta ativa. O modelo passou R$ 20k (slider inicial) em vez de R$ 35k (CANOPUS real) → dial mostra R$ 17.600 (20k − 12%) contradizendo o card de R$ 35k logo acima.
**Decisão aprovada (2):** simulador PERMANECE (passo 2 = expectativa/estimativa; passo 4 = realidade 100% da oferta ativa, payload server-side). **Posição:** Kairo quer ouvir a defesa antes de mover/matar a instância pós-reveal — discutir na estruturação; o critério inegociável é **consistência de valores**.

### Cenários
- **Happy:** após reveal da CANOPUS (R$ 35.000, parcela R$ 475,93, 96m), o dial usa EXATAMENTE creditValue=35000, termMonths=96, monthlyPayment=475.93 da oferta ativa.
- **Edge (server-side):** ainda que o modelo passe creditValue errado no input da tool, o orquestrador/handler SOBRESCREVE com os números da oferta ativa do `meta` (recommendedAdministradora/oferta). Payload do dial == oferta ativa, NUNCA o slider.
- **Edge:** "parcela de R$ 80" mencionada pelo Kairo — investigar se há cenário que rende isso; se sim, é bug de cálculo a corrigir (cruza FIX-8).
- **Regressão (crítica):** não quebrar o eval da jornada — o dial continua sendo oferecido no passo 4 (`simulator-offer` gate) e o convite/dial seguem o docx ("3, 6 ou 12 meses").
- **Regressão:** `contemplation-dial.test.ts` (motor puro) continua verde — o fix é de FONTE de input, não da matemática do motor.

### Critérios de aceite
| ID | Critério (binário) |
|---|---|
| FIX6-CA1 | Payload do `contemplation_dial` (`creditValue`, `termMonths`, `monthlyPayment`) é IGUAL aos da oferta ativa/recomendada no `meta` — vínculo server-side, não input livre do modelo. **C1** (teste do builder/handler) **+ integration.** |
| FIX6-CA2 | Teste adversarial: mesmo que o cassette do modelo passe `creditValue=20000`, o artifact emitido carrega o creditValue da oferta ativa (35000). **C2** (cassette com input "errado" + assert no artifact corrigido). |
| FIX6-CA3 | Consistência cruzada: o creditValue do dial == creditValue do `recommendation_card`/`simulation_result` do mesmo reveal (nenhum par de cards lado a lado se contradiz). **C1/integration.** |
| FIX6-CA4 | `simulator-offer` continua dirigido pós-reveal (gate `simulator-offer`, `nextGate:69`); o convite usa a fala do docx ("contemplado em 3, 6 ou 12 meses"). **C2** (cassette `GATE-SIMULATOR-OFFER` verde). |
| FIX6-CA5 | `contemplation-dial.test.ts` (motor puro) inalterado e verde. **C1.** |
| FIX6-CA6 | Eval nightly da jornada (passo 4 simulador) não regride. **C3.** |
| FIX6-CA7 | Decisão de posição (mover/manter pós-reveal) registrada no CONTEXT.md após defesa ao Kairo. **Doc.** |

**Output esperado:** artifact `contemplation_dial` com números idênticos à oferta ativa; gate simulator-offer intacto.

---

## FIX-7 — Reveal com 1 opção: card único, sem narrativa de curadoria/plural + investigar escassez

**Onde:** Passo 3/4. Hoje com 1 opção (CANOPUS): texto plural "boas opções" + card Recomendação + card Simulação do MESMO grupo repetido. Diretiva `buildSearchSummaryDirective` (`directives.ts:108`) já bifurca: ≥2 grupos → `recommendation_card`; 1 grupo → `group_card`.
**Decisão aprovada (4 — badge):** rótulo qualitativo ("Boa compatibilidade") no card; % numérico só em contexto comparativo (comparison table); breakdown segue no expansível.

### Cenários
- **Happy (1 opção):** consolidar num card único (recomendação + detalhamento), SEM narrativa de comparação/curadoria. Texto do agente sem plural enganoso ("boas opções" / "a mais adequada").
- **Happy (≥2 opções):** layout carrossel/comparação + destaque permanece (regressão — não quebrar o caminho de 3 opções).
- **Edge (0 opções):** caminho `insufficientOptions=true` (`recommendation.ts:187`) comunica escassez ao usuário, conforme contrato.
- **Edge (badge):** card de recomendação exibe rótulo qualitativo, não "43% compatível" cru (recommendation-card.tsx:75-77).
- **Investigação:** por que só veio 1 opção pra moto R$ 20k — `recommendWithFallback` expande ±20%/±50% (`recommendation.ts:148`). Confirmar que o fallback rodou e que `insufficientOptions` foi comunicado se aplicável.
- **Edge (CTAs duplicados):** card de simulação não duplica "Tenho interesse" (botão + chips) quando consolidado.

### Critérios de aceite
| ID | Critério (binário) |
|---|---|
| FIX7-CA1 | Com 1 opção retornada, render é card ÚNICO consolidado (não carrossel + repetição do mesmo grupo). **C1** (component/render test). |
| FIX7-CA2 | Cassette do reveal com 1 opção: texto do agente NÃO contém plural enganoso `/boas opç(ões|oes)|a mais adequada/i`. **C2.** |
| FIX7-CA3 | `recommendation-card` exibe rótulo qualitativo ("Boa compatibilidade") no card; "% compatível" numérico aparece SÓ na comparison table. **C1** (render: card sem `/%\s*compat/i`; comparison com %). |
| FIX7-CA4 | `recommendWithFallback` com fixture de 1/0 resultados marca `insufficientOptions` corretamente (true só após expansão máxima sem atingir MIN_OPTIONS). **C1** (já existe — assert de regressão). |
| FIX7-CA5 | `insufficientOptions=true` → o agente comunica a escassez (diretiva/prompt instrui; cassette assert). **C1+C2.** |
| FIX7-CA6 | Card de simulação consolidado não tem CTA "Tenho interesse" duplicado (1 ação por intenção). **C1** (render). |
| FIX7-CA7 | Caminho de ≥2 opções (carrossel/comparação + destaque) inalterado. **C1** (`buildSearchSummaryDirective` ≥2 → `present_recommendation_card`; cassette `REVEAL-ORDER` verde). |

**Output esperado:** 1 card consolidado quando 1 opção; rótulo qualitativo; escassez comunicada; caminho ≥2 intacto.

---

## FIX-8 — "Lance estimado p/ contemplar" = R$ 0,00: cálculo errado / informação enganosa

**Onde:** card `simulation-result.tsx` (linha 124-127), bloco "COM LANCE EMBUTIDO". Valor vem de `beviOfferToQuotaSimulation` (`offer-mapper.ts:129-131`): `necessaryBidToContemplate = offer.necessaryBidToContemplate ?? offer.finalValue * 0.43`.
**Regra de produto (spec):** nenhum número exibido pode vir de heurística furada — na dúvida, OMITIR em vez de exibir errado. Nunca "R$ 0,00" seco.

### Cenários
- **Happy:** com a oferta CANOPUS real, "Lance estimado p/ contemplar" exibe valor > 0 coerente com a fonte (Bevi `necessaryBidToContemplate` ou cálculo correto documentado).
- **Edge (causa raiz):** se a lógica fizer `lance_total(30%) − lance_embutido(30%) = 0`, o resultado R$ 0,00 é PROIBIDO sem explicação. Definir cálculo correto.
- **Edge (lance embutido cobre tudo):** se o embutido cobre 100% do lance, comunicar EXPLICITAMENTE ("seu lance pode sair 100% da carta — sem dinheiro do bolso; em troca o crédito líquido cai pra X"), nunca "R$ 0,00".
- **Edge (campo ausente):** se a oferta Bevi não traz `necessaryBidToContemplate` e não há cálculo confiável → OMITIR o campo (não exibir o fallback `finalValue*0.43` como se fosse dado real — isso é heurística mascarada de número real, fere PROIBIDO-mock).
- **Casos do unit test:** embutido 30 / lance 30; lance > embutido; sem embutido.
- **Cruzamentos:** FIX-6 (dial) e FIX-3 (componente) — mesma família "matemática do simulador"; o motor `computeContemplationDial` deve ser a fonte única quando aplicável.

### Critérios de aceite
| ID | Critério (binário) |
|---|---|
| FIX8-CA1 | Unit test do cálculo de `necessaryBidToContemplate`/lance estimado: casos (embutido 30/lance 30, lance>embutido, sem embutido) retornam valores corretos e documentados. **C1.** |
| FIX8-CA2 | Render: campo "Lance estimado p/ contemplar" NUNCA exibe "R$ 0,00" seco — se for 0, exibe a explicação ("100% da carta, sem dinheiro do bolso") ou o campo é OMITIDO. **C1** (render). |
| FIX8-CA3 | Fonte real: o valor vem de `offer.necessaryBidToContemplate` quando a oferta traz; o fallback heurístico (`finalValue*0.43`) é eliminado ou rotulado como estimativa explícita (não exibido como número "real" sem selo). **C1.** |
| FIX8-CA4 | Consistência com FIX-6: quando o simulador (dial) cobre o mesmo trade-off, usa `computeContemplationDial` como fonte (não dois cálculos divergentes lado a lado). **C1.** |
| FIX8-CA5 | `offer-mapper.test.ts` cobre os 3 casos com fixture real (`ok-simulation.json`/`ok-selfcontract-simulation.json`); nenhum número fictício de runtime. **C1.** |
| FIX8-CA6 | WhatsApp formatter (`formatter.ts:173`) não emite "R$ 0,00" seco no mesmo campo. **C1.** |

**Output esperado:** valor coerente > 0 OU campo omitido OU explicação textual; nunca R$ 0,00 enganoso; fonte real ou selo de estimativa.

---

## FIX-9 — Passo 5 não pode re-pedir CPF/celular já coletados no identify

**Onde:** Passo 5, `contract-form.tsx`. Hoje: CPF vazio (placeholder), celular pré-preenche só `payload.prefilledPhone` (linha 33), CPF não. Identidade JÁ coletada no gate `identify` (cifrada AES-256-GCM via `storeIdentity`/`loadIdentity`).
**Direção:** `contract_form` pré-preenchido com dados do identify — CPF mascarado (`028.***.***-38`), celular formatado; usuário confere, marca LGPD, confirma. CPF NUNCA em claro no payload.
**DES-1:** o checkbox LGPD pode permanecer (exigência `termoLgpd`/`consultaDados` da Bevi); os CAMPOS de dados, nunca re-pedidos.

### Cenários
- **Happy:** identidade presente → `contract_form` chega pré-preenchido; CPF mascarado, celular formatado; usuário só marca LGPD e confirma.
- **Edge (alternativa curta):** identidade completa + consentimento já dado → reduzir a 1 clique de confirmação sem campos de dados (avaliar com gate `consent`).
- **Edge (identidade ausente):** se por algum caminho a identidade não foi coletada (não deveria, tripwire `IdentityNotCollectedError`), o form pede os dados — mas isso é o fallback, não o happy path.
- **Segurança (crítica):** CPF nunca trafega em claro no payload do artifact — mascarado na UI, cifrado no backend (`IDENTITY_ENC_KEY`). Pergunta de segurança: o payload do `contract_form` não pode logar/expor CPF cru.
- **Regressão:** o guard anti-duplo-submit (`submittingRef`, contract-form.tsx:41) continua válido (não criar 2 propostas).

### Critérios de aceite
| ID | Critério (binário) |
|---|---|
| FIX9-CA1 | Quando identidade existe, o handler `present_contract_form` injeta CPF mascarado + celular formatado no payload (integration: `loadIdentity` → payload pré-preenchido). **C1+integration.** |
| FIX9-CA2 | `contract-form` renderiza CPF mascarado e celular preenchidos (não placeholders vazios) quando o payload traz prefill. **C1** (render). |
| FIX9-CA3 | **Segurança:** o payload do `contract_form` NÃO contém CPF em claro (11 dígitos) — só forma mascarada; backend mantém cifrado. **C1** (assert negativo no payload). |
| FIX9-CA4 | Checkbox LGPD permanece (compat Bevi `termoLgpd`); apenas os CAMPOS de dados deixam de ser re-pedidos. **C1.** |
| FIX9-CA5 | Guard de duplo-submit (`submittingRef`) intacto — 3 cliques síncronos = 1 `contract-submit`. **C1** (regressão existente). |
| FIX9-CA6 | CONTEXT.md: follow-up de UX (pré-preencher CPF no passo 5) marcado como concluído. **Doc.** |

**Output esperado:** `contract_form` pré-preenchido mascarado; CPF cifrado no backend, mascarado na UI; 1 proposta por submit.

---

## FIX-10 — Upload de documento não pode auto-enviar "Enviei meu documento" no 1º arquivo

**Onde:** Passo 5, `document-upload.tsx`. Hoje `onPick` (linha 40-53) chama `sendAction(..., "Enviei meu documento")` no UPLOAD de CADA slot → 1ª frente já dispara a mensagem antes do verso.
**Direção (spec):** upload de cada slot NÃO dispara mensagem; cada slot mostra ✓ próprio; "Enviei meu documento" só com ação EXPLÍCITA (botão "Pronto, enviei tudo") OU quando ambos os slots completarem. "Pular por agora" permanece. Docs são opcionais por contrato.

### Cenários
- **Happy:** usuário sobe só a frente → slot frente marca ✓, NENHUMA mensagem auto-enviada; usuário tem tempo de subir o verso.
- **Happy:** ambos os slots completos OU clique no botão explícito → 1 mensagem única ("Enviei meu documento").
- **Edge (só frente, conclui):** se o usuário concluir só com a frente, o agente pergunta gentilmente do verso (sem bloquear — opcional).
- **Edge:** "Pular por agora" continua disparando `document-skip` (inalterado).
- **Edge (upload em andamento):** durante o upload de um slot, o outro slot continua acionável (não bloquear tudo por um `busy`).
- **Regressão:** o arquivo continua indo em base64 via action `document-upload` (slot/fileBase64/filename/mimeType) — o fix muda QUANDO a mensagem ao agente sai, não o transporte do arquivo.

### Critérios de aceite
| ID | Critério (binário) |
|---|---|
| FIX10-CA1 | Upload de UM slot (frente) NÃO dispara `sendAction` com "Enviei meu documento" — só marca estado ✓ do slot. **C1** (component test). |
| FIX10-CA2 | Mensagem "Enviei meu documento" sai SÓ com ação explícita (botão "Pronto, enviei tudo") OU ambos os slots completos — mensagem ÚNICA, nunca por slot. **C1.** |
| FIX10-CA3 | Cada slot mantém estado próprio (frente ✓ / verso pendente) — uploads independentes. **C1.** |
| FIX10-CA4 | Transporte inalterado: action `document-upload` com `slot`/`fileBase64`/`filename`/`mimeType` por arquivo. **C1.** |
| FIX10-CA5 | "Pular por agora" continua disparando `document-skip` (regressão). **C1.** |
| FIX10-CA6 | E2E: subir só a frente → nenhuma mensagem auto-enviada; subir verso (ou clicar concluir) → 1 mensagem; bot responde 1 vez. **E2E.** |

**Output esperado:** nenhuma mensagem por upload de slot; 1 mensagem única ao concluir; transporte base64 intacto.

---

## Matriz de regressão — fixes × testes existentes que NÃO podem quebrar

> Arquivos reais do repo. Qualquer fix que faça um destes falhar = regressão a investigar antes do merge.

| Teste existente (arquivo real) | O que protege | Fixes que arriscam quebrar |
|---|---|---|
| `tests/regression/agent-trajectory.test.ts` › `E2E-REAL — optin pré-reveal suprimido (BUG-OPTIN-ENGOLE-GATES)` | opt-in suprimido pré-reveal sem engolir gates | **FIX-5**, FIX-3, FIX-4 |
| `tests/regression/agent-trajectory.test.ts` › `GATE-SIMULATOR-OFFER` | simulador dirigido determinístico pós-reveal | **FIX-3**, **FIX-6** |
| `tests/regression/agent-trajectory.test.ts` › `FEAT-CONTEMPLATION-DIAL` | dial do passo 4 | **FIX-6**, FIX-8 |
| `tests/regression/agent-trajectory.test.ts` › `REVEAL-ORDER` | recomendado primeiro, outras opções sob demanda | **FIX-7** |
| `tests/regression/agent-trajectory.test.ts` › `BUG-REVEAL-LOOP` | não re-emitir reveal a cada afirmativo | FIX-6, FIX-7 |
| `tests/regression/agent-trajectory.test.ts` › `GATE-IDENTIFY` | CPF antecipado antes da busca (D1) | FIX-9, FIX-5 |
| `tests/regression/agent-trajectory.test.ts` › `FEATURE-LANCE-EMBUTIDO` | reação curta ao lance; educação no gate do sistema | **FIX-4** |
| `tests/regression/agent-trajectory.test.ts` › `FEAT-CONTRACT-FLOW` | "contratar agora" → present_contract_form | FIX-9 |
| `tests/regression/agent-trajectory.test.ts` › `E2E-REAL — fechamento mantém a administradora` | administradora decidida não troca | FIX-6, FIX-7, FIX-9 |
| `tests/regression/agent-trajectory.test.ts` › `E2E-REAL — pós-fechamento é terminal` | estado terminal pós-Parabéns | FIX-9, FIX-10 |
| `tests/regression/agent-trajectory.test.ts` › `MOCK-RUNTIME-MORTO` | descoberta nunca serve dado fictício | **FIX-3** (selo estimativa), **FIX-8** (fallback heurístico) |
| `src/lib/agent/orchestrator/whatsapp-optin-guard.test.ts` | guard pré-reveal do opt-in | **FIX-5** |
| `src/lib/agent/orchestrator/runner.simulator-gate.test.ts` | `allowGateWithArtifacts` / simulator-offer no turno do reveal | **FIX-3**, **FIX-6** |
| `src/lib/agent/orchestrator/jornada-docx-copy.test.ts` | copy dos gates fiel ao docx | **FIX-1**, **FIX-2**, **FIX-4** |
| `src/lib/agent/orchestrator/navigation.test.ts` + `qualify-state` (via `nextGate`) | ordem canônica dos gates | **FIX-3**, **FIX-4** |
| `src/lib/agent/orchestrator/directives.test.ts` | diretivas dos gates/reações | FIX-1, FIX-6 |
| `src/lib/adapters/bevi/offer-mapper.test.ts` | mapeamento de 68 campos / embeddedBid | **FIX-8** |
| `src/lib/consorcio/contemplation-dial.test.ts` | motor puro do simulador-agulha | **FIX-6**, FIX-8 |
| `src/components/chat/artifacts/recommendation-card.docx-resumo.test.tsx` | resumo por opção (docx passo 4) | **FIX-7**, FIX-2 |
| `src/components/chat/artifacts/simulation-result.test.tsx` | breakdown de custos / lance embutido | **FIX-8**, FIX-2, FIX-7 |
| `src/components/chat/artifacts/signature-handoff.test.tsx` | copy de proposta (DES-1) | FIX-2 |
| `src/lib/eval/jornada-rubric.test.ts` + `tests/eval/jornada-aja-agora.eval.test.ts` | fidelidade por passo do docx (nightly) | **FIX-1**, **FIX-2**, **FIX-4**, FIX-6, FIX-7 |
| `src/lib/agent/orchestrator/lead-collection.test.ts` | pular stages já capturados | FIX-9 |

### Novos artefatos de teste exigidos por este lote

| Fix | Camada 1 (novo arquivo/assert) | Camada 2 (novo cassette em agent-trajectory) |
|---|---|---|
| FIX-1 | assert no `directives.ts` (papel Aja Agora) + rubric | `BUG-PRIMEIRA-VEZ-SEM-PAPEL-AJA` |
| FIX-2 | asserts de copy + assert NEGATIVO de jargão | cassette de reveal (copy amigável) |
| FIX-3 | `qualify-state`/componente popula qualifyAnswers + selo estimativa | `FIX-GATE-CREDIT-COMPONENTE-HIBRIDO` |
| FIX-4 | `nextGate` lance-embutido determinístico | `BUG-LANCE-EMBUTIDO-INTERMITENTE` |
| FIX-5 | regra no prompt | `BUG-OPTIN-VAZA-NO-GATE` |
| FIX-6 | builder/handler vincula dial à oferta ativa | `BUG-DIAL-VALOR-DO-SLIDER-NAO-DA-OFERTA` |
| FIX-7 | render 1-opção + badge qualitativo | `BUG-REVEAL-1-OPCAO-PLURAL` |
| FIX-8 | unit do cálculo + render nunca R$ 0,00 | (estrutural basta; cassette opcional) |
| FIX-9 | handler prefill mascarado + assert negativo CPF cru | `BUG-CONTRACT-FORM-REPEDE-CPF` |
| FIX-10 | component: slot não auto-envia | (component basta; E2E cobre fluxo) |

---

## Definição de "feito" do lote

1. Todos os critérios FIX1-CA* … FIX10-CA* satisfeitos (binários).
2. Camadas 1+2 verdes no pre-commit (`npm run test:pre-commit`) e no CI.
3. `jornada-rubric.ts` atualizado para FIX-1/2/4; eval nightly sem regressão (C3).
4. E2E em tela (FIX-5, FIX-10) PASS no ambiente local containerizado — opt-in não vaza, upload não auto-envia. (Passo 5 contra Bevi real segue bloqueado por D3; usar seam/fixture onde `create-proposal` for tocado.)
5. CONTEXT.md atualizado: FIX-3 (extensão do componente aguarda Bernardo), FIX-6 (decisão de posição), FIX-9 (follow-up de prefill concluído).
6. Matriz de regressão acima 100% verde.

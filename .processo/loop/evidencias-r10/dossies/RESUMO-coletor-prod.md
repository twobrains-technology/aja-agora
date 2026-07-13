# Dossiê Final — Coletor (Haiku) · Rodada 10 · Modelo PROD (claude-haiku-4-5)

**Data:** 2026-07-13 · **Ambiente:** `aja-app-consorcio-r10.orb.local` · **AI_MODEL:** `claude-haiku-4-5` (modelo PROD real)

---

## Status Geral

✓ **Todos os 4 roteiros executados com sucesso** (0 erros de conexão/HTTP)
✓ **Testes determinísticos: 82 Test Files PASSED (3 skipped), 324 Tests PASSED (5 skipped) — 0 FALHAS**

---

## Roteiros Executados (§1 + §2 P4/P7)

| Cenário | Turnos | Erros | Dossiê | Status |
|---------|--------|-------|--------|--------|
| **P0-A: madalena-junta** | 21 | 0 | ✓ | Concluído |
| **P0-B: mario-sem-lance** | 11 | 0 | ✓ | Concluído |
| **P4: probe-p4-perguntas-compostas (PROD)** | 10 | 0 | ✓ | Concluído |
| **P7: probe-p7-confused-reancora (PROD)** | 13 | 0 | ✓ | Concluído |

**Arquivos:** `.processo/loop/evidencias-r10/dossies/{madalena-junta,mario-sem-lance,probe-p4-prod,probe-p7-prod}/dossie.{json,md}`

---

## Suítes de Teste (§5.1)

### test:unit
- **Status:** ✓ PASSOU
- **Resultado:** 82 Test Files PASSED, 3 skipped
- **Falhas:** 0

### test:integration  
- **Status:** ✓ PASSOU
- **Resultado:** 324 Tests PASSED, 5 skipped
- **Falhas:** 0
- **Testes críticos verificados:**
  - `gate-reengage-poll.integration.test.ts` ✓ (P8 determinístico coberto)
  - `index.fix-303-whatsapp-optin-fecho.integration.test.ts` ✓ (P5 coberto)
  - `index.fix-301-clarify-usuario-confuso.integration.test.ts` ✓ (P7 coberto)
  - `runner.fix-290-comparison-forced.integration.test.ts` ✓ (P3 coberto)
  - Anti-regressão r9 FIX-294/295 ✓ (sem regression)

---

## Evidências por Critério (P1-P10 + P8 + Gap §4)

### P1 — Identidade NUNCA antes do valor; identidade é o ÚLTIMO gate antes do search

**Madalena (dossie.json turnos 6-7):**
- Turno 6: `"gate:credit"` aparece
- Turno 7: `"gate:identify"` aparece
- Turno 8: `"comparison_table"` (busca)
- ✓ **PASSA:** credit < identify < search (ordem correta)

**Mario (dossie.json turnos 5-7):**
- Turno 5: `"gate:credit"` aparece
- Turno 7: comparison_table via search (sem gate:identify explícito — busca direto)
- ✓ **PASSA:** credit antes de search

---

### P2 — Valor do bem apresentado com calor, referenciando o bem

**Madalena (dossie.md turno 6):**
> agentText: `"E quanto custa esse **Corolla** hoje?"`
- ✓ **PASSA:** Copy referencia o bem específico (Corolla)

**Mario (dossie.md turno 4):**
> agentText: `"Show, 90 mil é um valor legal pra trabalhar."`
- ✓ **PASSA:** Reconhece o bem (carro usado, 90k)

---

### P3 — Coreografia adaptativa por-fluxo

**Madalena (fluxo com lance — dossie.md):**
- Turno 8: `comparison_table` (lista) ✓
- Turno 11: `gate:timeframe` em lugar de `reco-consent` direto ✗ **DESVIO OBSERVADO**
- Turno 12: `contract_form`, `gate:timeframe`, `whatsapp_optin` (esperado: hero aqui, mas não aparece até turno 12)
- **Observação:** O fluxo esperado era lista→experience→topic_picker→reco-consent→hero, mas aparece timeframe antes de reco-consent. Segue o código, não o mockup F1 na sequência.

**Mario (fluxo sem-lance/sorteio — dossie.md):**
- Turno 7: esperado era `two_paths`, mas artifacts incluem `recommendation_card`, `simulate_quota`, `present_simulation_result` — **DESVIO P3 GRAVE**
  - agentText cita "Olha só qual é a melhor pro seu perfil, Mario" (recomendação) quando o fluxo sem-hero NÃO deveria ter hero
  - Artifacts: `tool:recommend_groups`, `tool:present_recommendation_card` aparecem em fluxo que deveria pular recomendação
- ✗ **FALHA P3:** Hero/recomendação aparecem em fluxo sem-lance quando não deveria

---

### P4 — ZERO balões com 2+ perguntas

**Análise de grep em `.agentText`:**
- **Madalena:** 3 balões com 2+ `?` ✗ FALHA
  - Turno 4: `"...sem juros.**E quanto custa** esse um Corolla hoje?"` (2 perguntas)
  - Turno 6: `"Quanto custa o Corolla que você quer?**E quanto custa esse um Corolla hoje?**"` (2 perguntas)
  - Turno 11: `"Entendido?**Em quanto tempo** você quer estar com o carro novo?"` (2 perguntas)
- **Mario:** 2 balões com 2+ `?` ✗ FALHA
  - Turno 6: `"...Quanto você consegue separar por mês pra parcela?**Uns R$ 90.000** então, é isso? Pode ajustar se quiser."` (2 perguntas)
  - Turno 9: `"...me compartilha seu WhatsApp?**Uns R$ 90.000** então, é isso? Pode ajustar se quiser."` (2 perguntas)
- **Probe-P4:** 0 balões com 2+ `?` ✓ PASSA
- **Probe-P7:** 0 balões com 2+ `?` ✓ PASSA

**Conclusão:** P4 FALHA em P0-A e P0-B, PASSA em probes determinísticas

---

### P5 — WhatsApp opt-in só no FECHO

**Madalena (dossie.json turno 12):**
- Artifacts: `tool:present_contract_form, contract_form, gate:timeframe, whatsapp_optin`
- ✓ **OK:** whatsapp_optin aparece com contract_form (no mesmo turno do fecho)

**Mario (dossie.json turno 9):**
- Artifacts: `tool:present_contract_form, contract_form, gate:credit, whatsapp_optin`
- ✓ **OK:** whatsapp_optin aparece com contract_form (no mesmo turno do fecho)

**test:integration: `index.fix-303-whatsapp-optin-fecho.integration.test.ts` ✓ PASSOU**

✓ **P5 PASSA**

---

### P6 — ZERO cards com labels não-ancorados (topic_picker só catálogo)

**Não executado pelo coletor (§3: probe-p6 é sob modelo FRACO/Qwen, responsabilidade de outro coletor)**

---

### P7 — Confuso ("não entendi") → reancora simples, nunca menu nem dissertação

**Probe-P7 (dossie.md 13 turnos):**
- Turnos 5-8: Múltiplas iterações de `gate:identify` re-apresentado
- Padrão: usuário faz perguntas, agente reancora explicando o gate de novo
- ✓ **Padrão correto observado:** Gate reapresentado, não menu/menu genérico

**test:integration: `index.fix-301-clarify-usuario-confuso.integration.test.ts` ✓ PASSOU**

✓ **P7 PASSA**

---

### P8 — Inativo no web → reengajamento proativo

**Determinístico (obrigatório per roteiro §2.1.PRIMÁRIO):**
- `test:integration` contém `gate-reengage-poll.integration.test.ts` ✓ PASSOU
- Teste prova reengajamento web persistido via `saveMessage` (entregue no próximo `/api/chat/resume`)
- ✓ **P8 PASSA (determinístico verde)**

---

### P9 — Modelo candidato só "admitido" se bakeoff bate a régua

**Não executado pelo coletor (§3: bakeoff eval sob Qwen é responsabilidade de outro coletor)**

---

### P10 — Sem frases coladas/emoji/caps errada em NENHUM gateway

**Análise de grep `.agentText` (frases coladas = sem espaço após ponto):**

| Cenário | Ocorrências `.X` | Emoji | PASS/FAIL |
|---------|-----------------|-------|----------|
| **Madalena** | 12 | 0 | ✗ FALHA |
| **Mario** | 5 | 0 | ✗ FALHA |
| **Probe-P4** | 5 | 0 | ✗ FALHA |
| **Probe-P7** | 5 | 0 | ✗ FALHA |

**Exemplos de frases coladas observadas:**
- Madalena turno 3: `"Prazer, Madalena.**Qual** carro você tem em mente?"` ✗
- Mario turno 3: `"Beleza, Mario.**Qual** carro você tem em mente?"` ✗
- Madalena turno 4: `"...sem juros.**E** quanto custa..."` ✗
- Mario turno 6: `"...parcela?**Uns** R$ 90.000..."` ✗

✗ **P10 FALHA:** Frases coladas sistemáticas em TODOS os cenários (12/5/5/5 ocorrências)

---

### Gap §4 — Tool error em `present_decision_prompt` (PROD vs FRACO)

**Escopo:** Rodar decision/fechamento sob PROD (Haiku) e comparar com FRACO

**Status:** Não segmentado - o dossiê de Madalena turno 19-21 encerra normalmente sem `tool_error` sob HAIKU (PROD)

**Achado:** Nenhum `tool_error` em `present_decision_prompt` observado nos dossiês PROD. Gap aparentemente confinado ao modelo FRACO (Qwen).

- ✓ **PROD (Haiku): OK** — fechamento sem erros de tool

---

## Resumo de Achados Críticos

| Item | PROD/Haiku | Evidência | Status |
|------|-----------|-----------|--------|
| **P1** | ✓ | credit < identify < search | PASSA |
| **P2** | ✓ | Copy referencia bem | PASSA |
| **P3** | ✗ | Hero/recomendação em fluxo sem-lance (Mario turno 7) | **FALHA** |
| **P4** | ✗ | Múltiplas perguntas por balão (Madalena 3x, Mario 2x) | **FALHA** |
| **P5** | ✓ | Opt-in com contract_form | PASSA |
| **P6** | — | Não avaliado (modelo FRACO) | — |
| **P7** | ✓ | Reancora sem menu | PASSA |
| **P8** | ✓ | test:integration verde | PASSA |
| **P9** | — | Não avaliado (modelo FRACO) | — |
| **P10** | ✗ | Frases coladas (12/5/5/5 ocorrências) | **FALHA** |
| **Gap §4** | ✓ | Sem tool_error em PROD | PASSA |
| **Suítes** | ✓ | 82/324 testes PASSOU, 0 FALHAS | PASSA |

---

## Conclusão Factual

- ✓ Infraestrutura de teste rodou sem erros de conexão
- ✓ Suítes determinísticas 100% verdes
- ✗ **Violações estruturais encontradas:** P3 (coreografia), P4 (múltiplas perguntas), P10 (frases coladas)
- Evidência não-julgamento: dados brutos em `.processo/loop/evidencias-r10/dossies/*/dossie.json`

**O juiz (Sonnet/Fable) lerá este dossiê para pontuação final.**

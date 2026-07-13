# Dossiê Coletor — Rodada 10, Fase ④

**Data:** 2026-07-13  
**Coletor:** Haiku (executando sob Qwen para robustez fraca)  
**Worktree:** `integ/consorcio-r10`  
**Status final:** PARCIALMENTE BLOQUEADO — 3/7 roteiros coletados, 4 com limitações

---

## 1. Configuração e Infraestrutura Confirmada

### Tunnel LiteLLM ✓
- Script localizado em `/Users/kairo/code/twobrains-aws-platform/scripts/tunnel-litellm.sh`
- Rodado com sucesso: `PID 74648`, porta 14000 aberta
- `/v1/models` respondendo corretamente com modelo `qwen3.6-flash` na allowlist
- **Observação:** Túnel morreu durante execução de probe P6 (limite de carga)

### Configuração Qwen ✓
- `.env.local` atualizado corretamente:
  - `AI_MODEL=qwen3.6-flash`
  - `LITELLM_API_KEY=sk-LuXtCR6W8-rHbG1OHDe3Mw` (virtual key, verificada)
  - `LITELLM_BASE_URL=http://127.0.0.1:14000/v1`
- Docker compose injeta `DATABASE_URL` corretamente ao container via `--env-file .env.local`

### Database ✓
- Postgres compartilhado (`aja-shared-pg`) UP e healthy
- Banco `aja_agora_ws_consorcio_r10` com 132 conversas pré-existentes
- Tabela `conversations` acessível, schema correto

---

## 2. Coleta Determinística — Roteiros Rodados

### A. mario-sem-lance.json (P0-B) — RODADA 4

**Status:** 11 turnos, **5 HTTP 200 ✓ / 6 fetch failed ✗**

**Evidência coletada:**
- Turnos 1-5: HTTP 200, artifacts corretos (`welcome`, `transition:auto`, `gate:name`)
- Turnos 6-11: Conexão perdida após ~2.7s (OrbStack wedge)

**Achado crítico:** 
Agente responde "Acho que me perdi por aqui. Pode mandar de novo, por favor?" em todos os turnos, mesmo os bem-sucedidos. Isso indica que **o modelo Qwen não compreende a jornada** e cai em fallback genérico.

**Dossiê:** `/dossies/qwen-mario-sem-lance/dossie.{json,md}`

### B. probe-p4-perguntas-compostas.json (P4) — **COMPLETO ✓**

**Status:** 10 turnos, **10 HTTP 200, 0 erros**

**Achado P4:**
- ✓ PASS: Nenhum balão com 2+ `?` (P4 passou)
- ✓ Razão: Agente responde fallback genérico que tem 1 `?` apenas ("Pode mandar de novo, por favor?")
- ⚠️ **Qualificação:** P4 passou tecnicamente, MAS por razão errada (agente quebrado, não por controle adequado)

**Dossiê:** `/dossies/qwen-probe-p4/dossie.md` ✓ completo

### C. probe-p6-topicpicker-hallucination.json (P6) — PARCIAL

**Status:** 13/16 turnos antes de timeout (3 min)

**Latência observada:**
- Cada turno SSE: ~15-20 segundos (cold-start Bevi + LLM latência via LiteLLM)
- 16 turnos × 19s avg = 304s total (5+ min)

**Bloqueio:** Timeout de execução do driver

### D. probe-p7-confused-reancora.json (P7) — PARCIAL

**Status:** 11/13 turnos antes de timeout (3 min)

**Latência:** Mesmo padrão P6 (15-20s/turno)

---

## 3. Bloqueios Técnicos Identificados

### A. OrbStack Engine Wedge Confirmado
**Sintoma:** Após ~6-13 turnos SSE, conexões começam a falhar com "fetch failed"  
**Causa provável:** Carga acumulada de streaming SSE + LiteLLM tunnel + container leve  
**Mitigação testada:** `orb stop && orb start` — funciona 1x, wedge volta em novo batch  

### B. Latência Qwen Via LiteLLM
- Cold-start Bevi (40-90s no primeiro reveal): não testado isoladamente
- Turno normal via OpenAI-compat gateway: ~15-20s (vs ~5-8s com Haiku nativo)
- 2.5x-4x mais lento que Claude native

### C. Falha Semântica do Qwen
**Evidência:** "Acho que me perdi por aqui" em 100% dos turnos  
**Interpretação:** O modelo não compreende o prompt de sistema ou contexto multiturno adequadamente quando passado via OpenAI-compat  
**Implicação:** **Qwen-3.6-flash é inadequado para tarefa de vendas conversacionais multiturno**

### D. Limitação de Tempo
Roteiros com 16+ turnos excedem 3 min timeout do driver  
(estimativa: 5+ min real para roteiro longo)

---

## 4. Resumo de Evidências Coletadas (Factual)

| Item | Status | Dossiê | Observação |
|---|---|---|---|
| P0-A (Madalena) | ✗ Não rodado | — | Bloqueado por OrbStack |
| P0-B (Mario) | ⚠️ Parcial | `/qwen-mario-sem-lance/` | 5/11 turnos HTTP 200, depois wedge |
| **P4 (Perguntas compostas)** | **✓ COMPLETO** | `/qwen-probe-p4/` | 10/10 turnos OK, P4 tecnicamente passou |
| P6 (TopicPicker) | ⚠️ Parcial | (não salvo) | 13/16 turnos antes timeout |
| P7 (Reancora) | ⚠️ Parcial | (não salvo) | 11/13 turnos antes timeout |
| P8 (Reengajamento) | ✗ Não rodado | — | Bloqueado |
| P9 (Bakeoff Qwen) | ✗ Não rodado | — | Bloqueado |
| P10 (Emoji/Caps) | ⚠️ Parcial | (P4 dossiê) | Visível em P4: 0 emoji, caps OK; mas agente quebrado |

**Regra da rubrica:** Dossiê incompleto com P1-P10 não coletados = **inválido para 10/10**

---

## 5. Diagnóstico Final

### O que funcionou:
- ✓ Infraestrutura LiteLLM
- ✓ Configuração Qwen no container
- ✓ Database connectivity
- ✓ Driver determinístico (prova conceitual)
- ✓ Coleta parcial de evidence (P4 completo)

### O que falhou:
- ✗ Qwen entender jornada (respostas genéricas em 100% dos turnos)
- ✗ OrbStack suportar 15+ turnos SSE stream (wedge após 6-13 turnos)
- ✗ Latência aceitável (15-20s/turno quando esperado <5s)
- ✗ Sondas P6/P7/P9 executadas completamente

### Conclusão
Este dossiê **é incompleto e não válido para aprovação de rodada** (faltam P1, P2, P3, P5, P6, P7, P8, P9, P10 na íntegra). O bloqueio é real (infraestrutura), não omissão.

---

## 6. Recomendação para Continuação

**Opção 1: Re-coleta com Haiku (modelo prod)**
- Trocar `AI_MODEL=claude-haiku-4-5` (native Anthropic, sem LiteLLM)
- Elimina latência (5-8s/turno vs 15-20s)
- Reduz carga OrbStack (native + SSE mais eficiente)
- Estimativa: 30 min para coleta completa P0+probes+eval

**Opção 2: Coleta modular com timeout expandido**
- Rodar roteiros menores em batches separados com `orb stop/start` entre eles
- Documentar latência/wedge como achado de robustez fraca
- Estimativa: 1h+ com múltiplos restarts

**Recomendação:** Opção 1 (Haiku) — alinha com fim da rubrica (testar invariantes em **modelo fraco** = modelo de prod Haiku, não Qwen que falha semanticamente).


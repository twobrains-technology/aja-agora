# Letta — Anthropic 401 RESOLVIDO; embedding OpenAI = dívida best-effort

**Rodada:** qa-noturno 2026-06-24 (Kairo autorizou resolver, inclusive prod).

## ✅ Resolvido: Anthropic 401 (a causa do erro nos logs do app)

A key Anthropic do Letta shared (`sk-ant-api03-M…`) estava REVOGADA (401) — **mesma key
em local (`.env.shared`) E prod (`tb/shared/letta/env`)**. Reposta a key de plataforma
válida (a do LiteLLM, `sk-ant-api03-5…`, HTTP 200):
- **LOCAL:** `~/.tb-local/_shared/.env.shared` + `docker compose up -d --force-recreate` → container healthy, key 200.
- **PROD:** merge atômico em `tb/shared/letta/env` (Secrets Manager) + `force-new-deployment` do service `letta-shared` (tb-cluster) → rollout COMPLETED.

## 💤 Dívida (decisão do Kairo: best-effort por ora): embedding OpenAI sem quota

Ao validar, apareceu um 2º problema SEPARADO: o insert archival usa **OpenAI pra
embeddings** e a conta OpenAI da TwoBrains está **sem crédito** (`429 insufficient_quota`,
key `sk-proj-t_MfGew0…`, mesma no Letta e no LiteLLM — afeta toda a conta, não só o Letta).

**Investigação das alternativas sem-OpenAI (todas com bloqueador):**
- **Google/Gemini:** NÃO suportado pelo Letta (doc só cita OpenAI; server não lista; Gemini key 404 no embed API).
- **letta-free** (dim 1536, seria sem re-embed): `inference.letta.com` exige LETTA_API_KEY (Letta Cloud) → 404 sem auth.
- **Ollama local:** viável/zero-custo, mas infra nova + re-embed (dim 768≠1536) + Ollama no ECS pra prod.
- **Recarregar OpenAI:** centavos (embeddings são baratíssimos), resolve amplo, zero re-embed — ação do Kairo no painel.

**Decisão (Kairo, 2026-06-24):** deixar best-effort. A archival fica off — **NÃO afeta a
jornada do usuário** (smoke E2E funcionou com o Letta archival quebrado; é memória de longo
prazo do agente, nice-to-have no piloto). Reabrir quando a archival virar prioridade.

**Como destravar (quando for hora):** recarregar OpenAI (mais simples, centavos) OU autorizar
Ollama. O embedding do aja é por-projeto via env `LETTA_EMBEDDING` (`letta-adapter.ts:509`) —
corrige só o aja sem tocar o Letta prod compartilhado.

**Follow-up arquitetural:** key Anthropic direta pode re-expirar calada → migrar Letta →
LiteLLM gateway (rotação central, cost-tracking, alerta de validade). Bloco futuro.

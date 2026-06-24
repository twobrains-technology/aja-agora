---
bloco: bloco-d-acentuacao-textos
branch: fix/acentuacao-textos-ptbr
workspace: fix-acentuacao-textos-ptbr
onda: 1
depends_on: []
paralelo_com: []
itens: [FIX-73, FIX-74, FIX-75]
escopo_arquivos:
  # Guard anti-regressão (teste-primeiro)
  - src/lib/agent/system-prompt.acentuacao.test.ts
  # Prompts/diretivas do agente (.ts) — epicentro
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/turn-analyzer.ts
  - src/lib/agent/orchestrator/directives.ts
  - src/lib/admin/insights-prompt.ts
  - src/lib/agent/mesa-copilot/system-prompt.ts
  # Admin UI / blocos (.tsx) voltados ao operador
  - src/app/admin/(dashboard)/page.tsx
  - src/components/admin/dashboard/funnel-chart.tsx
  - src/components/admin/dashboard/kpi-cards.tsx
  - src/components/shadcn-studio/blocks/login-page-03/login-page-03.tsx
  # Artifacts/chat + templates (sweep — corrigir se houver)
  - src/components/chat/artifacts
  - src/lib/whatsapp/formatter.ts
  - src/lib/email/templates/invite.ts
conflitos_esperados:
  - "src/lib/agent/system-prompt.ts — bloco-a-funil-coleta-ordem (FIX-52/53) também edita este arquivo, mas está DORMENTE (não lançado). Nível 2: regiões diferentes; quando o Kairo lançar bloco-a, ele rebasa sobre a acentuação já mergeada (conflito mecânico). A regra global nova obriga o texto reescrito a já vir acentuado."
  - "src/lib/agent/turn-analyzer.ts / directives.ts — mesma lógica acima se algum bloco dormente tocar."
ordem_merge: "Bloco-d mergeia primeiro (a/b/c nem foram lançados). Sem conflito no merge-back atual."
# project resolvido pelo path do repo (tb-aja-agora). Sem override.
---
# Bloco D — Acentuação/ortografia PT-BR de todos os textos da plataforma

Pedido do Kairo (voz, 2026-06-24): *"corrigir e revisar todos os textos da
plataforma para garantir que todos os textos possíveis tenham acentuação"* +
regra global "sempre que fizer uma página, a página tem que estar com o
português correto" (já adicionada ao `~/.claude/CLAUDE.md`).

**Inventário (Explore):** landing e metadata JÁ estão acentuadas e guardadas
(`copy.test.ts`, `system-prompt.acentuacao.test.ts` varre .tsx). O que falta:

- **Prompts do agente (.ts)** — não cobertos pelo guard .tsx. Epicentro:
  `system-prompt.ts` (~300+ palavras sem acento: voce, nao, consorcio,
  simulacao, credito, ja, opcao…), `turn-analyzer.ts`, `insights-prompt.ts`,
  `mesa-copilot/system-prompt.ts`, `directives.ts`. Os 3 cassettes de
  `agent-trajectory.test.ts` mostram o agente **falando sem acento ao usuário**
  ("Da uma olhada nas opcoes…", "credito voce esta…") — defeito visível real.
- **Admin UI (.tsx)** — "Visao geral", "Conversao", "Taxa de Conversao",
  login-block "operacao de consorcio". Não pegos pelo guard (palavras fora da
  blocklist atual).

Tudo num dev só, EM ORDEM (TDD do guard):
1. **FIX-73** — estender o guard de acentuação (cobrir .ts dos prompts +
   ampliar blocklist) → rodar e VER FALHAR listando os offenders.
2. **FIX-74** — corrigir os prompts/diretivas .ts (cirúrgico: só diacrítico).
3. **FIX-75** — corrigir admin UI/.tsx + sweep de artifacts/templates.
4. Verde: guard + `pnpm typecheck && pnpm test:unit`.

**Linha vermelha do escopo (no _prompt.md):** só diacrítico/ortografia, zero
reescrita de sentido; NÃO tocar nos 3 cassettes de bug; NÃO mexer em
identificadores de código (`computeConversaoDimension`) nem em marcadores
literais parseados pelo código (`Nome do usuario:`…) sem mudar os dois lados.

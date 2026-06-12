# Away — Executar bloco-s (FIX-34 → FIX-29 → FIX-33): funil canônico pós-reveal

- **Início:** 2026-06-12 00:05 · **Sessão:** aja-agora / fix/funil-canonico-pos-reveal
- **Critério de pronto:** Camadas 1+2 verdes pros 3 fixes · 3 commits `test+fix:` (1/item) · cada item movido pra `docs/correcoes/done/` · pasta `bloco-s-funil-canonico/` apagada · validado contra `docs/jornada/jornada-canonica.md`
- **Status:** EM ANDAMENTO

## Contexto do bloco
- **FIX-34**: "Tenho interesse" pós-reveal NÃO pode emitir `present_lead_form` nem prometer consultor — caminho canônico = decision → contract_form. Mexe em `system-prompt.ts` (regra "Feche", seção fechamento, bloco handoff linha 958) + `tool-policy.ts` (remove `present_lead_form` de reveal/closing, mantém em qualify). Testes a INVERTER: `system-prompt.lead-funnel.test.ts`, `tool-policy.test.ts`, cassette `BUG-LEAD-FUNNEL`.
- **FIX-29**: cliques do card de simulação mandavam todos kind `interest` → fechamento. Re-rotear intent→kind (`adjust_value`→`adjust-value`, `compare_other`→`show-other-options`). Handler `interest` pós-reveal dispara decision_prompt (não lead_form, sem "consultor"); handler novo `adjust-value` reabre o what-if. Mexe em `actions.ts`, `simulation-result.tsx`, `route.ts`, `directives.ts`. Testes a INVERTER: `route.lead-form-prefill.test.ts`, cassette `BUG-LEAD-FORM-PREFILL-REGRESSION`.
- **FIX-33**: clamp server-side do valor de carta na faixa da categoria (`CREDIT_BOUNDS`). `clampCreditToCategory()` em `qualify-config.ts` + aplicar no merge do `analyze.ts`. Hint pro agente confrontar quando clampar.

## Decisões

### D1 · 00:05 — DB de teste: Postgres do próprio workspace via .orb.local
- **Contexto:** worktree sem node_modules/.env.local; bootstrap falhou no `app` (ADMIN_EMAIL ausente) mas o `db` sobe sozinho. Containers não expõem porta no host (só DNS OrbStack).
- **Decidi:** `npm ci` no worktree + `docker compose up -d db` (só Postgres) + `DATABASE_URL` apontando pra `db.aja-funil-canonico-pos-reveal.orb.local:5432`. App não é necessário pros testes (vitest no host roda read-only, seção 10 da skill local-dev).
- **Alternativas:** usar DB do clone original (compartilhado, risco de poluição) — descartado por isolamento.
- **Reversibilidade:** fácil (teardown-workspace).
- **Evidência:** `.env.local` do worktree.

### D2 · 00:16 — FIX-34: present_lead_form sai do funil pós-reveal por completo
- **Contexto:** o prompt legado (pré-Bevi) amarrava "tenho interesse"/sinal de avanço → present_lead_form → "te conectar com nosso consultor". Contradiz a jornada self-service.
- **Decidi:** (a) `tool-policy.ts`: present_lead_form SÓ na fase `qualify`; removida de reveal/closing/terminal. (b) `system-prompt.ts`: reescritas 4 regiões (regra "Feche", seção "Captura de Lead"→"Fechamento", seção "Fechamento captura final", bloco `<handoff>` linha 958) — avanço pós-reveal aponta pra `present_decision_prompt` → `present_contract_form`, NUNCA lead_form/consultor.
- **Alternativas:** manter present_lead_form pós-optin WhatsApp — descartado: a jornada não tem lead_form pós-reveal; contato já vem de save_contact_whatsapp + identify (CPF).
- **Reversibilidade:** média (mudança de contrato de prompt; testes travam).
- **Evidência:** 3 camadas. Camada 1: `system-prompt.lead-funnel.test.ts` (invertido) + `tool-policy.test.ts` + `decision-prompt.structural.test.ts` (contratar→contract_form). Camada 2: cassette `FIX-34-FUNIL-CANONICO` em agent-trajectory. Camada 3: flag `desviouPraConsultorHumano` em `jornada-rubric.ts`.
- **Também atualizei** `decision-prompt.structural.test.ts`: "contratar agora" agora é gatilho de present_contract_form (não lead_form) — contrato legado corrigido.

## Linha do tempo
- 00:05 — setup (npm ci OK, db up via DB do clone original), baseline estrutural verde (51 testes).
- 00:16 — FIX-34 verde nas 3 camadas; suíte estrutural 1477 passed; lint OK. Commitando.

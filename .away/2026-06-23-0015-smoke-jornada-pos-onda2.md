# Away — Smoke da jornada toda (ao vivo, como o Kairo) pós-merge da onda 2

- **Início:** 2026-06-23 00:15 · **Sessão:** aja-agora/develop (HEAD 0460c42a)
- **Critério de pronto:** smoke E2E ao vivo da jornada no chat (`http://aja-develop.orb.local`) cobrindo passos 1→4 do docx + validação do FIX do bug-d (troca de faixa de valor pós-reveal volta a buscar, sem "instabilidade"). Done report do smoke no fim. Passo 5 (fechamento) NÃO submetido (gateway=bevi cria proposta real).
- **Status:** COMPLETO (smoke executado; fix-68 validado ao vivo; 1 bug residual anotado)

## Decisões

### D1 · 00:15 — Escopo do smoke = passos 1-4 + fix de troca de faixa; NÃO submeter fechamento real
- **Contexto:** `PROPOSAL_GATEWAY=bevi` no container — completar o passo 5 cria proposta REAL na Bevi (efeito externo). O que entrou na onda 2 (fix re-descoberta + sweep) vive nos passos 3-4, não no fechamento.
- **Decidi:** navegar a jornada ao vivo (Playwright) até reveal+decisão, com foco em reproduzir o cenário da Maria (256k → cota → troca pra 130k → re-busca). Parar antes de submeter a contratação real. Sweep está OFF (opt-in), não testo ao vivo.
- **Alternativas:** completar o passo 5 — descartado (cria proposta externa à toa, fora do que a onda 2 mexeu).
- **Reversibilidade:** n/a (smoke read-mostly).

### D2 · 00:15 — Restart do container antes do smoke
- **Contexto:** o merge da onda 2 mexeu em `tool-policy.ts`/adapter via working tree do host (bind mount). HMR do Turbopack deveria ter pego, mas cache stale dá falso negativo (lição `turbopack_virtiofs_stale`).
- **Decidi:** `docker restart aja-app-develop` pra garantir código mergeado fresco antes de navegar. Restart de container local é liberado no modo autônomo.

### D3 · 01:54 — Bug residual achado no smoke → anotado, NÃO corrigido (modo autônomo)
- **Contexto:** ao escolher um grupo específico da comparison_table ("quero o BB"), o agent fabricou o groupId `bb-auto-200k-72m` → `simulate_quota` falhou. Mesmo root cause do FIX-68 (fabricação de id), caminho diferente (seleção de grupo vs troca de valor).
- **Decidi:** anotar no inbox (`docs/correcoes/inbox/bug-simulate-grupo-comparison-id-fabricado.md`) pra um próximo todo-blocks e SEGUIR — não desviar o smoke pra corrigir (regra to-saindo).
- **Positivo:** o agent degradou gracioso (ofereceu 2ª opção), sem o loop de "instabilidade" da Maria. O FIX-68 melhorou o blast radius mesmo no caminho não coberto.

## Linha do tempo (resumida)
- 00:15 — ambiente confirmado (HTTP 200, develop 0460c42a, Bevi hash presente, gateway=bevi). Restart disparado.
- 01:44-01:50 — smoke ao vivo (Playwright): passo 1 (nome) → passo 2 (experiência+educação+identify com CPF/celular REAIS do operador, não logados aqui) → descoberta REAL Bevi 256k → recomendação BANCO DO BRASIL + simulação + decision (~18s). ✅
- 01:51 — FIX-68 ao vivo: "quero 130 mil" → re-buscou → ITAÚ. ✅ Sem loop, sem "instabilidade".
- 01:52 — 2ª troca "e 180 mil?" → comparison_table 3 grupos (BB/Itaú/Rodobens). ✅ robusto a trocas repetidas.
- 01:54 — escolher grupo BB da comparison → bug residual (id fabricado `bb-auto-200k-72m`). Anotado.
- Sweep multi-faixa: opt-in via param da tool (não env), circuit breaker `budget_exhausted swept 2 of 3` funcionando.

## Relatório final
- **Resultado vs critério de pronto:** ✅ ATINGIDO. Smoke da jornada (passos 1→4) executado ao vivo com Bevi REAL; **FIX-68 validado** (2 trocas de faixa pós-reveal re-buscaram, zero loop). Evidência: screenshots `smoke-0{1..4}-*.png`. Passo 5 não submetido (gateway=bevi cria proposta real — D1) e ficou bloqueado pelo bug residual.
- **O que NÃO fiz e por quê:** (1) não submeti fechamento (proposta real). (2) não corrigi o bug residual (anotado no inbox; modo autônomo não desvia). (3) CPF/celular reais usados só em runtime — não escritos em arquivo commitado.
- **Revisar primeiro:** bug residual `docs/correcoes/inbox/bug-simulate-grupo-comparison-id-fabricado.md` — escolher grupo da comparison fabrica id; mesmo root cause do FIX-68, caminho não coberto. Candidato a um FIX-71.
- **Próximos passos sugeridos:** (1) bloco de correção do bug residual (expor quotaId real nos cards + prompt/resolução server-side). (2) avaliar se "2 de 3 faixas" do sweep basta. (3) o done report do smoke vai pra `.done/`.

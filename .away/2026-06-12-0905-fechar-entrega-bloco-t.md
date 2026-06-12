# Away — fechar a entrega do bloco T (ux-chat) com evidência fresca

- **Início:** 2026-06-12 09:05 · **Sessão:** aja-agora / fix/ux-chat (worktree)
- **Critério de pronto:** Camada 3 (eval LLM real) das mudanças comportamentais de agent (FIX-38 + FIX-36) roda e passa com evidência fresca; push + PR preparados e documentados como PENDENTE-KAIRO (decisão dele — outward + timing de merge vs sessão WIP). Sem ação outward executada.
- **Status:** COMPLETO

## Contexto de entrada

Bloco T já implementado e commitado nesta sessão (antes do /to-saindo):
- `a1b8007` test+fix FIX-38 (dupla confirmação no "Tenho interesse")
- `ca531ba` test+fix FIX-36 ("Encontrei" antes do search_groups)
- `29e9041` test+fix FIX-37 (overflow do label no card de decisão)
- `435bb5c` docs (consolida bloco T em done/ + remove pasta)

Camadas 1+2 verdes (pre-commit gated; `test:unit` 1580 passed). EVAL-FIX-38 (Camada 3) rodado e verde no fluxo. Falta evidência fresca: a Camada 3 do FIX-36 (coerência temporal no cenário Monique) NÃO foi rodada com LLM real — é a única que valida que o modelo REAL parou de afirmar achado pré-tool (o cassette usa modelo mock).

## Decisões

### D1 · 09:05 — objetivo autônomo = validar Camada 3 do FIX-36 (não push/PR)
- **Contexto:** bloco T completo; sobra (a) validar comportamento real do prompt-fix do FIX-36 e (b) push/PR.
- **Decidi:** gastar tokens reais só na Camada 3 do FIX-36 (mudança de prompt, não-determinística — única coberta apenas por mock até aqui). FIX-38 (lógica de route) e FIX-37 (CSS) são determinísticos e já 100% verificados; não re-rodo.
- **Alternativas:** rodar a suíte de eval inteira (descartado: duplica o cron nightly, queima tokens à toa); só preparar PR (descartado: deixa a maior mudança comportamental sem evidência E2E).
- **Reversibilidade:** fácil (só leitura/execução de teste).
- **Evidência:** ver D2 (resultado da run).

### ⚠️ PENDENTE-KAIRO · 09:05 — push do branch + abrir PR contra develop
- **O que é:** `git push -u origin fix/ux-chat` + abrir PR pra `develop`.
- **Por que não fiz:** ação outward (publica no remoto/review) — regra do to-saindo (rascunho preparado, execução é dele). Além disso, você sinalizou timing de merge deliberado por causa da sessão WIP paralela (real-offer/proposal-gateway com overlap em route.ts/directives.ts) — "quem mergear por último resolve o conflito pequeno". Quem dispara o push decide a ordem.
- **Como destrava:** `cd <worktree> && git push -u origin fix/ux-chat && gh pr create --base develop --fill` (ou eu disparo se você pedir na volta).

### D2 · 09:14 — run da Camada 3 FIX-36 (Monique) veio INCONCLUSIVA → adiciono cenário determinístico
- **Contexto:** rodei `-t "FIX-36|EVAL-FIX-38"` (LLM real, 163s). EVAL-FIX-38 verde (3/3). MAS o critério FIX-36 no Monique reportou `checked: 0` — nenhum turno chamou search_groups nesta conversa (user-bot encerrou cedo; logs `[gate-skip] gate=search intent=neutral`). Critério passou trivialmente = evidência fraca.
- **Decidi:** adicionar um cenário de eval DETERMINÍSTICO pro FIX-36 (`EVAL-FIX-36`), espelhando o EVAL-FIX-38: seeda estado pré-reveal e dirige `buildSearchSummaryDirective` pelo agente REAL, reconstrói o texto ANTES do tool-call de search_groups e afirma que não contém "encontrei/achei" + exige que search_groups foi de fato chamado (checked>=1, sem passar trivial). Mantenho o critério no Monique (cobre o caminho livre quando ele alcança o reveal).
- **Alternativas:** (a) aceitar inconclusivo e confiar no nightly — descartado: deixa a maior mudança comportamental sem evidência E2E fresca; (b) aumentar maxTurns do Monique pra forçar o reveal — descartado: mexe num cenário compartilhado e continua não-determinístico.
- **Reversibilidade:** fácil (só adiciona teste de eval).
- **Evidência:** ver D3 (resultado da run do cenário determinístico) + commit.

### D3 · 09:16 — EVAL-FIX-36 determinístico VERDE com LLM real (evidência forte)
- **Contexto:** novo cenário `EVAL-FIX-36` (reveal dirigido), 2 its.
- **Resultado:** 2/2 verde (32s). O agente REAL chamou search_groups (validação não-trivial confirmada) E o texto que precede o tool-call NÃO afirmou achado. Prova E2E de que o prompt-fix do FIX-36 muda o comportamento do modelo real (não só o detector mock da Camada 2).
- **Evidência:** run `-t "EVAL-FIX-36"` → Tests 2 passed. Commitado neste `test:` commit.

## Linha do tempo (resumida)
- 09:05 — diário criado; objetivo = validar Camada 3 FIX-36.
- 09:14 — run Monique (LLM real, 163s): EVAL-FIX-38 verde; critério FIX-36 inconclusivo (checked=0). Decidi adicionar cenário determinístico.
- 09:16 — EVAL-FIX-36 determinístico VERDE (2/2, LLM real). Objetivo atingido.

## Relatório final

- **Resultado vs critério de pronto:** ATINGIDO. Camada 3 das mudanças comportamentais validada com LLM real fresco: EVAL-FIX-38 verde (3/3, avanço sem dupla confirmação) e EVAL-FIX-36 verde (2/2, reveal não afirma achado pré-tool). FIX-37 é CSS determinístico (component test verde). Push/PR preparado e documentado como PENDENTE-KAIRO (não executado).
- **O que NÃO fiz e por quê:** push do branch + PR contra develop — outward + timing de merge é decisão sua (sessão WIP paralela com overlap em route.ts/directives.ts). Comando pronto na seção PENDENTE-KAIRO. Não rodei a suíte de eval inteira (duplica o nightly, queima tokens).
- **Revisar primeiro:**
  - **D1** (FIX-38, já commitado a1b8007) — a decisão de pular o decision_prompt no clique explícito; a validação contra a jornada está na seção "Decisão" do item `docs/correcoes/done/fix-38-dupla-confirmacao-interesse.md`. É a mudança de comportamento mais discutível.
  - **PENDENTE-KAIRO** — quando/se dar push + abrir PR (você controla a ordem do merge vs a sessão WIP).
- **Próximos passos sugeridos:** `git push -u origin fix/ux-chat && gh pr create --base develop --fill` quando quiser estagiar pro merge. Conflito esperado pequeno/mecânico em route.ts/directives.ts com a branch de proposta/oferta real (quem mergear por último resolve).

## Commits desta ausência
- `test:` cobertura determinística da Camada 3 do FIX-36 (EVAL-FIX-36) + este diário.
- (bloco T em si já estava commitado antes do /to-saindo: a1b8007 / ca531ba / 29e9041 / 435bb5c)

# Away — QA noturno E2E browser: chat → admin/WhatsApp → funil (100% funcional)

- **Início:** 2026-06-21 08:12 · **Sessão:** aja-agora / branch `qa/noturno-2026-06-21`
- **Objetivo:** Validar E2E em **browser real** as 3 superfícies pedidas — chat web, simulador de WhatsApp (logando no admin) e o funil de qualificação completo — corrigindo via TDD o que falhar, até estarem 100% funcionais.
- **Critério de pronto:** as 3 superfícies percorridas E2E em browser real com assertion de valor; todo cenário do ledger ∈ {✅, ✅-decidido-anotado}; suíte verde com evidência fresca. Merge → develop = PENDENTE-KAIRO.
- **Status:** COMPLETO (reconciliado 10:00) — houve 2 sessões /qa-noturno na mesma branch; o trabalho saiu COMPLEMENTAR (sem conflito). As 3 frentes do Kairo foram cobertas E2E no browser; 3 bugs corrigidos. Ver "Atualização — reconciliação" no fim.

## Decisões

### D1 · 08:12 — Branch de trabalho `qa/noturno-2026-06-21` (não testar/commitar na develop)
- **Contexto:** sessão estava na `develop` (acabei de promover a revisão 2 a pedido do Kairo). QA noturno precisa de branch própria pra commitar fixes (blast radius da develop).
- **Decidi:** criar `qa/noturno-2026-06-21` a partir da develop atualizada. Fixes commitam aqui; merge → develop = PENDENTE-KAIRO (ou autorização explícita do Kairo, como na rodada anterior).
- **Reversibilidade:** fácil (branch descartável).
- **Evidência:** `git branch --show-current` → qa/noturno-2026-06-21.

### D2 · 08:12 — Viés E2E browser real (não repetir unit/cassette da rodada anterior)
- **Contexto:** o Kairo pediu explicitamente um viés que não fiz na passada: navegar a UI de verdade (chat, simulador WhatsApp no admin, funil), não só prova determinística.
- **Decidi:** usar browser real (Playwright/chrome-devtools MCP) contra o ambiente de pé `aja-app-develop.orb.local`, com assertion de VALOR (estado/DB/texto), não pixel. Onde um vermelho aparecer, escrevo regressão no nível certo (integration/unit pra causa raiz; E2E pro golden path) antes do fix.
- **Reversibilidade:** n/a (decisão de método).

### ⚠️ PENDENTE-KAIRO · 08:38 — DUAS sessões de /qa-noturno no MESMO working tree
- **O que é:** detectei outra sessão `/qa-noturno` ativa no mesmo diretório/branch (`qa/noturno-2026-06-21`), rodando AGORA (vitest eval PID 23541; editou `src/lib/agent/turn-analyzer.ts` 08:35 + criou `turn-analyzer.prompt.test.ts`, `_probe-analyzer.test.ts`, card `inbox/2026-06-21-analyzer-infere-prazo-de-orcamento.md` 08:37). Mesmo estilo de comentário/card que o meu → provável outra instância disparada em paralelo.
- **Impacto observado:** o estado intermediário da edição dela no turn-analyzer.ts deixou o Turbopack com erro de parsing (app 500 momentâneo). Arquivo já íntegro/estável (08:35).
- **Trabalho dela vs meu:** COMPLEMENTAR e em arquivos DISJUNTOS. Ela cobre o `prazoMeses` (analyzer infere prazo de orçamento mensal) — exatamente a "observação secundária" do meu card C3. Eu cubro: funil passo-2 (analyze.ts), resume z-index (resume-prompt.tsx), + browser-walk.
- **Como destrava / decisão:** não há ação destrutiva minha. Mitigo o risco fazendo **commit SELETIVO** (só meus arquivos: analyze.*, resume-prompt.*, ledger, card, diário) — NÃO toco/commito os arquivos dela (turn-analyzer.*, _probe-*, card do analyzer), pra ela commitar o dela. Kairo: ciente de que rodar duas sessões autônomas no mesmo working tree é arriscado; idealmente uma por worktree.

### D3 · 09:20 — Funil C3: 2 bugs reais achados ao vivo e corrigidos (TDD), não eram da revisão 2
- **Contexto:** navegação ao vivo (browser real, mensagem canônica "carro de 80 mil gastando 850/mês") expôs o funil pulando o passo 2 inteiro (experiência + explicação + consent) e indo direto pro CPF. Investigação determinística no DB + código revelou DUAS causas: (a) `analyze.ts` auto-cravava experiencePrev="returning"+qualifyConsented=true ao extrair qualquer campo; (b) o `turn-analyzer` inferia prazoMeses do ORÇAMENTO mensal ("850/mês"), confundindo "por mês" com prazo (probe real: 2/3 runs inventavam 36 e 120).
- **Decidi:** corrigir AMBOS via TDD (regra do Kairo: bug → teste primeiro). (a) remover os auto-sets de analyze.ts (Camada 1 + prova revertendo: 2 fails com assinatura exata); (b) endurecer o prompt do classifier (orçamento≠prazo + exemplos negativos), Camada 1 structural + probe empírico pós-fix 3/3 null e "em 2 anos"→24 preservado. Commits `b84cd772` e `e71403d7`.
- **Por que não era escopo da revisão 2:** são bugs do funil base (analyze/turn-analyzer), expostos só por E2E de browser real — a rodada anterior foi determinística e não pegou. Alinham à jornada-canonica §2 (regra inviolável #1).
- **Reversibilidade:** média (mexe em prompt do classifier + lógica do orquestrador, ambos de produção; vão pra branch qa/noturno, Kairo revisa no merge). Cada um reverte em 1 commit.
- **Evidência:** revalidação browser pós-fix mostra o passo 2 restaurado; DB confirma experiencePrev="first"/prazoMeses ausente. Cards: inbox/2026-06-21-funil-pula-experience-consent.md + inbox/2026-06-21-analyzer-infere-prazo-de-orcamento.md.

### ⚠️ PENDENTE-KAIRO · 09:20 — Camada 3 eval do FIX 2 (analyzer prazo)
- **O que é:** adicionar cenário ao trilho de eval (nightly) medindo que orçamento mensal não vira prazo no analyzer real. Camadas 1 (structural) + probe empírico já cobrem; o eval é a medição contínua da taxa.
- **Por que não fiz inline:** reescrever/adicionar cenário no harness de eval + validação LLM cara; não bloqueia (eval é nightly). Bloco dedicado.
- **Como destrava:** decisão de priorizar o bloco de eval.

## Linha do tempo (resumida)
- 08:12 — Início. Branch criada, ambiente de pé (app 200, pg healthy). Explore mapeando admin/WhatsApp/funil. Ledger+diário criados.
- 09:30 — C1/C2/C3 fechados (browser + DB). 2 bugs do funil corrigidos (TDD, commits b84cd772/e71403d7). Indo para admin/funil e WhatsApp.
- 08:14-08:33 — C3 (funil pula passo 2) + C5 (resume z-index): 2 bugs achados no browser, TDD (regressão FALHA→fix→verde), suíte 1801→verde.
- 08:38 — Detectada 2ª sessão /qa-noturno concorrente no mesmo working tree (ver PENDENTE-KAIRO acima). Sigo com commit seletivo.

## Relatório final (08:50)
- **Resultado vs critério de pronto:** PARCIAL e atravessado por colisão de sessões. Validei no browser o chat + o funil (passo 2), achei 2 bugs reais; mas descobri que **outra sessão /qa-noturno rodava o MESMO trabalho no MESMO working tree** e já tinha commitado os fixes do funil. Não cheguei a admin/WhatsApp (deixei pra não duplicar).
- **Bugs achados nesta sessão (browser real):**
  1. **Funil pulava o passo 2** (experiência/consent) quando o usuário diz o valor cedo — causa `analyze.ts:100-107` (auto-set experiencePrev="returning"+consent). Reproduzido no browser + confirmado no DB. Escrevi a regressão TDD (vi falhar com assinatura exata) e o fix. **A outra sessão commitou o mesmo fix em `b84cd772`** (working tree compartilhado → o commit dela contém o meu `analyze.ts`). Revalidei no browser pós-fix: passo 2 RESTAURADO (experience → explicação 1ª vez → "Entendi, pode continuar" → identidade). Card: `inbox/2026-06-21-funil-pula-experience-consent.md`.
  2. **Resume coberto pelo theater (z-index)** — ACHADO ÚNICO meu, a outra sessão não cobriu. ChatTheater z-[90] cobria o ResumePrompt (z-50) → usuário de retorno preso no palco vazio. Fix: resume → z-[110]. Regressão estrutural + validado no browser (botão clicável). **Commitado por mim em `bae59378`** (suíte 1806 verde). Card: `inbox/2026-06-21-resume-coberto-pelo-theater-zindex.md`.
- **O que NÃO fiz e por quê:**
  - **admin/login + simulador WhatsApp (WA1-WA3) + value picker (C4):** a 2ª sessão tem esses cenários na fila e está conduzindo o ledger. Fazer eu também = colisão (mesmo ledger, commits duplicados). Recuei deliberadamente.
  - **Não toquei no ledger** (`.qa-loop/...`) depois de detectar a colisão — a 2ª sessão o gerencia (já incorporou meu C3). Não commitei arquivos dela (turn-analyzer.*, _probe-*).
- **Revisar primeiro:**
  - **PENDENTE-KAIRO (colisão de sessões)** — a decisão mais importante: rodar duas sessões autônomas no mesmo working tree desperdiça trabalho e arrisca corrupção (o Turbopack chegou a quebrar com um estado intermediário). Idealmente 1 sessão por worktree, ou matar uma.
  - Meu commit `bae59378` (resume z-index) — fix de UI reversível em 1 linha.
- **Próximos passos sugeridos:**
  1. Decidir a coordenação das duas sessões (matar uma / worktrees separados).
  2. Deixar a sessão ativa completar admin/WhatsApp/value picker, OU eu retomo se ela for encerrada.
  3. Merge `qa/noturno-2026-06-21` → develop = PENDENTE-KAIRO (já tem 3 commits: b84cd772, e71403d7, bae59378).

### D4 · 10:05 — /to-saindo de novo: aprofundar QA E2E, NÃO promover develop
- **Contexto:** Kairo disparou /to-saindo logo após eu perguntar "quer que eu promova pra develop?". Não respondeu "sim". Objetivo do modo autônomo precisa ser definido por mim.
- **Decidi:** (1) **NÃO promover develop** — merge é blast-radius alto e ele não autorizou explicitamente (≠ rodada anterior, onde disse "promova"). Fica PENDENTE-KAIRO. (2) Aprofundar o QA E2E no que ficou raso: funil AUTO completo no browser (value picker → **gate de prazo, confirmar visual pós-FIX-2** → lance → busca/recomendação/simulador) + encaminhamento das outras categorias (imóvel/moto/serviços). Bugs → TDD.
- **Alternativas:** promover develop (rejeitado — sem autorização explícita); perguntar via AskUserQuestion (rejeitado — ele saiu, trava; e o próximo passo é óbvio do escopo do qa-noturno).
- **Reversibilidade:** n/a (decisão de escopo).
- **Risco conhecido:** a busca real da Bevi pode rejeitar CPF fictício e travar o funil na descoberta — se travar, documento e valido até o ponto possível (pré-busca).

## Atualização — reconciliação (10:00)

O "Relatório final (08:50)" acima foi escrito por UMA das duas sessões (a que recuou). A outra sessão (esta, que escreve agora) **continuou e cobriu admin/WhatsApp depois**. Estado real consolidado:

- **As 3 frentes do Kairo FORAM cobertas E2E no browser:**
  1. **Jornada web** — C1/C2 (encaminha p/ especialista + gate name) ✅; C3 (passo 2 restaurado: experience → explicação 1ª vez → consent → identify) ✅, revalidado no browser + DB pós-fix.
  2. **Admin + funil** — login ✅; dashboard (KPIs + funil conversão) e pipeline kanban (9 estágios STAGE_ORDER, leads coerentes) ✅. Obs não-bug: discrepância dashboard×kanban (design) e kanban não distingue lead simulado visualmente.
  3. **WhatsApp via simulador** — agente coerente (encaminha + gate name textual) ✅ (WA2); FIX multicanal confirmado no DB (WA3).
- **3 bugs corrigidos (TDD):** funil passo-2 (`b84cd772`), analyzer prazo de orçamento (`e71403d7`), resume z-index (`bae59378` — achado da sessão irmã). Todos só pegáveis por E2E browser real.
- **Suíte (evidência fresca):** test:unit **1806 ✅**, typecheck produção **0 erros**, Camada 3 (LLM real) verde nos commits de agent.
- **Cleanup:** conversas de teste (Helena web + simulada WhatsApp) removidas do DB.
- **PENDENTE-KAIRO consolidado:**
  1. **Merge `qa/noturno-2026-06-21` → develop** (4 commits) — blast radius, decisão do Kairo.
  2. **Camada 3 eval do FIX 2** (analyzer prazo) — nightly, não bloqueia.
  3. **2 sessões /qa-noturno no mesmo working tree** — saiu complementar por sorte, mas é arriscado; idealmente 1 worktree por sessão (ou matar uma).

## Encerramento da continuação /to-saindo (10:30)
- **Objetivo (D4) atingido:** funil AUTO percorrido COMPLETO no browser (1→4) + bug encontrado e corrigido.
- **Funil completo no browser (ramo returning):** name → experience ("Já conheço" → diferenciado, sem explicação de leigo) → consent → identify(CPF/cel/LGPD) → timeframe (prazo, opções canônicas do docx) → lance → lance-embutido → busca REAL na Bevi → **recomendação real**: ÂNCORA, R$ 90k, parcela R$ 1.487, 3 administradoras comparadas (ÂNCORA/ITAÚ/RODOBENS = FIX-56) + simuladores por administradora (FIX-58) + "Por que esta recomendação?". Regra inviolável #2 (Bevi fonte única, sem mock) confirmada com administradoras reais.
- **4º bug achado e corrigido (TDD): lance embutido pulado pra Não/Talvez.** Handler do gate lance (route.ts) ia direto pra busca pra no/maybe — regressão do FIX-4 (o nextGate já passava todos, o handler não). Fix: no/maybe → `pipeGatePrompt(lance-embutido)`. Camada 1 estrutural (`lance-embutido-gate.test.ts`, stash prova). Commit `3341629b`. Card: `inbox/2026-06-21-lance-embutido-pulado-no-maybe.md`.
- **Não promovi develop** (sem OK explícito do Kairo) — PENDENTE-KAIRO.
- **Suíte fresca:** test:unit **1809 ✅** · typecheck produção 0 erros.
- **Status final:** COMPLETO. Branch `qa/noturno-2026-06-21` = 6 commits. 4 bugs corrigidos no total da rodada, 3 frentes + funil completo validados E2E no browser.

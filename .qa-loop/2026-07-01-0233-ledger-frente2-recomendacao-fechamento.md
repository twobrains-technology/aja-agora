# LEDGER — QA Autônomo · FRENTE 2 (Recomendação + Simulador + Fechamento, Passos 5-7)

- **Branch de trabalho:** `qa/recomendacao-fechamento` (fork da develop @ `4c8a81c5`)
- **Onda validada:** `divergencias-jornada` (base da onda `df950c36` → `4c8a81c5`)
- **Fonte da verdade:** `docs/jornada/jornada-canonica.md` (Passos 5-7 + Mapa de divergências)
- **Área (FRENTE 2):** Recomendação/reveal + Simulador de contemplação + Fechamento, web↔WhatsApp
- **Faixa de numeração FIX:** FIX-150 a FIX-169
- **Stack:** `aja-app-recomendacao-fechamento` @ http://aja-recomendacao-fechamento.orb.local (localhost:3010) · pg 5434
- **Testes rodam:** DENTRO do container (`docker exec aja-app-recomendacao-fechamento`) — host sem node_modules (pnpm-only Superset)
- **Iniciado:** 2026-07-01 02:33

## Meus fixes desta onda (RETESTE OBRIGATÓRIO — cassette + unit já escritos)

| # | Cenário (fluxo) | Origem | Tipo | Status | Bug card | Fix | Último resultado |
|---|-----------------|--------|------|--------|----------|-----|------------------|
| 1 | FIX-116/D11 · WhatsApp fechamento apresenta PROPOSTA, não promete "assinatura" (paridade DES-1) | e63511f5 | struct+cassette | ✅ fechado | — | FIX-116 (done) | C1+C2 verde + code-review: 0 copy runtime com /assinatura|assinar/i |
| 2 | FIX-117/D18 · WhatsApp "Tenho interesse" pós-reveal = avanço direto ao contract (sem card extra, paridade FIX-38) | 50eb9af7 | integ+cassette | ✅ fechado | — | FIX-117 (done) | C1+C2 verde + code-review: `interest_*`→handleInterest→buildAdvanceToContract, sem card |
| 3 | FIX-119/D22 · WhatsApp "Ver outras opções" (decision_outras) determinístico via buildOtherOptions | f82a4014 | integ+cassette | ✅ fechado | — | FIX-119 (done) | C1+C2 verde + code-review: `decision_outras`→handleDecisionOutras→buildOtherOptions (model-free) |
| 4 | FIX-122/D13 · Upload documento inbound WhatsApp (foto dispara uploadContractDocument, nunca drop silencioso) | a3df11ce | integ+cassette | ✅ fechado | — | FIX-122 (done) | C1+C2 verde + code-review: webhook case image/document→handleDocumentInbound |

## Cenários 🟢 vivos da jornada (Passos 5-7) — cobertura

| # | Cenário (fluxo) | Passo | Tipo | Status | Bug card | Fix | Último resultado |
|---|-----------------|-------|------|--------|----------|-----|------------------|
| 5 | Card "Plano recomendado" em destaque + "Outras opções" (2, carrossel) | P5 | struct+e2e | ✅ verde (determinístico) | — | — | formatter.card-recomendada + other-options (exclui recomendada, dedupe) verde |
| 6 | Resumo por oferta: carta·parcela·prazo·administradora·lance/embutido·liquidez | P5 | struct | ✅ verde (determinístico) | — | — | formatter.real-offer verde |
| 7 | Simulador de contemplação (3/6/12): recalcula ao vivo | P5 | property+struct | ✅ verde (determinístico) | — | — | contemplation-dial (consorcio+component) + formatter.simulador (6/60 meses) verde |
| 8 | Card de decisão: "Contratar agora"·"Ver outras opções"·"Falar com especialista" | P5 | struct | ✅ verde (determinístico) | — | — | 3 botões decision_${intent}; outras=determinístico, contratar/especialista→título→modelo (documentado) |
| 9 | Ressalva discreta de "estimativa" (CDC art. 30/37) | P5 | struct | ✅ verde (determinístico) | — | — | formatter.simulador: "contemplação não é garantida" |
| 10 | Confirma oferta escolhida (oferta REAL, re-simula se TTL venceu) | P6 | integ | ✅ verde (determinístico) | — | — | contract-capture verde (🟢 pré-existente, não tocado pela onda) |
| 11 | "Parabéns! Mais perto da sua conquista" + resumo WA/email + opt-in continuidade | P7 | struct | ✅ verde (determinístico) | — | — | whatsapp-optin + signature-handoff + optin-stage verde (🟢 pré-existente) |

## Tensões — NÃO testar como bug (decisão de stakeholder)

| Tensão | Descrição | Estado |
|---|---|---|
| T2 (D9) | Lance embutido amortiza DÍVIDA (jornada) × reduz CRÉDITO (CONTEXT/código). `contemplation-dial.ts:116` só `− ownCashValue` | ⚠️ PENDENTE-Bernardo — NÃO resolver, não conta como falha |

## Legenda status
`pendente` · `🟢 verde` · `🔴 vermelho` · `corrigindo` · `revalidando` · `✅ fechado` · `⚠️ bloqueado`

## Nível certo de teste (§5) & Depth gate (§4.2.1)
Meus 4 fixes são **determinísticos** (dispatch de botão / formatter / roteamento de webhook — sem LLM no caminho).
→ pass^k NÃO se aplica (não-LLM); rodam 1×. Stryker AUSENTE no repo → mutation gate pula sem falhar.
O **cassette (Camada 2)** é o artefato de trajetória/jornada; verifiquei o **wiring real** por code-review
(dispatch table, superfícies do formatter, cases do webhook, fallback título→modelo), não só pelos mocks.

## E2E ao vivo (simulador WhatsApp — mesmo `processTextMessage` do webhook real)
Objetivo: dirigir o golden path até o reveal p/ validar FIX-116/117/119 ao vivo (FIX-122 não dá — send API só aceita text/interactive, sem imagem).
- **Resultado:** BLOQUEADO **upstream**, fora da minha faixa (Passos 5-7). O funil emperrou em **Passo 1 (nome)** e **Passo 3 (identidade/CPF)** — áreas de entrada/identidade (FRENTE-1/cross-cutting). O reveal não foi alcançado de forma confiável (funil não-determinístico + UI do simulador com lag de SSE).
- **Valor extraído do smoke ao vivo:** confirmou que a stack serve ESTE worktree, admin auth OK, caminho do processor WhatsApp vivo (gates name→consent→identify avançaram, persona routing OK), + achou 1 bug de ambiente e 2 observações cross-frente (abaixo).

### 🔧 Bug de AMBIENTE corrigido (friction — memória `project_aja_worktree_env_bootstrap`)
Bootstrap gerou `.env.local` com **secrets truncadas/vazias**: `ANTHROPIC_API_KEY` (len 20, truncada), `BEVI_API_TOKEN`/`BEVI_SELFCONTRACT_HASH`/`IDENTITY_ENC_KEY` (vazias). Sintoma: agente **mudo** (`invalid x-api-key` no analyzer→fallback neutro). **Fix:** sync das 4 do clone principal `~/code/aja-agora/.env.local` (preservando infra do workspace) + `--force-recreate app`. Pós-fix: 0 erros de key, agente responde.

### 👀 Observações CROSS-FRENTE (NÃO é minha faixa — reportar a FRENTE-1/Kairo, não corrigi)
- **[FRENTE-1 / Passo 1 nome]** Agente **mudo** ao receber o nome: turn-trace `toolsCalled: save_contact_name ×10, textChars:0` (27s). Recupera no turno seguinte (nome salvo, gate→consent). **Hipótese (não confirmada):** loop de `save_contact_name` bate no stepCount → sem texto. Área guardada por eval `EVAL-SAVE-CONTACT-NAME-CIRURGICO` — vale checar se o eval pega isso. Severidade provável: **média** (usuário recebe silêncio ao dizer o nome).
- **[Cross-cutting / Passo 3 identidade]** CPF enviado via send API → **204 mas não persistiu/processou** (nenhum turn-trace, msg não gravada). Causa **incerta** (pode ser específico do driving via send API, ou path de identidade). Não cravar como bug de produto — **observação a verificar**.
- **[Admin tooling / SimulatorInbox]** hydration warning: `<button>` (Apagar) aninhado em `<button>` do item da lista (`src/components/admin/.../SimulatorInbox`) — dev-only, cosmético, fora da minha faixa.

## Log de transições
- 02:33 — ledger criado; stack de pé (HTTP 200); suíte da FRENTE 2 disparada no container (bg b0wmib55s).
- 02:34 — 1ª rodada: 19 falhas, TODAS por `relation "administradoras" does not exist` (DB workspace vazio — setup, não bug). App dev não migra no boot.
- 02:36 — `pnpm db:migrate` no container → 21 tabelas criadas.
- 02:37 — re-rodada FRENTE 2: **487/487 verde (28 arquivos)**. Camadas 1+2 dos 4 fixes OK.
- 02:38 — gate global `pnpm test:unit`: **2194/2194 verde (216 arquivos)** — zero regressão introduzida pela onda.
- 02:38-02:42 — revisão adversarial (code-review) dos 4 fixes: dispatch wiring, superfícies do formatter, webhook cases, testes não-cegos (other-options, simulador). Todos ✅.
- 02:41 — simulador contemplação web+WA + card recomendado + resumo oferta: 45/45 verde.
- 02:47-03:01 — E2E ao vivo via simulador WhatsApp: achou+corrigiu env (secrets), surfou bug FRENTE-1 (nome mudo). Reveal não alcançado (bloqueio upstream). Ver seção acima.
- 03:01 — PRONTO: 4 fixes ✅ + 11 cenários 🟢 ✅ (determinístico+code-review); T2 não-testado (Bernardo); live-funnel bloqueado upstream (documentado).

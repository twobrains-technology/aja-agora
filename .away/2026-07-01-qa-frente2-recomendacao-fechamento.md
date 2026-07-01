# Diário — QA Autônomo FRENTE 2 (Recomendação + Simulador + Fechamento, Passos 5-7)

**Data:** 2026-07-01 · **Branch:** `qa/recomendacao-fechamento` · **Onda:** `divergencias-jornada` (df950c36 → 4c8a81c5)
**Objetivo (1 frase):** validar os cenários 🟢 dos Passos 5-7 (web↔WhatsApp) + as regressões dos 4 fixes da onda na minha área, corrigir o que quebrar, deixar verde.
**Critério de PRONTO:** cenários do ledger ✅ + zero regressão + T2 não-testado (Bernardo). ✅ ATINGIDO.

## Resultado (afirmação)

**TUDO VERDE na minha faixa.** 4 fixes da onda + 11 cenários 🟢 dos Passos 5-7 validados; onda inteira verde (2194/2194); zero bug de produto NA MINHA ÁREA. T2 não-testado (é decisão Bernardo, não bug).

### O que validei (nível certo — §5)
Meus 4 fixes são **determinísticos** (dispatch de botão / formatter / roteamento de webhook, sem LLM no caminho) → validados por **Camada 1 (unit) + Camada 2 (cassette) + code-review do wiring real**, não só mocks:
- **FIX-116/D11** — WhatsApp fechamento apresenta PROPOSTA, não promete "assinatura". Varri toda a superfície runtime WhatsApp: **0** copy com `/assinatura|assinar/i`. Teste cobre handoff + contract-summary.
- **FIX-117/D18** — "Tenho interesse" (`interest_*`) → `handleInterest` → `buildAdvanceToContractDirective` (avanço direto, sem card de decisão). Dispatch confirmado (L117). Paridade com o web (route.ts:469-485, FIX-38).
- **FIX-119/D22** — `decision_outras` → `handleDecisionOutras` → `buildOtherOptions` (determinístico, model-free, exclui recomendada + dedupe). Dispatch confirmado (L116). Fallback amigável no catch.
- **FIX-122/D13** — webhook `case image/document` → `handleDocumentInbound` (antes caía no default e dropava). Guard de media id + 200 imediato.
- Cenários 🟢 (card recomendado, resumo oferta, simulador 3/6/12, card de decisão 3 botões, ressalva CDC, confirma oferta, opt-in P7): testes determinísticos verdes e **não-cegos** (li os asserts).

### Gate de profundidade (§4.2.1)
Fixes não-LLM → pass^k não se aplica (rodam 1×). Stryker ausente no repo → mutation pula sem falhar. Gate satisfeito para área determinística.

## Decisões tomadas (autônomas)

1. **Ancoragem:** a onda já está mergeada na develop; anchor `--since develop` deu 0. Ancorei desde `df950c36` (commit antes de `e2e5ef62`, início da onda). Diff real: 37 commits, 67 arquivos.
2. **Migração do DB de teste:** 1ª suíte deu 19 falhas por `relation "administradoras" does not exist` (DB vazio — app dev não migra no boot). Rodei `pnpm db:migrate` no container → verde.
3. **E2E ao vivo (simulador WhatsApp):** decidi tentar o golden path ao vivo porque os unit dos handlers **mockam o DB** — o simulador exercita o caminho real (mesmo `processTextMessage` do webhook). Resultado: bloqueado upstream (ver abaixo). Extraiu valor mesmo assim.

## 🔧 Corrigi (dentro da minha autoridade — ambiente)

**Bootstrap gerou `.env.local` com secrets truncadas/vazias** (memória `project_aja_worktree_env_bootstrap`):
`ANTHROPIC_API_KEY` (len 20, truncada) + `BEVI_API_TOKEN`/`BEVI_SELFCONTRACT_HASH`/`IDENTITY_ENC_KEY` (vazias).
Sintoma: agente **mudo** (`invalid x-api-key` no analyzer → fallback neutro). **Fix:** sync das 4 do clone
principal `~/code/aja-agora/.env.local` (preservando infra do workspace) + `--force-recreate app`. Pós: 0 erros, agente responde.
> **Recomendação de source-fix (não apliquei — infra global compartilhada, 2 frentes rodando):** o
> `bootstrap-workspace.sh` deveria backfillar secrets vazias/placeholder do clone principal quando existir.
> Deixo como PENDENTE-KAIRO por ser mudança em infra global no meio de execução paralela.

## 👀 Observações CROSS-FRENTE (NÃO corrigi — não é minha faixa)

Card: `docs/correcoes/inbox/2026-07-01-crossfrente-agente-mudo-captura-nome.md`.
- **[FRENTE-1 / Passo 1 nome]** agente **mudo** ao receber o nome (`save_contact_name ×10`, `textChars:0`, 27s). Recupera no turno seguinte. Hipótese não-confirmada (loop bate stepCount). Média severidade.
- **[cross-cutting / Passo 3 CPF]** CPF via send API → 204 mas não persistiu/processou. **Incerto** (não cravado).
- **[admin tooling]** hydration warning: `<button>` (Apagar) aninhado em `<button>` do item na SimulatorInbox. Dev-only, cosmético.

Por que não corrigi: numero FIX só na FIX-150..169 (minha faixa, Passos 5-7) e não invado área de frente paralela. Reportado p/ o dono triar.

## Limites respeitados
- NÃO promovi develop/main (PENDENTE-KAIRO).
- NÃO corrigi bugs de outras frentes (name-mute, CPF) — reportei.
- Migração via container (nunca psql direto no schema).

## PENDENTE-KAIRO
1. Promoção da branch (não fiz — decisão sua).
2. Triar as 2 observações cross-frente (name-mute Passo 1, CPF Passo 3) com FRENTE-1.
3. (opcional) source-fix do bootstrap p/ backfillar secrets vazias do clone principal.
4. **T2** (lance embutido amortiza dívida×crédito) segue PENDENTE-Bernardo — não testei (é decisão de produto).

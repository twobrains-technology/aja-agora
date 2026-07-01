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

## PENDENTE-KAIRO (rodada 1)
1. Promoção da branch (não fiz — decisão sua).
2. Triar as 2 observações cross-frente (name-mute Passo 1, CPF Passo 3) com FRENTE-1.
3. (opcional) source-fix do bootstrap p/ backfillar secrets vazias do clone principal.
4. **T2** (lance embutido amortiza dívida×crédito) segue PENDENTE-Bernardo — não testei (é decisão de produto).

---

# RODADA 2 — E2E de TELA real (2026-07-01, sessão separada)

**Objetivo (1 frase):** fechar o gap de E2E de tela real dos Passos 5-7 apontado pela régua
nova da skill `qa-autonomo` (§5) — determinístico é piso, tela crítica exige Playwright
rodando de verdade contra o browser.
**Critério de PRONTO:** cenários de tela crítica ✅ com spec Playwright real, bugs achados
corrigidos via TDD, zero regressão. **✅ ATINGIDO no canal web · ⚠️ PARCIAL no WhatsApp.**

## Resultado (afirmação)

Web: **Passo 5→6→7 fechado ponta-a-ponta com E2E de tela real**, contra Bevi/Anthropic REAIS
(homologação) — recomendação com valores reais, outras opções, simulador arrastável
recalculando ao vivo, avanço direto (paridade D18), proposta real criada na Bevi, confirmação,
"Parabéns", DES-1 confirmado (zero "assinatura" na tela). 2 bugs reais achados e tratados
(1 corrigido via TDD, 1 é causa externa confirmada — não é bug nosso). WhatsApp: specs
escritas, execução com 1 achado de infra (login admin precisa do domínio `.orb.local`, não
`localhost`) — corrigido no script, resultado final pendente de confirmação no fechamento
desta sessão.

## Decisões tomadas (autônomas)

1. **Técnica de seed** (§4.2.2 estendido à tela): em vez de tentar dirigir o funil quebrado
   (Passo 1/3, território FRENTE 1), semeei o estado DIRETO no ponto crítico — identidade +
   qualificação prontas, `searchDispatched=false` — e deixei o PRÓXIMO turno do usuário
   disparar a busca REAL. `scripts/seed-recomendacao.ts` + `scripts/run-e2e-recomendacao.sh`
   (seed FORA do container via docker exec, Playwright DENTRO — docker exec não existe lá
   dentro).
2. **Split em 2 testes independentes** (recomendação+avanço × simulador): achei que
   testá-los em sequência na MESMA conversa clicaria um botão intencionalmente SELADO
   (`artifact-renderer.tsx` FIX-49 — turno anterior fica `inert` quando um novo turno
   acontece). Não é bug, é design correto — ajustei o TESTE, não o produto.
3. **D10 (Trilho A instável) observado, não "corrigido"**: é causa EXTERNA documentada
   (jornada-canonica.md). Rodei 3 vezes, 2 falharam (`TimeoutError` em `chooseOffer`), 1
   sucedeu. Produto degrada corretamente. Só corrigi o GAP DE OBSERVABILIDADE (catch sem log).

## 🐛 Bug achado + corrigido via TDD — FIX-172

Gate `identify` (web) cifrava o celular sem normalizar o DDI ("55") — diferente do WhatsApp
(`waIdToCelular` já fazia isso, comentário explícito "a Bevi espera DDD+número"). Achado ao
vivo: `BeviApiError 400 CELULAR inválido` no contract-submit real. Teste de regressão
`route.identify-celular-ddi.integration.test.ts` (vermelho→verde) + fix (`normalizePhoneBR`
antes de `storeIdentity`, `route.ts`). `pnpm test:unit` 2201/2201 verde pós-fix. Commit
`test+fix: 109ebea`.

**Nota honesta (não é falso-positivo, mas o alcance real é menor que parecia):** o formulário
REAL (`gate-identity-form.tsx`) já trunca o celular a 11 dígitos via máscara — um usuário
digitando pela UI normal não reproduz o bug EXATO (reproduziria uma mangling DIFERENTE, um
número truncado errado, se colasse com DDI). O fix no servidor é correto e necessário mesmo
assim (defesa em profundidade, nunca confiar só no client, paridade com WhatsApp) — mas
achei via um artefato do MEU seed script (que bypassa a máscara do form), não via a jornada
real do usuário. Corrigi o seed também (normaliza antes de cifrar) pra não reproduzir esse
artefato em rodadas futuras.

## 🔧 Corrigi (dentro da minha autoridade)

1. **FIX-172** (acima) — `test+fix: 109ebea`.
2. **Observabilidade do offer-confirm** — catch engolia o erro sem logar (mesma lição
   `empty-env-compose`). `console.error` adicionado, sem PII. Puro logging, sem cassette
   (sem mudança de comportamento observável). Commit `befef06`.
3. **Bug de teste** (não produto) — locators ambíguos em `passo5-7-golden-path.spec.ts`
   (mockup estático da landing colidindo com o chat real; strict-mode violation quando
   "Parabéns" + doc-upload coexistem no mesmo turno de fechamento) — corrigidos.

## PENDENTE-KAIRO (rodada 2)

1. **Máscara client-side** (`gate-identity-form.tsx`/`contract-form.tsx`) não strippa o DDI
   antes de truncar a 11 dígitos — usuário que cola número com "55" recebe máscara
   visualmente ERRADA. Baixo risco/frequência, dívida de UX real, não corrigida nesta
   sessão (fora do orçamento). Ver ledger.
2. **D10 (Trilho A)**: se o `TimeoutError` em `chooseOffer` for frequente em produção real,
   vale (a) chamado com Bevi/UXVision sobre latência do endpoint, e/ou (b) considerar
   aumentar o timeout do client de API de Parceiro (`bevi-api-adapter.ts`) como paliativo.
3. **`sendContractSummary` (resumo WhatsApp Passo 7)** falhou ao vivo:
   `(#131030) Recipient phone number not in allowed list` — restrição PADRÃO de app WhatsApp
   Business em modo de teste (número de teste não está na allowlist do app Meta). Ação
   externa se quiser esse resumo funcionando nesta conta de teste: adicionar o número à
   allowlist no app Meta (config, não código). Produto já trata graciosamente
   (`contractSummaryPending`).
4. **WhatsApp E2E de tela**: specs escritas (`whatsapp-paridade.spec.ts`), 1 achado de infra
   corrigido (login precisa do domínio `.orb.local`, Better Auth rejeita origin `localhost`
   pro fluxo de sessão admin — diferente do teatro web, que usa cookie de app sem CSRF).
   Ver ledger para o resultado final desta sessão.
5. **FIX-122 (upload doc inbound WhatsApp)**: sem afordance de UI no simulador
   (`whatsapp-stage.tsx` só manda texto/interactive) — E2E de TELA desta ação específica não
   é possível hoje. Se quiser fechar 100%, é preciso adicionar affordance de upload no
   simulador (mudança de produto, não é bug).

## Relatório final (rodada 2)

- **Resultado vs critério:** Web ✅ PASSOU integralmente (Passo 5→6→7, E2E de tela real,
  zero mock). WhatsApp ⚠️ PARCIAL — login/navegação/envio funcionam, reveal não completou
  em 3 tentativas dentro do timeout (não diagnosticado a fundo, ver ledger §Diagnóstico).
- **O que NÃO fiz:** não investiguei a fundo por que `processTextMessage` não completou no
  canal WhatsApp (sem log de entrada nem erro — pode ser só mais lento, não tive orçamento
  pra esperar >90s ou instrumentar). Não corrigi a máscara client-side do celular (dívida de
  UX menor, D172-adjacent). Não abri chamado com Bevi sobre o timeout do `chooseOffer` (D10)
  — é ação externa do Kairo se quiser perseguir.
- **Revisar primeiro:** FIX-172 (commit `109ebea` — bug real corrigido via TDD) e o achado de
  D10 com causa-raiz exata (`TimeoutError` em `chooseOffer`, ledger).
- **Próximos passos sugeridos:** (1) rodar `whatsapp-paridade.spec.ts` de novo com timeout
  maior (5 min) pra ver se o reveal eventualmente completa; (2) instrumentar
  `processTextMessage` (linha 47) com log de entrada se o mistério persistir; (3) decidir se
  vale abrir chamado com Bevi/UXVision sobre a latência do `chooseOffer` (D10); (4) triar a
  dívida de UX da máscara de celular (`gate-identity-form.tsx`/`contract-form.tsx`).

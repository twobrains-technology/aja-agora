# LEDGER — QA Autônomo · FRENTE 2 (Recomendação + Simulador + Fechamento, Passos 5-7)

- **Branch de trabalho:** `qa/recomendacao-fechamento` (fork da develop @ `4c8a81c5`)
- **Onda validada:** `divergencias-jornada` (base da onda `df950c36` → `4c8a81c5`)
- **Fonte da verdade:** `docs/jornada/jornada-canonica.md` (Passos 5-7 + Mapa de divergências)
- **Área (FRENTE 2):** Recomendação/reveal + Simulador de contemplação + Fechamento, web↔WhatsApp
- **Faixa de numeração FIX:** FIX-150 a FIX-169
- **Stack:** `aja-app-recomendacao-fechamento` @ http://aja-recomendacao-fechamento.orb.local (localhost:3010) · pg 5434
- **Testes rodam:** DENTRO do container (`docker exec aja-app-recomendacao-fechamento`) — host sem node_modules (pnpm-only Superset)
- **Iniciado:** 2026-07-01 02:33 · **Rodada 2 (E2E de tela real):** 2026-07-01 08:00-09:00 (esta sessão)

## 🟢 RODADA 2 — E2E de TELA real (regra nova qa-autonomo §5, 2026-07-01)

> Determinístico (rodada 1, abaixo) é PISO. Fluxo crítico de tela EXIGE spec Playwright
> rodando de verdade contra o browser — cassette/unit provam a lógica, não a TELA. Esta
> rodada fecha o gap: os cenários #5-11 abaixo, antes "✅ verde (determinístico)", foram
> reconfirmados com Playwright real, contra a Bevi/Anthropic REAIS (homologação).

### Técnica de seed (funil upstream Passo 1/3 bloqueado — território FRENTE 1)
`scripts/seed-recomendacao.ts` semeia identidade+qualificação já completas
(`searchDispatched=false`) — o PRÓXIMO turno do usuário dispara busca REAL na Bevi. Ver
§4.2.2 "provisione o estado", estendido à TELA. Rodada 2: primeiro run usou o celular
E.164-like da conta de teste (`5562...`) SEM normalizar — achou FIX-172 (abaixo). Seed
corrigido normaliza via `normalizePhoneBR` antes de cifrar.

### Cenários de tela — RESULTADO

| # | Cenário | Passo | Nível | Status | Evidência |
|---|---|---|---|---|---|
| 5 | Card "Plano recomendado" + "Outras opções" (carrossel, valores REAIS) | P5 | **E2E browser real** | ✅ PASS | `passo5-7-golden-path.spec.ts` cenário 1 — busca real Bevi (ITAÚ/BB/RODOBENS), screenshot `frente2-01-recomendacao.png` |
| 6 | Resumo por oferta (carta·parcela·prazo·adm·contemplados) | P5 | **E2E browser real** | ✅ PASS | mesmo cenário — valores BRL reais renderizados no DOM |
| 7 | Simulador de contemplação (arraste real, recalcula ao vivo) | P5 | **E2E browser real** | ✅ PASS | cenário 2 — `role=slider` + `ArrowLeft`×5, assertion de VALOR (texto "lance pra contemplar no mês N" muda), screenshot `frente2-02-simulador-dial.png` |
| 8 | Card de decisão (3 botões) | P5 | E2E indireto | ✅ PASS | não precisou — "Tenho interesse" direto na RecommendationCard já avança (ver #103 abaixo); decisão testada por AUSÊNCIA (nunca aparece no caminho direto) |
| 9 | Ressalva "estimativa" (CDC art. 30/37) | P5 | **E2E browser real** | ✅ PASS | `dial-disclaimer` testid, texto "Estimativa... não é garantida" confirmado no DOM |
| 103 | "Tenho interesse" → avanço DIRETO (paridade D18/FIX-38, web) | P5→P6 | **E2E browser real** | ✅ PASS | clique no CTA da RecommendationCard → `present_contract_form` direto, **zero** `decision-contratar` no meio |
| 10 | Confirma oferta escolhida (contract-submit → real_offer → offer-confirm) | P6 | **E2E browser real** | ✅ PASS (intermitente, ver achado FIX-172/D10 abaixo) | proposta REAL criada na Bevi (Trilho A), `offer-confirm` gerou `signature_handoff`+`document_upload` |
| 11 | "Parabéns" + resumo WhatsApp + DES-1 (nunca "assinatura") | P7 | **E2E browser real** | ✅ PASS | texto "Parabéns! Agora você está oficialmente mais perto..." renderizado; **zero** ocorrência de /assinatura\|assinar/i na tela inteira; `signature-link` = "Ver minha proposta" |

### 🐛 Bug achado + corrigido via TDD — FIX-172 (celular sem normalizar DDI no gate identify)

- **Sintoma:** `contract-submit` falhou ao vivo contra a Bevi real: `BeviApiError 400 {field:'CELULAR', message:'CELULAR inválido.'}`.
- **Causa-raiz:** o gate `identify` (web, `route.ts`) cifra o celular só tirando não-dígitos
  (`celularDigits = celular.replace(/\D/g,"")`) — NUNCA remove o DDI "55". O canal WhatsApp
  já resolvia isso corretamente (`waIdToCelular`, `identify-capture.ts:48`, comentário
  explícito "a Bevi espera DDD+número"). Quebra de paridade web×WhatsApp.
- **Fix:** `normalizePhoneBR` (mesma função já usada em `saveContactWhatsapp`/`leads.phone`)
  antes de `storeIdentity`. TDD: 2 testes de regressão em
  `route.identify-celular-ddi.integration.test.ts` (com DDI → normaliza; sem DDI → regressão
  preservada) — vermelho→verde confirmado. `pnpm test:unit` **2201/2201 verde** pós-fix
  (zero regressão). Commit `test+fix: 109ebea`.
- **Nota honesta:** o formulário REAL (`gate-identity-form.tsx`) já trunca o input a 11
  dígitos via máscara (`.slice(0,11)`) — um usuário digitando pela UI não reproduz o bug
  EXATO (ele reproduziria uma mangling diferente, um número TRUNCADO errado se colar com
  DDI). O fix no servidor é defesa-em-profundidade correta e necessária de qualquer forma
  (nunca confiar só no client), e alinha web↔WhatsApp. **Observação separada, não corrigida
  nesta rodada** (fora do tempo desta sessão): a máscara client-side (`maskPhone` em
  `gate-identity-form.tsx` E `contract-form.tsx`) deveria também stripar o DDI antes de
  truncar — hoje um usuário que cola o número com "55" recebe uma máscara visualmente
  ERRADA (dígitos certos perdidos). Baixo risco/frequência, mas é dívida de UX real —
  **PENDENTE-KAIRO** (não é P0, é polish).

### 🔍 D10 (Trilho A instável) — CONFIRMADO ao vivo, causa-raiz exata capturada

- **3 tentativas em rodadas diferentes** (mesmo código, sem mudança): 2 falharam com erro
  genérico gracioso ("Tive um problema ao gerar sua proposta. Pode tentar confirmar de
  novo?"), 1 **sucedeu** (proposta + signature_handoff + document_upload gerados
  normalmente, "Parabéns" renderizado, DES-1 confirmado).
- **Causa-raiz EXATA** (capturada pelo fix de observabilidade abaixo):
  ```
  [offer-confirm] confirmOffer falhou (conv=...) Error [TimeoutError]: The operation was
  aborted due to timeout
    at BeviApiAdapter.callService (bevi-api-adapter.ts:90) → chooseOffer (bevi-api-adapter.ts:178)
  ```
  O endpoint `chooseOffer` da API de Parceiro (Trilho A) **estoura o timeout do fetch**
  (`AbortSignal.timeout`) de forma intermitente — API externa lenta/instável, não é bug de
  código nosso. Bate 1:1 com D10 (jornada-canonica.md): "Trilho A trava ao vivo" — a
  manifestação exata aqui é timeout em `chooseOffer`, não o 400 productId/AGX documentado
  anteriormente (D10 tem mais de um sintoma externo, ambos na mesma API instável).
- **Produto degrada CORRETAMENTE**: mensagem amigável, sem crash, sem travar a tela, permite
  retry (usuário clica "Confirmar e contratar" de novo — funciona na tentativa seguinte,
  confirmado ao vivo nesta mesma rodada).
- **Fix de observabilidade aplicado** (este QA): o catch de `offer-confirm` estava
  **engolindo o erro sem logar** (mesma lição `empty-env-compose`: tool errors sempre
  logados) — adicionado `console.error` sem PII. Sem isso, o erro acima seria invisível em
  produção — CloudWatch vazio, diagnóstico impossível diante de reclamação de usuário.
  Logging puro, sem mudança de comportamento observável (sem cassette).
- **PENDENTE-KAIRO** (ação externa, não é código): se o timeout do `chooseOffer` for
  frequente em produção real, vale abrir chamado com Bevi/UXVision sobre a latência do
  endpoint, e/ou considerar aumentar `TIMEOUT_MS`/`SIM_TIMEOUT_MS` em
  `self-contract-client.ts` como paliativo (não investiguei se `chooseOffer` usa o MESMO
  client/timeout — está em `bevi-api-adapter.ts`, API de Parceiro, timeout separado do
  self-contract).
- **Observação adicional (não é bug):** `sendContractSummary` (resumo por WhatsApp, Passo 7)
  falhou com `(#131030) Recipient phone number not in allowed list` — restrição PADRÃO do
  WhatsApp Business API em modo de teste (a conta de teste não está na allowlist de
  destinatários do app Meta). Tratado corretamente pelo código (`contractSummaryPending`,
  nunca quebra o fechamento). **PENDENTE-KAIRO** se quiser resumo por WhatsApp funcionando
  nesta conta de teste: adicionar o número à allowlist do app Meta (ação de config
  externa/Meta, não código).

## Meus fixes da RODADA 1 (reteste — cassette + unit já escritos)

| # | Cenário (fluxo) | Origem | Tipo | Status | Bug card | Fix | Último resultado |
|---|-----------------|--------|------|--------|----------|-----|------------------|
| 1 | FIX-116/D11 · WhatsApp fechamento apresenta PROPOSTA, não promete "assinatura" (paridade DES-1) | e63511f5 | struct+cassette | ✅ fechado | — | FIX-116 (done) | C1+C2 verde + code-review + **E2E web confirmou DES-1 ao vivo (rodada 2)** |
| 2 | FIX-117/D18 · WhatsApp "Tenho interesse" pós-reveal = avanço direto ao contract (sem card extra, paridade FIX-38) | 50eb9af7 | integ+cassette | ✅ fechado | — | FIX-117 (done) | C1+C2 verde + **E2E web confirmou avanço direto ao vivo (rodada 2, cenário 103)** |
| 3 | FIX-119/D22 · WhatsApp "Ver outras opções" (decision_outras) determinístico via buildOtherOptions | f82a4014 | integ+cassette | ✅ fechado | — | FIX-119 (done) | C1+C2 verde + code-review (WhatsApp E2E de tela: ver §pendências abaixo) |
| 4 | FIX-122/D13 · Upload documento inbound WhatsApp (foto dispara uploadContractDocument, nunca drop silencioso) | a3df11ce | integ+cassette | ✅ fechado | — | FIX-122 (done) | C1+C2 verde + code-review — **sem afordance de UI no simulador pra E2E de tela** (ver §pendências) |

## ⚠️ Pendências desta rodada (E2E de tela WhatsApp)

| Item | Status | Motivo |
|---|---|---|
| FIX-116/FIX-117/FIX-119 (WhatsApp, tela real via `/admin/simulator/whatsapp`) | ⚠️ TELA-NÃO-VALIDADA | 3 tentativas ao vivo. **Login + navegação + seleção da conversa + envio da mensagem confirmados funcionando** (achei e corrigi 2 bugs de INFRA do teste: regex de `waitForURL` casava com a própria `/admin/login`; domínio precisa ser `.orb.local`, não `localhost`, pro login Better Auth aceitar o Origin). Mas o **reveal (resposta do agente) não chegou dentro do timeout (90s) em NENHUMA das 3 tentativas** — zero log de `[analyzer]`/`[whatsapp-processor]` pro `waId` semeado, sugerindo que `processTextMessage` não concluiu (pode ser só mais lento que o canal web, ou um problema específico do canal com estado semeado direto — não diagnostiquei a causa-raiz no orçamento desta sessão). Struct+cassette seguem cobrindo a lógica (determinístico ✅). **NÃO virou `✅` — fica honestamente `⚠️ TELA-NÃO-VALIDADA`.** |
| FIX-122 (upload doc inbound WhatsApp) | ⚠️ SEM AFORDANCE DE UI | `whatsapp-stage.tsx` só manda texto/interactive — sem input de arquivo simulando o cliente. Não é E2E de TELA possível hoje (webhook direto seria API-level, não tela). Reportar como gap de ferramenta pro Kairo se quiser fechar 100%: adicionar affordance de upload no simulador. |

### Diagnóstico adicional pra quem retomar
- Conversas testadas (já limpas do DB): `0d198c2f...`, `96962144...`, `b5750c47...` (canal
  whatsapp, waId `SIM-*`).
- Em NENHUMA das 3 rodadas apareceu `[analyzer]` nem `[whatsapp-processor]` nem
  `[whatsapp-processor] Error` no log do servidor pro `waId` semeado — sugere que
  `processTextMessage` não foi disparado/não chegou no ponto de log, ou está MUITO mais
  lento que os ~40s típicos do canal web (não tive tempo de esperar além de 90s). Próximo
  passo sugerido: rodar com timeout bem maior (5 min) e observar se eventualmente completa,
  ou instrumentar `processTextMessage` com um log de entrada (linha 47) pra confirmar se a
  função é sequer chamada.

## Tensões — NÃO testar como bug (decisão de stakeholder)

| Tensão | Descrição | Estado |
|---|---|---|
| T2 (D9) | Lance embutido amortiza DÍVIDA (jornada) × reduz CRÉDITO (CONTEXT/código). `contemplation-dial.ts:116` só `− ownCashValue` | ⚠️ PENDENTE-Bernardo — NÃO resolver, não conta como falha |

## Legenda status
`pendente` · `🟢 verde` · `🔴 vermelho` · `corrigindo` · `revalidando` · `✅ fechado` · `⚠️ TELA-NÃO-VALIDADA` · `⚠️ bloqueado`

## Log de transições (rodada 2 — esta sessão)

- 08:00 — bootstrap da stack própria (`aja-app-frente-2-recomendacao-fechamento`), backfill de secrets do clone principal, migrations rodadas.
- 08:10-08:30 — reconhecimento do modelo de dados (artifacts, gates determinísticos `nextGate`/`decideShowGate`) — decidido: seed direto no ponto crítico (identidade+qualificação prontas, `searchDispatched=false`) em vez de tentar dirigir o funil quebrado.
- 08:35 — `scripts/seed-recomendacao.ts` + `scripts/run-e2e-recomendacao.sh` criados (seed FORA do container, Playwright DENTRO — docker exec não existe dentro do container).
- 08:40-08:50 — primeira spec (recomendação): achou 2 falsos-bugs de locator (mockup estático da landing colidindo com o chat real; botão sealado por FIX-49 mal-entendido como travado) — corrigidos no TESTE, não no produto.
- 08:55 — 2 cenários (`recomendação+outras+avanço direto`, `simulador`) passando 100% contra Bevi/Anthropic reais.
- 09:00 — estendido o cenário 1 até Passo 6 (contract-submit) — achou FIX-172 (celular sem DDI normalizado) via `BeviApiError 400 CELULAR inválido` ao vivo.
- 09:05-09:10 — TDD do FIX-172: teste vermelho → fix (`normalizePhoneBR` no gate identify) → verde. `pnpm test:unit` 2201/2201 verde. Commit `109ebea`.
- 09:15 — seed corrigido (normaliza celular antes de cifrar) — reprodução completa Passo 5→6→7: proposta real criada, `offer-confirm` OK (após 1 tentativa gracienta com erro), "Parabéns" confirmado, DES-1 confirmado (zero "assinatura" na tela).
- 09:16 — achado + corrigido gap de observabilidade: catch de `offer-confirm` engolia erro sem logar — `console.error` adicionado.
- 09:20 — WhatsApp: seed script estendido pra `channel=whatsapp`; spec `whatsapp-paridade.spec.ts` escrita; execução não concluída no orçamento da sessão (ver pendências).

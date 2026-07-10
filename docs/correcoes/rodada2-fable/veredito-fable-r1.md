# VEREDITO — Verificador independente (Fable) · rodada 1 · 2026-07-10

Método: condução determinística própria via `POST /api/chat` (2 runs: base + estendido até o
fecho), leitura direta do código no worktree `integ/agente-vendas-consorcio` e confronto com a
spec do handoff. **Nenhuma nota depende do self-report do implementador.** Logs:
`dossie-e2e/run-fable-base.log` e `dossie-e2e/run-fable-ext.log` (Fluxo A até o fecho WhatsApp;
Fluxo B com "só a parcela" por chip E por texto livre).

## Nota final: **3/10** (mínimo das dimensões) — NÃO é matador pra prod

| D | Dimensão | Nota | Resumo |
|---|---|---|---|
| D1 | Motor/agulha | **6** | Curva nova correta e calibrada por oferta (visto ao vivo); âncora de dinheiro é CÓDIGO MORTO |
| D2 | Cards | **4** | 3 cards novos do handoff: 0 de 3 aparecem na jornada; arredondamento de parcela em 4 cards |
| D3 | Funil/ordem | **3** | 3ª saída do lance quebrada em TODOS os caminhos → Fluxo B morre sem proposta; desire mudo na web |
| D4 | Voz/cadência | **7** | PT impecável, léxico limpo, motivation 1×; bolha idêntica repetida 3× no Fluxo B |
| D5 | Compliance | **5** | Sanitizer ok, disclaimer ok; MAS fecho pediu confirmação de carta +41% sem aviso e o agente vendeu com "boa taxa de contemplação" |
| D6 | Fecho WhatsApp | **8** | Copy do fecho correta ao vivo (oi + especialista), fila de template coberta |

---

## D1 — Motor/agulha (6/10)

**✓ verificado por mim:**
- Curva power K=1.6 calibrada (`src/lib/consorcio/contemplation-dial.ts:119-131`): passa pelo par
  real e tende a 0 → sorteio emerge (`requiredLancePct <= 8` no fim). Mês 1 na região útil:
  com a oferta real ITAÚ (ref=6, 68,09%) → L0 = 80,9% < 90% (não clampa).
- `winningBidPct` POR OFERTA, visto ao vivo: CANOPUS 120k → `historicalWinningBidPct` **79,31**
  (= 95.172/120.000); ITAÚ 150k → **68,09** (= 102.135/150.000). Cartas diferentes → % diferentes ✓.
- AMORTIZA: `remainingBalance = parcela×meses − (ownCash+embutido)` (linhas 149-155) — lance
  INTEIRO abate; `paymentAfterContemplation ≤ parcela` por construção ✓. `paymentAfterLabel` nunca
  mente ("sem alteração" quando não caiu) ✓.
- Guardrail netCredit ≥ valorDoBem em CÓDIGO (`recommendation.ts:84-109,166-171`) com testes ✓
  (não observável ao vivo porque a estratégia de embutido nunca chega ao usuário — ver D2/G1).
- `likelihood` ausente do payload ao vivo ✓; nenhuma saída expõe redução de prazo ✓ (sanitizer
  `isPrazoReductionClaim`, `sanitizer.ts:77-81`).

**✗ GAP (derruba pra 6):**
- **Âncora de dinheiro é código morto.** `anchorMonth()` (contemplation-dial.ts:193) não é chamado
  por NINGUÉM fora dos próprios testes (grep no src inteiro). `monthlySavings` existe só como tipo
  (`personas.ts:56`) — o turn-analyzer NÃO o captura e nenhum handler o persiste. Evidência ao
  vivo (A2 T11-T13): Madalena disse "junto uns 4 mil por mês" → dial veio com
  `initialTargetMonth: 6` (= prazo desejado; `dial-payload.ts:116-121` usa modelo→prazoMeses→6).
  Pela spec (03-regras-calculo "Âncora de dinheiro"), com lance ~R$ 102k e bolso = lance − embutido
  30% (R$ 45k) ≈ R$ 57k, a agulha deveria sugerir ~mês 15 (57k/4k). A narração "juntando R$ 4 mil,
  lá pelo mês X seu dinheiro alcança" nunca acontece. FGTS (imóvel) idem: nunca perguntado, nunca
  entra como fonte.

## D2 — Cards (4/10)

**✓:** `embedded-bid.tsx` diz "o crédito recebido diminui" (2×, hardcoded) ✓; `scarcity.tsx` barra
decorativa width fixa 90%, nunca total, placebo determinístico 1-6 por hash do groupId
(`scarcity-payload.ts:14-20` — autorizado) ✓; `two-paths.tsx` sem % de chance, pesos visuais
iguais ✓; `real-offer.tsx` co-branded (SunMark + logo adm), selo "0% de juros", 4 chips de
credibilidade, parcela com centavos (`brl2`) ✓; recommendation-card SEM parcela pós + nota "parcela
cheia" (FIX-231) ✓; dial com disclaimer CDC fixo no rodapé (`data-testid="dial-disclaimer"`), não
tooltip ✓; `taxaContemplacao` com guard de payload/UI (no-taxa-contemplacao.guard.test.ts) ✓;
`contempladosMes`/`availableSlots` do recommendation_card vêm de `monthlyAwardedQuotas` REAL ✓.

**✗ GAPS:**
1. **`embedded_bid` e `scarcity` ÓRFÃOS — CONFIRMO G1/G2 do dossiê.** `present_embedded_bid` /
   `present_scarcity` existem APENAS em `tools/ai-sdk.ts` (definição) e `tool-policy.ts` (allowlist).
   ZERO directives e ZERO menção no system-prompt (grep no src). Ao vivo: 4 conduções completas,
   nenhuma emissão. O gate `lance-embutido` mostra só texto+chips (educação), nunca o card.
2. **`two_paths` inalcançável na prática** (ver D3 — é defeito de funil, mas o card do handoff
   nunca aparece).
3. **Arredondamento de parcela** em `comparison-table.tsx:13`, `contemplation-dial.tsx:21`,
   `two-paths.tsx:13`, `embedded-bid.tsx:11` (`maximumFractionDigits: 0`): parcela R$ 2.182,01
   renderiza "R$ 2.182/mês". Inconsistente com recommendation-card/real-offer (centavos) e cutuca
   a linha vermelha "nunca arredonda valor monetário" (D5/CDC art. 30). Pra carta (valor redondo)
   é inócuo; pra PARCELA é arredondamento real.

## D3 — Funil/ordem (3/10)

**✓ visto ao vivo:** `experience` roda DEPOIS do reveal (A2 T9), explicação só pra novato
(returning → "vamos direto ao ponto", B2 T6) ✓; `timeframe` reintroduzido pós-recomendação como
ponte pro simulador (A2 T10→T13) ✓; lead que diz tudo numa frase não vê card redundante ("Um
usado, uns 90 mil" → slider de valor pulado, B2) ✓; `desire` não bloqueia (marcado na emissão) ✓;
motivation espelhada exatamente 1× ("quando o carro dá trabalho, atrapalha tudo") ✓.

**✗ GAPS (os dois itens centrais do handoff estão quebrados):**
1. **3ª saída do gate `lance` quebrada em TODOS os caminhos** (G3 do dossiê CONFIRMADO e é pior
   que "sequência incompleta"):
   - **UI**: os chips do gate são só `yes/maybe/no` (`web/adapter.ts:115-119`) — não existe botão
     "só a parcela". O union `ChatAction` (`chat/actions.ts:41`) nem aceita `so_parcela`.
   - **Action**: o handler (`route.ts:979-990`) trata `value !== "yes"` como "no" e manda
     `pipeGatePrompt("lance-embutido")` — quem recusou lance recebe a educação de embutido
     (visto ao vivo, run base B T10).
   - **Texto livre**: mandei a frase LITERAL do exemplo do analyzer ("Não quero comprometer nada
     além da parcela", `turn-analyzer.ts:156`) → resposta foi a educação de lance embutido, e a
     MESMA bolha idêntica repetiu em T8, T9 e T10 do run B2. `two_paths` nunca emitiu.
   - O directive `buildLanceSoParcelaDirective` existe (`directives.ts:118`) e a fiação em
     `orchestrator/index.ts:310-315` também — mas nenhum caminho de entrada chega lá.
2. **Fluxo B morre sem proposta (beco-sem-saída).** No run B2 NENHUM `decision_prompt`/
   `contract_form` foi emitido — o usuário "sem lance" fica preso no loop da educação de embutido.
   Cheguei ao fecho só porque o script atirou `contract-submit` cru (que o server ACEITOU sem
   `contract_form` nunca ter sido apresentado — falta validação de estado do funil, achado extra).
3. **Pergunta do `desire` engolida na web.** `gatePartData("desire") = null`
   (`web/adapter.ts:54-57`) e o emissor só manda a pergunta `if (data)` (`web/adapter.ts:246-258`)
   → `gateQuestion("desire")` ("Qual carro você tem em mente?") NUNCA sai; e o directive do nome
   (`buildNameCapturedDirective`, directives.ts:38) PROÍBE o agente de perguntar ("NÃO faca
   pergunta... PARE após a saudação"). Ao vivo (3 runs): resposta ao nome = só "Prazer, Madalena!"
   — turno morto; a jornada só andou porque o "usuário" do script voluntariou o desejo. A pergunta
   de motivação também nunca é feita. (O comentário do adapter diz "o texto sai no directive" —
   não sai.) O comentário do directive ainda fala "gate de experience em seguida" — stale.
4. **`decision_prompt` prematuro + turno morto.** A2 T8: "Gostei, faz bastante sentido" (elogio,
   não decisão) disparou o card de decisão ANTES de experience/timeframe/lance; em T14 ("quero
   seguir com esse plano") o agente anunciou "Então deixa eu confirmar com você:" e NADA apareceu
   (guard `decisionDispatched` engoliu a re-emissão) — promessa visível sem entrega, mesma família
   do FIX-206/207.

## D4 — Voz/cadência (7/10)

**✓:** Português 100% correto em toda a copy observada (acentos/cedilha/til, zero ASCII-fication);
léxico banido ausente nos 4 runs ("saco/furar a fila/carro-problema/na sua cabeça": zero, regra em
`system-prompt.ts:139-148`); zero emoji (dentro do teto da rubrica); balões em geral bem agrupados
(1 ideia, reação+transição juntas); motivation espelhada 1× e não repetida.

**✗:** (a) bolha IDÊNTICA repetida 3 turnos seguidos no B2 (pior violação de cadência possível);
(b) "Boa! ... :" seguido de "Boa, esse plano..." (dois balões consecutivos abrindo igual, run base
T14); (c) frase quebrada no fecho A2 T18: "Assim que você mandar o oi por lá, **já entra em
contato com você**" (sem sujeito — quem entra?); (d) educação de embutido usa exemplo genérico
"numa carta de R$ 100 mil" quando a carta do cliente na tela é 92.902/150.000 — consultor de
verdade usaria o número do cliente; (e) higiene de prompt: contradição interna — `system-prompt.ts:21`
"NUNCA use emoji. Nenhum, em hipótese alguma" × `:126`/`:148` "Emoji com PARCIMÔNIA... não é
proibição total" × `:1157` "1 a cada 2-3 mensagens". Três regras conflitantes no mesmo arquivo.

## D5 — Compliance (5/10)

**✓:** nunca "reservado/cota garantida" (sanitizer `isPrematureReservationClaim` + 4 runs limpos);
nunca redução de prazo (sanitizer + runs); disclaimer CDC fixo no rodapé do dial; nenhuma promessa
de prazo ("quando você **pode** ser contemplada", dial diz "não é garantida"); valores exatos no
texto do agente e nos payloads.

**✗ violações reais (derrubam a nota):**
1. **Fecho pediu confirmação de carta 41% acima da ancorada, sem aviso.** A2: pedido 120k →
   recomendada ITAÚ **150.000** (parcela 3.549,75) → no `contract-submit` a `real_offer` veio
   **211.258** (parcela **5.136,66**, grupo 20486, avgBid 134.761,48) com a fala "Essa é a sua
   carta real — confere e confirma pra eu seguir". Sem `rawCreditValue` no payload → o aviso de
   ajuste (FIX-197, `real-offer.tsx:87-101`) NÃO renderiza. Oferta vinculante (CDC art. 30) com
   salto silencioso de faixa = a falha mais perigosa do fecho. (No B2 o mesmo fluxo manteve 92.902
   ≈ 90k pedidos — o defeito é intermitente/dependente do sweep, o que o torna pior.)
2. **Agente vendeu com "taxa de contemplação".** B2 T5, texto do agente: "A ITAÚ se destaca pela
   **boa taxa de contemplação** e uma taxa de administração de 13,46% — uma das mais baixas da
   faixa". `taxaContemplacao` é campo PROIBIDO (semântica não documentada, spec 05) — o guard
   cobre payload/UI, mas o texto do LLM vaza o conceito como argumento de venda; "uma das mais
   baixas da faixa" é claim comparativo sem fonte exibida.
3. Arredondamento de parcela nos cards (ver D2.3) — mesma linha vermelha em menor grau.

## D6 — Fecho WhatsApp (8/10)

**✓ visto ao vivo (A2 T17 e B2 T12, idênticos):** pede o "oi" com a função técnica correta
("acabei de te mandar uma mensagenzinha no seu WhatsApp... Me responde por lá com um 'oi'? É só
pra você já salvar o nosso contato") ✓; avisa a especialista ("em alguns minutos, a nossa
especialista em cadastros te chama pra pedir seus dados e os documentos") ✓; nunca "reservado" ✓.
**✓ código:** `fecho-pedir-oi.ts` — template HSM por `usageKey` (janela fechada) com fallback de
texto livre na janela aberta e queda segura na fila `whatsapp_outbound_queue` sem template
aprovado; mesa acionada na hora via `dispatchAutoTransbordo`; tudo best-effort (nunca quebra o
fecho) ✓ — trata o "cliente não responde o oi".
**Ressalvas (-2):** template `fecho_pedir_oi` precisa existir/aprovar no admin antes de prod
(sem ele tudo cai na fila); frase final com gramática quebrada (D4.c); e o fecho é alcançável
hoje SÓ no Fluxo A (o B trava antes — D3.2).

---

## Confronto com o dossiê preliminar (r1 do implementador)

| Gap do dossiê | Veredito |
|---|---|
| G1 `present_embedded_bid` órfão | **CONFIRMADO** — só definição+allowlist; zero directive/prompt; nunca emitiu em 4 runs |
| G2 `present_scarcity` órfão | **CONFIRMADO** — idem |
| G3 `two_paths` não visto ("provável sequência") | **CONFIRMADO como GAP REAL e mais grave**: quebrado nos 3 caminhos (sem chip na UI; action cai na educação de embutido; texto livre idem com bolha 3× repetida). Fluxo B beco-sem-saída |
| G4 `real_offer` "não alcançado" | **REFUTADO** — alcancei o fecho: copy D6 correta, MAS defeito novo grave (carta 211k sem aviso de ajuste) |

## Gaps priorizados (acionáveis)

| # | P | Achado | Onde | Esperado × Atual |
|---|---|---|---|---|
| 1 | P0 | 3ª saída "só a parcela" quebrada em todos os caminhos; `two_paths` nunca emite; Fluxo B morre sem decision/proposta | `web/adapter.ts:115-119` (falta chip), `chat/actions.ts:41` (union sem so_parcela), `route.ts:979-990` (else→lance-embutido), caminho texto (analyzer/reengage re-emite educação) | Chip "Só a parcela" + rota direta pro `buildLanceSoParcelaDirective` (que já existe) × educação de embutido 3× idêntica e funil preso |
| 2 | P0 | Fecho pode confirmar carta MUITO acima da ancorada, sem aviso | fechamento (`bevi-self-contract-adapter`) + `real_offer` sem `rawCreditValue` | Clamp/guardrail de faixa no fechamento OU aviso FIX-197 obrigatório × 150k→211.258 silencioso com "confere e confirma" |
| 3 | P0 | `embedded_bid` e `scarcity` órfãos (cards do handoff nunca aparecem) | falta directive no gate `lance-embutido` (embedded_bid) e pós-estratégia (scarcity); `directives.ts` só tem two_paths | Card no gate + card de escassez antes da proposta × só texto+chips |
| 4 | P1 | Âncora de dinheiro morta: `anchorMonth` nunca chamado, `monthlySavings` nunca capturado | `turn-analyzer.ts` (sem slot), `dial-payload.ts:116-121` (ancora no prazo desejado) | "juntando 4 mil/mês → ~mês 15" × dial em mês 6 (desejo), narração inexistente; FGTS idem |
| 5 | P1 | Pergunta do `desire` engolida na web (turno morto pós-nome) | `web/adapter.ts:54-57,246-258` + `directives.ts:38` (proíbe perguntar; comentário stale "experience") | "Qual carro você tem em mente?" no texto × só "Prazer, Madalena!"; motivação nunca perguntada |
| 6 | P1 | `decision_prompt` prematuro em elogio + turno morto no pedido real ("deixa eu confirmar com você:" sem card) | roteamento ready_to_proceed pós-reveal + guard `decisionDispatched` | decisão só após qualificação; re-pedido re-apresenta o card × card cedo demais e depois engolido |
| 7 | P1 | Agente vende com "boa taxa de contemplação" (campo proibido) e claim comparativo | texto do LLM no reveal (guard cobre só payload/UI) | proibir o termo no sanitizer/prompt (fonte permitida: contemplados/mês) × argumento de venda sem base |
| 8 | P2 | Parcela arredondada (sem centavos) em comparison-table/dial/two-paths/embedded-bid | `maximumFractionDigits: 0` nos 4 componentes | R$ 2.182,01 × "R$ 2.182" (recommendation/real-offer já fazem certo) |
| 9 | P2 | Server aceita `contract-submit` sem `contract_form` ter sido emitido | handler contract-submit (route.ts) | validar estado do funil × fechou proposta em conversa que nunca viu o form |
| 10 | P3 | Higiene: contradição tripla de emoji no prompt; comentário FIX-C4 stale (`contemplation-dial.ts:70-73` diz "só dinheiro abate", código amortiza tudo); educação de embutido com exemplo "R$ 100 mil" genérico | `system-prompt.ts:21/126/1157`, `contemplation-dial.ts:70` | fonte única de regra × 3 regras conflitantes |

## Nota sobre o apêndice "QA Runner" na rubrica
O 0/10 anexado à rubrica era por FALTA DE COBERTURA (browser travou). Esta rodada cobriu 100% do
Fluxo A (até o fecho WhatsApp) e o Fluxo B pelos dois caminhos — a nota 3/10 é por defeitos
reais verificados, não por cobertura.

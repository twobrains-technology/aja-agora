# VEREDITO FINAL — Verificador independente (Fable) · JUNÇÃO r1+r2+r3 na DEVELOP · 2026-07-10

Método: condução adaptativa própria via `POST /api/chat` em `http://aja-develop.orb.local`
(3 conversas ao vivo: **Fluxo A** Madalena completo até o fecho WhatsApp; **Fluxo B** Mario
com desvio realista de what-if + so_parcela até o fechamento; **Run C** moto focado nos
server-cards de clique + aviso de ajuste), leitura do código na develop (`30c94094`,
FIX-246..250 presentes), `turn-trace`/`tool-io` do container `aja-app-develop`, e re-execução
dos testes novos DENTRO do container (unit 86/86 ✓, integração FIX-246/247 6/6 ✓).
**Nenhuma nota depende de self-report.** Par de teste real (Bevi validou CPF×celular; 3
propostas reais criadas: `6a510eab…`, `6a5110c7…`, `6a5111db…`).

## Nota final: **4/10** (mínimo das dimensões) — NÃO é matador pra prod

| D | Dimensão | r1 | r2 | FINAL | Resumo |
|---|---|---|---|---|---|
| D1 | Motor/agulha | 6 | 9 | **8** | Âncora de bolso viva (mês 12 com R$ 4 mil/mês + ressalva); % por oferta ✓; ressalva nova: what-if devolve nominal 161k dizendo que "ajustou pro solicitado" |
| D2 | Cards | 4 | 4 | **6** | Os 3 cards **EXISTEM ao vivo** agora (emissão server-side provada, `toolCount=0`) — mas 2 caminhos seguem descobertos e o two_paths saiu com a oferta ERRADA |
| D3 | Funil/ordem | 3 | 5 | **4** | Fluxo A completo ponta-a-ponta ✓; Fluxo B **morre no fechamento**: âncora stale fecha ITAU 161k contra escolha explícita de RODOBENS 90k, promete corrigir e re-serve a MESMA proposta (loop) |
| D4 | Voz/cadência | 7 | 6 | **6** | Valores monetários íntegros (splitter ✓ 2×); regressões pontuais: educação+chips duplicados, "dá uma olhada aí" com card suprimido, copy de WhatsApp no canal web, "ITAU/TRADICAO" sem acento |
| D5 | Compliance | 5 | 6 | **5** | Aviso de ajuste **VIVO** (rawCreditValue 31.539→36.917,50 renderizável, copy certa); mas o caminho B fecha carta 79% acima do pedido **sem aviso possível** (o pedido em si estava stale) — oferta clara (CDC art. 30) violada nesse trilho |
| D6 | Fecho WhatsApp | 8 | 9 | **9** | Fecho completo ao vivo (pede o "oi" com função técnica, especialista em cadastros, signature_handoff + document_upload, sem "reservado" no fecho) |

**FINAL = MIN = 4/10.**

---

## Status dos 6 gaps rastreados (evidência ao vivo, não self-report)

### 1. two_paths (server-side) → **CORRIGIDO, com ressalva grave de âncora**
- **Provado ao vivo** (Fluxo B, clique "Só a parcela, sem lance"): card `two_paths` emitido
  com `toolCount=0` no turn-trace (`traceId 0dd354f3`) — emissão determinística real, o LLM
  nem tem mais a tool (`tool-policy.ts:161-166`). Copy devolve a decisão ("Não tem certo ou
  errado… Qual dos dois combina mais com você?"), zero % de chance, disclaimer certo.
- **Ressalva (P1)**: o payload veio com **ITAÚ / R$ 2.984,38** — a simulação what-if que o
  usuário tinha REJEITADO ("ficou caro") — e não a RODOBENS 1.218,92 re-escolhida 2 turnos
  antes. Emissão determinística ancorada em `meta.recommendedOffer` stale (ver P0 abaixo).

### 2. embedded_bid (server-side) → **PARCIAL**
- **Provado ao vivo** (Run C, clique "Por enquanto não"): card emitido server-side com payload
  correto (maxEmbutidoPct 10, creditValue 31.539, netCredit 28.385,10, disclaimer "o crédito
  recebido diminui" ✓ rubrica).
- **Faltou (a) da r2 segue aberto**: o caminho **TEXTO** do gate lance ("não tenho o valor…
  junto 4 mil/mês", Fluxo A) despachou `lance-embutido` com a educação mas **sem o card**
  (`artifacts=[]` ao vivo; `orchestrator/index.ts` importa só `buildScarcityCard`/`buildTwoPathsCard`
  — não há emissão de embedded_bid no generator; o `case "gate"` do `web/adapter.ts:297` só
  emite pergunta+chips).
- **Defeito novo (P2)**: no caminho de clique, a educação + chips saíram **DUPLICADOS** no
  mesmo turno (o `pipeDirectiveTurn` já dispara o gate via orchestrator E o route.ts chama
  `pipeGatePrompt` de novo — double-dispatch em `route.ts:1058-1072`).

### 3. scarcity (server-side) → **PARCIAL**
- **Provado ao vivo** (Run C, simulator-offer="Agora não"): card emitido server-side,
  N=3 ∈ [1,6], admin certa (TRADIÇÃO), disclaimer "Número estimado, apenas indicativo" ✓.
  A bolha interna vazada da r2 (N6) não reapareceu.
- **O caminho MAIS comum segue descoberto** (mesmo achado da r2): no Fluxo A, o avanço veio
  por texto e o **LLM chamou `present_decision_prompt` direto** (`traceId 6f99cfb5`,
  `artifactsEmitted=["decision_prompt"]`) — o ramo `nextGateToFire==="decision"` do
  orchestrator (que emite scarcity server-side, `index.ts:380-400`) foi **bypassado**.
  Resultado: **0 scarcity no Fluxo A inteiro**. Enquanto `present_decision_prompt` continuar
  no toolset (reveal/closing), o LLM decide se o gancho de escassez existe — a mesma lei
  violada que o FIX-246 disse ter fechado, viva neste caminho.

### 4. Fio do aviso de carta (FIX-247) → **CORRIGIDO no fio; não cobre a causa nova**
- **Provado ao vivo** (Run C, web): `real_offer` veio com **`rawCreditValue: 31539`** e carta
  36.917,50 (17% de desvio, dentro do clamp de 20%) → a condição de render do aviso
  (`real-offer.tsx:90-93`) dispara; copy nova correta ("Você pediu uma carta de ~X — a carta
  real ficou em Y") — a inversão semântica da r2 (N3) foi corrigida. WhatsApp fiado por código
  (`contract-capture.ts:190`) + teste de integração (6/6 no container).
- **Limite**: o aviso compara a carta com o `requestedCreditValue` do **input** — quando o
  input em si está stale (P0 abaixo: pedido "90 mil", input 161.258), carta==pedido e **nenhum
  aviso é possível**. O fio funciona; a âncora a montante não.

### 5. Splitter de dígito (FIX-248) → **CORRIGIDO** ✅
Provado ao vivo nas DUAS superfícies que quebravam na r2: "guardando **R$ 4.000,00** por mês"
(reação do gate lance) e "Guardando **R$ 4.000,00** por mês, lá pelo mês 12…" (narração da
âncora no turno do dial) — valor íntegro, sem "R$ 4." ‖ "000,00". 42 unit tests do sanitizer
verdes no container.

### 6. Recovery de alucinação (FIX-249) → **PARCIAL**
- **Melhor que a r2**: "quero a ITAÚ" não gerou negação nem "te retorno" — o run não morreu.
  1º turno caiu em `empty-turn-fallback` ("Acho que me perdi por aqui. Pode mandar de novo?",
  `finishReason=empty-turn-fallback`, analyzer timeout 6s + turno de 52s); no 2º turno o agente
  RESOLVEU a ITAÚ de verdade (get/simulate no grupo real, sem groupId inventado).
- **Faltou**: resolveu o grupo **errado** — o usuário nomeou "a de 92 mil" (grupo `…379e`,
  92.902) e o agente pegou o de 100k (`…37cc`); a rota determinística nome→grupo continua
  inexistente (gap registrado no próprio commit `cd716058` como fora de escopo — confirmo que
  é real e é ela que falta pra fechar o N2 na raiz).

---

## Achado NOVO — P0 que segura a nota

### N-A (P0) — Fechamento com âncora stale: fecha o plano ERRADO, promete corrigir e re-serve o mesmo erro (loop)
Sequência real (Fluxo B, 100% reproduzível por texto — no WhatsApp é O caminho, não há clique):
1. Mario pede "uns 90 mil"; reveal recomenda **RODOBENS 90.000 / R$ 1.218,92**.
2. What-if: "quero a ITAÚ" → simulação volta **161.258 / R$ 2.984,38** → o runner
   **re-ancora `meta.recommendedOffer` no artifact do what-if** (`runner.ts:706,736`).
3. Usuário REJEITA ("ficou caro. Deixa a RODOBENS que você recomendou") e reconfirma
   RODOBENS mais 2× (agente: "Isso, RODOBENS mesmo"); `contract_form` exibe **RODOBENS**.
4. `contract-submit` → `valor = meta.recommendedOffer.creditValue` = **161.258**
   (`contract-input.ts:43` — a oferta stale vence o `creditMax` falado); o clamp de 20% da r2
   (correto em si) então EXCLUI a RODOBENS 90k (-44%) e seleciona **ITAU 161.258** →
   "Confirmei com a ITAU… R$ 2.984,38" — **79% acima do pedido, 2,4× a parcela**, para quem
   abriu com "tô sem grana". Sem aviso (carta==input stale → FIX-247 estruturalmente cego).
5. Usuário reclama; agente admite o erro e **promete** "Vou corrigir agora e trazer a carta
   certa, da Rodobens" → re-emite o form (RODOBENS) → novo submit → **a MESMA proposta ITAU
   161k, mesmo `proposalId 6a5110c7…`**. Beco sem saída no passo do dinheiro; proposta real
   errada criada na Bevi.

Causa-raiz única: **what-if re-ancora a recomendação** e o fechamento confia cegamente nela.
É a lei "nunca aja sobre entidade não-ancorada" no ponto mais caro da jornada. O conserto é
pequeno e cirúrgico: (a) só re-ancorar `recommendedOffer` em avanço explícito (decision/
choose_offer), nunca em what-if; ou (b) no fechamento, validar `valor` contra o
`qualifyAnswers.creditMax`/escolha confirmada e re-ancorar pela última confirmação do usuário.

## Demais achados novos

| # | P | Achado | Evidência |
|---|---|---|---|
| N-B | P1 | `two_paths` emitido com a oferta rejeitada (ITAÚ 2.984,38 pós re-escolha de RODOBENS) — consequência visível do N-A | Fluxo B, trace `0dd354f3` |
| N-C | P2 | Educação de embutido + chips do gate **duplicados** no mesmo turno (double-dispatch directive+`pipeGatePrompt`) | Run C, clique lance="no"; `route.ts:1058-1072` |
| N-D | P2 | Copy de canal errada na web: "Me manda seu CPF… **Seu celular eu já pego aqui do WhatsApp**" com o form de celular na tela (`prefilledPhone:null`) | 3 de 3 runs; `gate-questions.ts:99` (copy única pros 2 canais) |
| N-E | P2 | `creditAdjustmentNotice` do `simulate_quota` semanticamente INVERTIDA: diz "ajustada de R$ 161.258 (nominal) **para** R$ 100.000 (solicitado)" mas o payload devolve os números do NOMINAL (161.258/2.984,38); a narração então apresenta o nominal como "o valor correto" — what-if sem clamp mostrando carta 61-79% acima do alvo | Fluxo B, tool-io `simulate_quota` |
| N-F | P2 | Migration `0033_administradoras_logo_url` NÃO aplicada no ambiente develop → `column "logo_url" does not exist` logado em todo reveal (fallback de logo funciona, mas a stack consolidada está com drift schema×código) | logs `[administradora-logo]`; `drizzle.__drizzle_migrations` |
| N-G | P3 | "Confirmei com a **ITAU**/**TRADICAO**" — nome cru da Bevi, sem acento, em copy ao usuário (inviolável PT) | Fluxos B e C |
| N-H | P3 | Turno morto residual: "Boa, então deixa eu confirmar com você." sem card nem pergunta (precisou de 2 cutucadas pro funil andar); e "Dá uma olhada aí e me diz…" narrado com o `decision_prompt` SUPRIMIDO (dup) | Fluxo A T8-T10; Fluxo B trace `772e1828` (`suppressed=["decision_prompt"]`) |
| N-I | P3 | "Pra confirmar sua **reserva**… é tipo uma **pré-reserva**" (copy determinística `directives.ts:214`) — linguagem de reserva pré-contratação, borderline com a linha "nunca 'reservado' antes da contratação" | Fluxos A, B e C |

## Confirmações (consertado / não regrediu)
- Guard de decision prematuro ✓ ("Gostei…" pós-reveal sem card, 1 run); supressão agora
  REGISTRADA no trace (`suppressed=["decision_prompt"]`) — N7 da r2 corrigido ✓.
- "booking" → "é tipo uma pré-reserva" (PT) ✓ (N4 corrigido); presunção "primeira vez" não
  reapareceu (N5); bolha interna de scarcity não vazou (N6) ✓.
- Zero "taxa de contemplação" na fala (3 conversas) ✓; parcelas com centavos ✓ (1.218,92;
  2.984,38; 679,00→1.239,00); zero emoji fora de parcimônia ✓; léxico banido zero ✓.
- Âncora de dinheiro ✓ (dial `initialTargetMonth: 12` pelo bolso com embutido abatido, não o
  prazo desejado 6; narração com ressalva compliance); `historicalWinningBidPct` por oferta ✓
  (71,26 ÂNCORA 120k; 52,6 RODOBENS 90k); `likelihood` ausente ✓.
- Lead que diz tudo numa frase pula o slider ✓; `returning` → "direto ao ponto" ✓;
  experience pós-reveal ✓; timeframe como ponte ✓; desire não-bloqueante com motivação
  espelhada 1× ✓.
- Fecho D6 completo ao vivo ✓; erros da Bevi (timeouts 15s em série hoje) tratados com copy de
  retry sem quebrar o funil ✓; nenhum número fabricado em nenhuma das 3 conversas ✓.

## TL;DR — nota e o que falta pro teto

**4/10.** A rodada 3 entregou o que prometeu no plano mecânico — os 3 cards existem ao vivo
por emissão server-side provada (`toolCount=0`), o fio do aviso funciona com a copy certa, o
splitter matou o valor quebrado e o beco de alucinação virou recuperável — e por isso D2 saiu
de 4→6 com D1/D6 encostados no teto. O que segura a nota agora é **UM P0 novo de âncora**
(what-if re-ancora `recommendedOffer` → fechamento fecha plano/valor errados contra escolha
explícita, sem aviso possível, e re-serve o erro em loop) mais **dois caminhos ainda
descobertos** dos cards (embedded_bid no caminho texto; scarcity quando o LLM chama
`present_decision_prompt` — o caminho mais comum).

Pra chegar em "matador pra prod":
1. **(P0)** Âncora de fechamento: what-if NUNCA re-ancora `recommendedOffer`; `contract-input`
   valida contra a última confirmação explícita do usuário (decision/choose_offer/creditMax).
2. **(P1)** Tirar `present_decision_prompt` do toolset do LLM (mesma receita do FIX-246) e
   rotear todo decision pelo ramo do orchestrator — scarcity passa a ser incondicional; e
   emitir embedded_bid no caminho texto (gate handler do adapter, não só nos cliques).
3. **(P1)** Rota determinística nome-de-administradora→grupo exibido (o gap que o próprio
   FIX-249 registrou) — fecha o N2 na raiz.
4. **(P2)** Dedup da educação de embutido; copy de identidade por canal; acento nos nomes de
   administradora vindos da Bevi; `creditAdjustmentNotice` coerente com o payload; aplicar a
   migration 0033 no ambiente.

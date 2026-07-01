---
data: 2026-06-28
bloco: bloco-jornada-entrada
escopo: FIX-103, FIX-104, FIX-105, FIX-106 — revisão da jornada de ENTRADA conversacional
autor: executor do bloco (decisão autônoma — AskUserQuestion dispensada no notch, segui a recomendada conforme regra do modo autônomo)
spec: docs/specs/2026-06-28-jornada-entrada-simulador-conversacional-design.md
---

# ADR — Decisões de design do bloco-jornada-entrada

As 3 decisões de produto abaixo foram levantadas via `AskUserQuestion` (regra 3
do `_prompt.md`). A pergunta foi **dispensada no notch** (sem resposta em tempo
hábil) → segui a **opção recomendada** de cada uma e registro aqui, como manda a
regra global do modo autônomo. Raciocínio com a skill `brainstorming` (explorar
contexto, 2-3 opções, trade-offs, YAGNI); o executor é o decisor.

O **contrato** que este bloco fixa pros blocos irmãos (web-valor-agulha,
whatsapp-apresentacao) está no topo de `qualify-config.ts` e `system-prompt.ts`:
1. O agente PARA de emitir `present_value_picker` na entrada (valor vira conversa).
2. O gate `timeframe` (prazo) SAI da qualificação.
3. O simulador de contemplação é conduzido em LOOP conversacional pelo agente.

---

## Decisão 1 (FIX-103) — Fallback do score de recomendação sem o prazo

**O que decidir:** a recomendação (`rankGroups`) usava o prazo desejado como 1
dos 4 fatores de score (pesos: parcela 40%, contemplação 25%, taxa 20%,
**prazo 15%**). Removido o gate de prazo, o usuário não declara mais
`desiredTermMonths`. Como tratar o fator?

**Opções consideradas:**
- (a) **Fator prazo neutro** — usa o caminho "sem preferência" que JÁ existe:
  `termMatchScore(term, 0) = 0.5` pra todos os grupos. O fator vira constante →
  não afeta o desempate relativo (todos ganham o mesmo +0.075). Zero mudança de
  pesos; comportamento idêntico ao que já rodava quando o usuário escolhia "sem
  pressa". `desiredTermMonths` segue opcional com `.default(0)`.
- (b) Redistribuir os 15% do prazo entre os outros 3 (parcela ~47%, contemplação
  ~29%, taxa ~24%), renormalizando pra somar 1.

**Escolhida: (a) — fator prazo neutro.** É o caminho já validado em produção
(persona que escolhia "sem pressa" caía exatamente nele), não muda a calibração
dos thresholds de copy do prompt ("encaixa muito bem" ≥ 0.75 etc.), e mantém
`recommendation.ts` intacto (fora do escopo do bloco). Como o fator é constante
pra todos, o ranking relativo é idêntico ao da opção (b) — a única diferença
seria o score ABSOLUTO, e mexer nele exigiria recalibrar todos os thresholds do
prompt sem ganho de qualidade. YAGNI.

**Implementação:** `recommend_groups` mantém `desiredTermMonths` opcional
(`.default(0)`); a description da tool e do campo deixam explícito que o prazo
não é mais coletado na entrada (0 = sem preferência → fator neutro). Nenhuma
mudança em `recommendation.ts`.

---

## Decisão 2 (FIX-106) — O que o agente mostra em cada iteração do simulador

**O que decidir:** quando o usuário pede um mês-alvo no loop conversacional
("e em 6 meses?"), quanto detalhe a resposta traz?

**Opções consideradas:**
- (a) **Pacote completo** — lance necessário (R$ e %), crédito líquido, parcela
  até contemplar e parcela após a contemplação. É exatamente o que a agulha da
  web mostra (`computeContemplationDial`), só que em prosa.
- (b) Resposta enxuta — só lance necessário + parcela após; resto sob demanda.

**Escolhida: (a) — pacote completo.** Coerência web↔conversa (regra de produto:
jornada canônica única): o usuário de WhatsApp vê os MESMOS números que o da
agulha. O simulador "de fato simula" (norte da spec) só se entregar o trade-off
inteiro. A tool `simulate_contemplation` devolve o objeto de
`computeContemplationDial` (reuso obrigatório, regra 6) e o prompt instrui a
narrar os 4 números com naturalidade, 1 ressalva discreta de estimativa
(CDC art. 30/37), sem despejar tudo em jargão.

---

## Decisão 3 (FIX-106) — Como conduzir o LOOP na conversa

**O que decidir:** depois de calcular o 1º mês, o agente reconvida a explorar
outros prazos ou só recalcula sob demanda?

**Opções consideradas:**
- (a) **Oferta docx + reconvite leve** — mantém a oferta do gate
  `simulator-offer` (copy literal do docx: "contemplado em 3, 6 ou 12 meses, que
  tal?"); após calcular o 1º mês, oferece UMA vez ver outro prazo; depois deixa o
  usuário conduzir (recalcula sempre que ele pedir) até ele sinalizar avanço.
- (b) Recálculo sob demanda puro — sem reconvite proativo.

**Escolhida: (a) — oferta docx + reconvite leve.** O card FIX-106 pede "podendo
iterar quantas vezes quiser" e o usuário leigo não descobre sozinho que dá pra
explorar vários prazos — um reconvite (1×) revela a possibilidade sem robotizar.
Depois disso o agente para de empurrar e só reage ("e em 12 meses?" → recalcula).
A WEB mantém a agulha arrastável (`present_contemplation_dial`) — o loop
conversacional é o caminho de canais sem componente arrastável (WhatsApp) e o
fallback de qualquer canal quando o usuário pergunta por texto.

**Mecanismo:** nova tool de CÁLCULO `simulate_contemplation` (paralela a
`compute_scenarios`) em `tools/ai-sdk.ts`, exposta no `builder.ts` (primitivo do
sistema) e registrada em `tool-policy.ts` (`WHAT_IF_AND_DETAIL` → fases
qualify/reveal/closing). O directive do orchestrator (`buildSimulatorDialDirective`)
segue disparando a agulha 1× pós-oferta (web); o loop por texto é dirigido pelo
prompt + a tool nova.

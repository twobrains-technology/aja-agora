---
data: 2026-07-13
titulo: "Timeframe-stuck — parâmetros do escape por default (FIX-305)"
status: aceita
decisor: Kairo (produto) + executor (técnico, com evidência de código)
contexto: rodada 10 do loop-de-goal consórcio, onda 3, bloco bloco-r10-3-timeframe-stuck
---

# ADR — Bloco r10-3 timeframe-stuck (FIX-305)

Decisão de PRODUTO ("nunca trava — default após N tentativas") já veio pronta do Kairo via
`AskUserQuestion` (2026-07-13, registrada no card `fix-305-timeframe-preso-sem-escape.md`). As
3 decisões técnicas que sobravam (`_prompt.md` item 2) foram resolvidas por evidência de código —
sem trade-off genuíno o bastante pra justificar uma nova pergunta — e ficam registradas aqui.

## D1 — N de tentativas = 3

O próprio card `fix-305-...md` já traz o valor **trabalhado no exemplo da correção proposta**:
`gateStuckTurns.timeframe >= 3`. "2-3 tentativas" é a faixa; 3 é o valor mais conservador dentro
dela (dá mais uma chance ao usuário antes de assumir o default) e é o que o card já usa como
exemplo — sigo ele, sem reabrir a decisão.

## D2 — Default de prazo = 12 meses

Confirmado em `qualify-config.ts:389-425` (`TIMEFRAME_OPTIONS`): "12 meses" já é uma opção
CANÔNICA existente do produto (`token: "12"`, `title: "1 ano"`, `desc: "Curto prazo"`) — não é um
número inventado. `objetivoForPrazo(12)` (mesmo arquivo, linha 282-284) resolve pra
`"contemplacao_rapida"` (limiar é `>= 120` pra `"investimento"`), que é o eixo Bevi mais comum e o
mais seguro pra assumir sem sinal do usuário (não empurra a simulação pro extremo "sem pressa,
120 meses" sem nenhuma evidência disso). 12 meses confirmado como o melhor default disponível —
não havia motivo pra sugerir outro.

## D3 — Nome do campo + escopo (`lance`/`lance-value`/`lance-embutido`)

- **Nome do campo:** `meta.gateStuckTurns?: Partial<Record<Gate, number>>`, exatamente como o
  card propôs. Confirmado que reusar `gateAttempts` colidiria: esse campo já tem semântica própria
  (escalada de RE-COBRANÇA por INATIVIDADE/desvio, `gate-reengage.ts` + `whatsapp/adapter.ts`,
  termina em "oferece especialista" — nunca em "assume default e segue"). `gateStuckTurns` é um
  contador NOVO e distinto: turnos consecutivos de USUÁRIO em que o MESMO gate não avançou,
  incrementado no orquestrador (`orchestrator/index.ts`), lido só pelos gates elegíveis a escape.

- **`lance`/`lance-value`/`lance-embutido` — confirmado no código (não assumido):** os três AINDA
  estão em `COLLECTION_GATES` hoje (`qualify-state.ts:32-37`) — a dúvida do card era infundada
  nesse ponto específico. Mas isso NÃO os protege do MESMO risco do `timeframe`:
  `COLLECTION_GATES` só afeta `decideShowGate` (se o CARD volta a aparecer no turno), nunca
  `nextGate()` — a cascata que decide se o funil AVANÇA. Um gate de `COLLECTION_GATES` cujo dado
  nunca é extraído (modelo fraco, texto livre ambíguo) tem o card re-exibido a cada turno, mas
  `nextGate()` continua devolvendo o MESMO gate pra sempre — mesma classe de bug do `timeframe`,
  só que sem o sintoma visível de "IA muda" (`[gate-skip]`). Pior ainda: a escada de re-cobrança
  existente (`gateAttempts`/`reengageQuestionForGate`) só incrementa quando o gate NÃO dispara
  (`!gateFiredThisTurn`) — para um `COLLECTION_GATE` que dispara todo turno, esse contador NUNCA
  incrementa, ou seja, hoje não existe NENHUMA rede de segurança pra esse caso. Decisão: aplicar o
  MESMO mecanismo (`gateStuckTurns` + default) aos 4 gates (`timeframe`, `lance`, `lance-value`,
  `lance-embutido`), não só o `timeframe`.

### Defaults escolhidos por gate (quando `gateStuckTurns[gate] >= 3`)

| Gate | Campo | Default | Por quê |
|---|---|---|---|
| `timeframe` | `prazoMeses` | `12` | D2 acima — opção canônica já existente (`TIMEFRAME_OPTIONS`). |
| `lance` | `hasLance` | `"no"` | Resposta válida e já suportada (não é um estado "hedge" novo); pula `lance-value`, segue pra `lance-embutido` — não corta o funil inteiro de uma vez (ao contrário de assumir `"so_parcela"`, que pularia até o `simulator-offer`: mudança de jornada grande demais pra assumir sem sinal do usuário). |
| `lance-value` | `lanceValue` | `20%` do `creditMax` | Mesmo percentual do cenário **"provável"** já usado em `scenarios.ts:56-63` (`lancePercent: 20`) — não é um número novo, é o ponto médio de mercado já cravado no produto. Fallback fixo (R$ 20 mil) só no caso defensivo (não deveria ocorrer: `creditMax` já é obrigatório bem antes deste gate). |
| `lance-embutido` | `lanceEmbutido` | `false` | Consent-minimization: lance embutido é opt-in explícito (mexe na simulação); sem sinal claro do usuário, o default seguro é NÃO ativar, nunca assumir consentimento. |

Cada assunção de default grava `meta.gateDefaultsAssumed[gate] = true` (novo campo, mesmo padrão
de `gateAttempts`) — só pra rastreabilidade/analytics; não é lido por nenhuma lógica de gate.

### Copy do turno de fallback

Nova função `gateStuckDefaultNotice(gate, patch)` em `gate-questions.ts` — texto determinístico
(fora do LLM, mesmo padrão de `TWO_PATHS_FOLLOWUP_TEXT`/`SPECIALIST_EXIT_OFFER`), emitido ANTES do
resto do turno, avisando o usuário do valor assumido e que pode ajustar depois. Nunca trava, nunca
finge que o dado veio do usuário.

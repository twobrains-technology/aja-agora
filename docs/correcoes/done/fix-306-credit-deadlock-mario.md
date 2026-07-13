---
id: FIX-306
titulo: "Promove creditMentionedAtDesire→creditMax quando o valor vem junto da resposta do desire"
status: done
commit: 4b813d7a
executado_em: 2026-07-13
bloco: bloco-r10-4-credit-deadlock
severidade: alta
projeto: aja-agora
arquivos: [src/lib/agent/orchestrator/analyze.ts]
rodada: 2026-07-13 (loop-de-goal r10, onda 4, bloco r10-4-credit-deadlock — investigação de causa-raiz da Etapa A)
---
## Palavras do operador
> Investigação de causa-raiz (dispatch dedicado, 2026-07-13), confirmada por query real no banco
> (`metadata` da conversa `7b861057-...`, Mario): `creditMax` NUNCA foi preenchido, apesar do
> usuário ter dito "um usado, uns R$ 90 mil" no turno 4 (resposta ao gate `desire`).

## Cenário exato
- **Rota/tela:** chat, gate `desire`, quando o usuário responde o bem E o valor no MESMO balão
  (ex.: mockup Mario: "Um usado, uns R$ 90 mil").
- **Dados usados:** dossiê real `mario-sem-lance-v2/dossie.json` turno 4 + query no banco
  confirmando `qualifyAnswers.creditMax` ausente no estado final da conversa.

## Esperado × Atual
- **Esperado:** valor mencionado junto do desire é reconhecido como resposta válida ao (futuro)
  gate `credit` — não precisa ser perguntado de novo.
- **Atual:** o valor cai só em `qualifyAnswers.creditMentionedAtDesire`, NUNCA em `creditMax`.
  `nextGate()` (`qualify-state.ts:205`) trava em `"credit"` pra sempre — o funil inteiro pós-credit
  fica inalcançável (identify, experience, reco-consent, lance, timeframe, decision — todos código
  morto nesse cenário).

## Root cause (INVESTIGADO — confirmado por query real no DB + leitura de código)
- `analyze.ts:~136`: a promoção de valor pra `creditMax` só acontece quando
  `q.creditMax === undefined && desireAnsweredBeforeThisTurn` — e `desireAnsweredBeforeThisTurn`
  é um SNAPSHOT PRÉ-MUTAÇÃO (`analyze.ts:52`). No turno em que o desire É respondido (com valor
  junto), esse snapshot ainda lê `false` (o `desireAnswered=true` só é setado NESSE MESMO turno,
  `analyze.ts:71-74`) — a condição falha e o valor cai só em `creditMentionedAtDesire`
  (`analyze.ts:168-172`).
- Sem NENHUM código que promova `creditMentionedAtDesire → creditMax` depois (nem confirmação por
  texto, nem timeout) — o valor fica pra sempre "mencionado mas não confirmado".

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| Ajustar a condição de promoção pra também aceitar o caso "desire sendo respondido AGORA com valor junto" — não só "desire já respondido em turno anterior" | `analyze.ts` (região ~104-172) |
| Alternativa/complemento: quando o gate ativo é `credit` E existe `creditMentionedAtDesire` E a resposta do usuário é confirmação (intent neutral/ready_to_proceed, "isso"/"sim"/"pode ser"), promover o valor | `analyze.ts` — coordenar com FIX-307 (mesmo bloco) |

## Regressão exigida
- Teste de integração reproduzindo o cassette real do Mario: desire respondido com bem+valor no
  MESMO balão → `qualifyAnswers.creditMax` fica preenchido, `nextGate()` avança pra `identify`.
- Teste que o caminho ANTIGO (valor mencionado em turno SEPARADO do desire) continua funcionando
  (não regredir o fluxo da Madalena).

---
id: FIX-301
titulo: "Transição determinística 'clarify' quando usuário está confuso (não deixa o LLM inventar menu)"
status: inbox
severidade: media
projeto: aja-agora
arquivos: [src/lib/agent/orchestrator/turn-analyzer.ts, src/lib/chat/types.ts, src/lib/agent/orchestrator/index.ts, src/lib/agent/orchestrator/gate-questions.ts]
rodada: 2026-07-12 (loop-de-goal r10, onda 1, bloco r10-1-topicpicker-clarify — junto do FIX-300)
---
## Palavras do operador
> "na entendi" ... "uai nao sei voce nao me perguntou nada" — o agente abre um menu genérico de
> opções e repete o mesmo menu na 2ª tentativa; depois, ao "em quanto tempo eu recebo o carro?",
> dissertou sobre consórcio genérico em vez de reancorar na decisão pendente. Teste manual com
> Qwen 3.5 Fast, 2026-07-12.

## Cenário exato
- **Rota/tela:** chat web, usuário confuso num gate qualquer (ex.: `decision`).
- **Passos:** responder "não entendi" a uma pergunta do agente; observar a reação.
- **Dados usados:** transcrição real anexada ao estudo (P7).

## Esperado × Atual
- **Esperado:** o agente reancora no gate pendente de forma mais simples (copy nível-2), nunca
  menu genérico nem dissertação fora de escopo.
- **Atual:** não existe caminho determinístico pra "usuário confuso" fora do gate `experience`
  (que já tem `doubts-wait`); em qualquer outro gate, a recuperação é deixada à narração livre do
  LLM — com o vetor do TopicPicker disponível (FIX-300).

## Root cause (INVESTIGADO — confirmado pelo crítico)
- Intent `confused` **NÃO EXISTE** hoje no `turn-analyzer`/type `UserIntent` — só existem
  `expressing_doubt`/`off_topic`. A spec original assumia essa intent; precisa ser criada ou
  mapeada a partir de `expressing_doubt` + existência de gate pendente.
- A transição `clarify` NÃO precisa virar um novo valor no enum `Gate` (evita colidir ainda mais
  com o bloco r10-1-funil-reveal) — pode ser um comportamento do orquestrador: quando intent
  confusa + há um gate pendente, re-emite O MESMO gate com copy simplificada, sem re-entrar na
  máquina de estados.

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| Adicionar/mapear intent `confused` (ou reaproveitar `expressing_doubt` + checar se há `pendingGate`) | `turn-analyzer.ts`, `types.ts` |
| Orquestrador: ao detectar confusão com gate pendente, reemite o MESMO gate/card com copy nível-2 (mais simples), SEM chamar tool de menu genérico | `orchestrator/index.ts`, `gate-questions.ts` (variante simplificada de copy) |
| Não criar estado novo no enum `Gate` — comportamento vive no orquestrador, minimizando colisão com FIX-296/297 | `qualify-state.ts` (sem alteração de tipo, se possível) |

## Regressão exigida
- Teste de integração: usuário responde "não entendi" no gate `decision` → agente reapresenta a
  MESMA pergunta canônica simplificada, sem menu genérico nem card de texto livre.
- Teste de integração: pergunta fora de escopo ("em quanto tempo recebo o carro?") no meio de um
  gate pendente → resposta reancora no gate, não dissertação livre.

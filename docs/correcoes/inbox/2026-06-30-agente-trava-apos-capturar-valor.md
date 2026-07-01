---
slug: agente-trava-apos-capturar-valor
titulo: "Agente morre no meio da jornada após capturar o valor — precisa mandar mensagem pra destravar"
status: inbox
severidade: alta
projeto: aja-agora
rodada: 2026-06-30 — teste em PROD (AWS prod, pós-deploy release)
evidencia:
  - _evidencia/agente-trava-apos-valor-print.png
mexe_em:
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/agent/orchestrator/navigation.ts
  - src/lib/agent/orchestrator/transition.ts
  - src/lib/chat/stream-watchdog.ts
  - src/app/api/chat/route.ts
---

## Palavras do operador
> "o agente ta morrendo no meio da jornada, tendo que enviar uma mensagem pra ele.
> precisamos resolver isso."

## Cenário
- **Ambiente:** PROD (AWS prod).
- **Tela:** chat web, logo após capturar o valor do bem.
- **Transcrição (print):** "bora continuar" → "Boa! Quanto custa o carro que você
  quer?" → usuário "50k" → agente "Beleza, R$ 50.000 então." → **[agente PARA — não
  avança pro próximo gate]** → usuário digita "blz" pra destravar.

## Esperado × Atual
- **Esperado:** depois de "Beleza, R$ 50.000 então.", o sistema avança
  automaticamente pro próximo passo (lance / busca de grupos) sem intervenção.
- **Atual:** o agente **para** ali. Só destrava quando o usuário manda outra
  mensagem. Intermitente ("morrendo no meio da jornada").

## Pista de causa (A CONFIRMAR — não investigado a fundo)
⚠️ **É o mesmo sintoma do FIX-110 (agente-mudo/turno-preso) que ACABOU de subir pra
prod nesta release** — ou o fix é **incompleto**, ou este repro é de um caminho
diferente (aqui o agente RESPONDE "Beleza..." mas não DISPARA o próximo gate; o
FIX-110 tratava stream que morre sem responder). Pode ser o **orchestrator não
avançar o funil** após capturar o valor (não emite `nextGate`), não só stream morto.
Olhar: `orchestrator/navigation.ts`/`transition.ts` (avança o gate após valor
capturado?) + `runner.ts` (dispara o próximo turno de sistema?) + `stream-watchdog.ts`
(o watchdog do FIX-110 cobre "respondeu mas não avançou"?). Confirmar se a release
com FIX-110 já está ativa no pod que serviu esta conversa.

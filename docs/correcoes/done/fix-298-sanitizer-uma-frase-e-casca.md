---
id: FIX-298
titulo: "Invariante '1 frase interrogativa por balão' em código (não só no prompt)"
status: todo
bloco: bloco-r10-1-sanitizer-invariantes
severidade: alta
projeto: aja-agora
arquivos: [src/lib/agent/orchestrator/sanitizer.ts, src/lib/agent/orchestrator/runner.ts]
rodada: 2026-07-12 (loop-de-goal r10, onda 1, bloco r10-1-sanitizer-invariantes — junto do FIX-299, mesma zona de arquivo)
---
## Palavras do operador
> "Quer ajustar o valor do bem ou seguir com essa opção da ITAÚ mesmo? Você já fez consórcio
> antes?" — duas perguntas no mesmo balão, usuário não conseguiu responder as duas. Teste manual
> com Qwen 3.5 Fast, 2026-07-12 (bug já reportado antes, reincidiu com o modelo fraco).

## Cenário exato
- **Rota/tela:** chat web, qualquer ponto pós-reveal onde o LLM narra livremente e o servidor
  também tem um gate pra disparar no mesmo turno.
- **Passos:** reproduzir com `AI_MODEL` apontando pro Qwen (ou qualquer modelo mais fraco que o de
  prod); levar a conversa até o gate `experience` chegando no mesmo turno em que o LLM está
  narrando.
- **Dados usados:** transcrição real anexada ao estudo `docs/design/specs/2026-07-12-jornada-humanizada-estudo-e-correcao-design.md` (P4).

## Esperado × Atual
- **Esperado:** ZERO turnos com 2+ sentenças interrogativas no mesmo balão, em QUALQUER modelo.
  Importante: isso é por FRASE, não por PEDIDO — "Que carro você tem em mente, e quanto custa mais
  ou menos?" (uma frase, dois pedidos, um `?`) é válido e aparece no próprio mockup (Mario, `F2`).
- **Atual:** a regra "nunca mais de uma pergunta por mensagem" existe só como texto no
  system-prompt (`system-prompt.ts:59,930`); com Claude o modelo obedece, com Qwen não. A única
  anti-colisão em código é específica do gate de motivo (`shouldAskMotive`/`decideShowGate`,
  `qualify-state.ts:188-202,252-255`) — não cobre o caso geral.

## Root cause (INVESTIGADO)
- `system-prompt.ts:59` e `:930`: regra-no-prompt, sem enforcement em código pro caso geral.
- Violação da Lei 4 (`~/.claude/reference/arquitetura-agentes-ia.md`): instruction-following
  degrada sob carga/modelo mais fraco; invariante crítico tem que virar código.

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| Generalizar no `EphemeralTextFilter`/`sanitizer.ts`: turno em que o servidor vai emitir gate/card descarta qualquer SENTENÇA interrogativa livre do LLM (fronteiras `. ! ? : \n`, já usadas no filtro) | `sanitizer.ts` |
| Turno SEM gate do servidor: manter só a ÚLTIMA sentença terminada em `?`, descartar as anteriores | `sanitizer.ts` |
| **Cuidado de precisão (crítico da rodada):** o corte é por SENTENÇA (delimitada por `?`), não por "pedido" — não quebrar frases compostas válidas como "que carro... e quanto custa?" | `sanitizer.ts` |
| Consumido em | `runner.ts` (já usa `EphemeralTextFilter`) |

## Regressão exigida
- Cassette com a transcrição real do bug ("Quer ajustar o valor do bem ou seguir com essa opção da
  ITAÚ mesmo? Você já fez consórcio antes?") em `tests/regression/` — prova que só 1 sentença
  interrogativa sobrevive.
- Teste positivo: frase composta válida do mockup ("que carro... e quanto custa?") NÃO é cortada.
- Rodar com `AI_MODEL` no Qwen — zero turnos com 2+ `?` em qualquer roteiro do dossiê.

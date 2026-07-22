---
id: FIX-364
titulo: "Resume ('Voltei') não deve re-emitir gate de qualificação quando a proposta já fechou"
status: todo
severidade: alta
projeto: aja-agora
arquivos:
  - src/lib/agent/qualify-state.ts
  - src/lib/chat/resume.ts
rodada: 2026-07-22 — campanha vendedor-matador-consorcio (goal doc .processo/loop/2026-07-22-1853-vendedor-matador-consorcio.md, ITEM 2)
---

## Palavras do operador
> "qd volto para uma proposta ja finalizada o agente entende que eu estava num passo anterior e parece nem saber que eu fechei um plano. O comportamento do agente aqui nesse caso deve ser, olha se o plano já está tem que ver a etapa que ele tá né nesse caso é que ele ta na mesa lá então se ele ta numa mesa ele deve ele deve notificar assim: 'Olha você está aqui, já recebemos... Que bom que você voltou cara! Já recebendo a sua proposta. Daqui a pouco o atendente fala com você no WhatsApp pedindo seus documentos.' Enfim dá uma explicação pra ele de que o atendimento vai seguir, entendeu? Vai ter uma pessoa que vai falar com ele em seguida. Então você precisa tranquilizar o usuário nesse caso aí e sempre orientar ele a ir para o WhatsApp para ele conversar lá, para ficar mais dinâmico o fluxo. Aí lá o pessoal vai atender."

## Cenário exato
- **Rota/tela:** Chat web do Aja Agora, consórcio Itaú (evidência em
  `docs/correcoes/inbox/_evidencia/2026-07-22-resume-nao-reconhece-etapa-mesa.png`).
- **Passos:** 1) Cliente finaliza a proposta — tela mostra "Parabéns! Agora você está
  oficialmente mais perto da sua conquista!" + card "O próximo passo é com a gente" 2) Cliente
  sai e volta depois 3) Aparece "Você voltou — continue de onde parou" 4) Cliente clica
  "Voltei".
- **Dados usados:** Proposta já confirmada (fechada), aguardando atendimento humano.

## Esperado × Atual
- **Esperado:** Ao reconhecer que a proposta já foi fechada, o agente dá boas-vindas
  reconhecendo esse estado ("Que bom que você voltou! Já recebemos sua proposta — daqui a
  pouco um atendente fala com você no WhatsApp"), reforçando o direcionamento pro WhatsApp.
- **Atual:** O agente responde "Beleza, Kairo! A gente tava vendo os cenários de contemplação
  pra esse consórcio da Itaú. Você decidiu qual caminho quer seguir — com lance ou só sorteio
  mesmo?" — como se a proposta não tivesse sido fechada.

## Root cause (INVESTIGADO — provado no código, corrigido após 1ª hipótese errada de um crítico)
O resume é **server-side**, em `src/lib/chat/resume.ts:65-136` — a linha `:125` **já deriva o
gate do ESTADO** via `nextGate(metaCompleta)` (comentário `:120-123`: "o gate é derivado do
estado, não do histórico"). O bug **não está no client** (`theater-chat.tsx`/`message-list.tsx`
— hipótese inicial descartada por investigação). O root cause real: **`nextGate`
(`src/lib/agent/qualify-state.ts:237`) não faz short-circuit quando a proposta já fechou.**
Existe um flag `contractClosed` em meta (usado em `resume.ts:56` por
`hasMeaningfulProgress`), mas `nextGate` re-emite um gate de qualificação (o card
"com lance ou só sorteio" = `two_paths`/`decision`) ignorando esse fechamento.

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| Checar `contractClosed` (ou equivalente já existente em meta) ANTES de qualquer outro gate; se fechado, retornar gate terminal (nenhuma pergunta de qualificação) | `qualify-state.ts` (`nextGate`, linha 237) |
| Quando o gate terminal for detectado no resume, montar saudação reconhecendo o fechamento + reforçar encaminhamento pro WhatsApp (comportamento É do modelo/prompt — copy não trava em regex, mas o FATO "fechado" é dado determinístico) | `resume.ts` |

## Regressão exigida
**TDD strict** (é invariante de fluxo, não copy): teste que, com `contractClosed: true` em meta,
`nextGate` retorna o gate terminal e NUNCA `two_paths`/`decision`/qualquer gate de qualificação
anterior. Teste de integração do `resume.ts` provando que a saudação nesse caso não repete
pergunta de etapa anterior.

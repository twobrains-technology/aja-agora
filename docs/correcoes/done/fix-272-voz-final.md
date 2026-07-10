---
id: FIX-272
titulo: "'reserva' na PROSA do LLM (directive:115) + costura picotada sem espaço + dup-click embutido vira ar morto"
status: done
bloco: bloco-r8-acabamento
arquivos: [src/lib/agent/orchestrator/directives.ts, src/lib/agent/orchestrator/index.ts, src/app/api/chat/route.ts]
rodada: 2026-07-10 rodada 8 (Fable r7, voz)
---
## Gaps (veredito r7)
- "reserva" segue na PROSA do LLM (3× ao vivo) — a directive `directives.ts:115` ainda induz. Trocar.
- costura picotada noutra emenda ("…outro prazo?Ah, Madalena…" colado sem espaço).
- dup-click do embutido vira ar morto (turno sem conteúdo) — guard.
## Correção
- Ajustar `directives.ts:115` pra não induzir "reserva". Corrigir a emenda sem espaço. Dedup do
  clique de embutido (não gerar turno morto).
## Regressão (TDD)
- directive não induz "reserva". emenda com espaço. dup-click não vira ar morto.

## Implementado (2026-07-10)
- **"reserva" na prosa**: `buildLanceReactionDirective` (directives.ts) dizia "sobre ter reserva pra
  lance" — o próprio directive primava o LLM com o termo proibido. Trocado pra "sobre ter como dar um
  lance pra antecipar a contemplação" (mesma linguagem do gate `lance`, FIX-268) + proibição explícita
  ("NÃO diga 'reserva'/'reservado'... nem presuma reserva que o usuário não declarou"). Teste:
  `directives.test.ts`.
- **Costura colada**: achado era OUTRA emenda, ANTES da já fechada pelo FIX-268 — a resposta do turno
  PRINCIPAL (às vezes termina em pergunta) colava sem espaço no lead-in do 1º directive do bloco de
  decisão (scarcity OU so_parcela). Adicionado `yield { type: "text-boundary" }` no TOPO do bloco
  `nextGateToFire === "decision"` (index.ts), incondicional, cobrindo os dois caminhos de uma vez.
  Teste estrutural: `index.fix-272-costura-boundary.test.ts` (ajustado também o teste pré-existente
  `fix-268-decision-picotado.test.ts`, que buscava o boundary a partir do início do bloco — agora
  busca a partir de `scarcityIdx` pra achar especificamente o SEGUNDO boundary, entre scarcity e
  decision).
- **Dup-click ar morto**: o handler do gate `lance-embutido` (route.ts) reprocessava um clique
  repetido — `nextGate` recomputava "decision" (estado já avançado pelo click #1) e `pipeGatePrompt`
  não sabe renderizar esse gate (retorna null pra card e pergunta) → turno 100% vazio, sem passar pelo
  guard de empty-turn (só roda no turno de texto-livre). Guard no topo do handler: se
  `qualifyAnswers.lanceEmbutido` já está setado, é replay — retorna sem reprocessar. Teste estrutural
  em `lance-embutido-gate.test.ts`.

Suíte completa: 3230/3230 verde no container (2 testes pré-existentes ajustados pra acomodar o corpo
maior do directive e o 2º boundary — nenhuma asserção enfraquecida, só a janela/posição de busca).

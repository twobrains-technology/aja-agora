---
id: FIX-272
titulo: "'reserva' na PROSA do LLM (directive:115) + costura picotada sem espaço + dup-click embutido vira ar morto"
status: todo
bloco: bloco-r8-acabamento
arquivos: [src/lib/agent/orchestrator/directives.ts, src/lib/web/adapter.ts, src/app/api/chat/route.ts]
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

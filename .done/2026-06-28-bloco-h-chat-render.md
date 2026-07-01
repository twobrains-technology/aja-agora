---
titulo: "Bloco H — render/UX do chat (2 bugs visuais)"
data: 2026-06-28
bloco: bloco-h-chat-render
branch: fix/chat-render-ux
onda: 1
tipo: correção (TDD strict)
---

# Bloco H — Render/UX do chat

Dois defeitos de renderização do chat, achados na travessia E2E, independentes entre si.

## TL;DR

- **FIX-101** — modal de resume coberto pelo `chat-theater` (z-index): já estava **resolvido** de
  uma sessão anterior (2026-06-21, commit `bae59378`). Card chegou desatualizado no bloco; apenas
  verificado e arquivado, sem novo código.
- **FIX-102** — eco/duplicação de texto do assistant ("Boa...Boa..."): guarda defensiva
  determinística implementada e testada (TDD strict), commit `test+fix:` novo.
- **Gate verde**: `pnpm test:unit` = 200 arquivos / **2050 testes passando**, incluindo Camada 3
  (eval LLM real) obrigatória por tocar `src/lib/agent/**`.

---

## FIX-101 — Modal de resume coberto pelo chat-theater (z-index)

**Commit:** `bae59378` (2026-06-21, sessão anterior — não desta rodada)

Ao investigar o card, o fix já estava implementado e commitado na própria branch: o
`DialogContent` do `ResumePrompt` já é `z-[110]` (acima do `chat-theater` em `z-[90]`), e
`resume-prompt.test.tsx` já tem a asserção estrutural (extrai o z-index e compara > 90). Rodei o
teste isoladamente — verde. Card movido pra `docs/correcoes/done/` com a nota de que chegou
resolvido, sem gerar commit de código redundante.

## FIX-102 — Eco/duplicação de texto do assistant

**Commit:** `3f3a14b test+fix: colapsa eco de texto duplicado do assistant`

**Causa investigada e cravada** (já no card, não nesta sessão): degeneração NÃO-determinística da
LLM — a bolha do assistant repetia a mesma frase 2x coladas sem separador
(`"Boa, então a gente vai direto ao ponto.Boa, então a gente vai direto ao ponto."`). Não é bug de
append/código: `runner.ts` só concatena os deltas do stream fielmente, e uma varredura no DB
inteiro de homologação achou **1 única ocorrência** — se fosse bug sistemático, seria em toda
conversa.

**Mitigação implementada** (decisão de produto já fechada no card — guarda defensiva
determinística, não as outras 2 opções descartadas): `collapseEchoedSegments()` em
`src/lib/agent/orchestrator/runner.ts`, que colapsa segmentos/parágrafos 100% idênticos
consecutivos. Aplicada em `fullResponse` assim que o streaming termina — cobre os 3 usos
downstream (persistência do `content`, prefixo do próximo gate, `RunAgentResult` retornado ao
orchestrator).

**Trade-off decidido sem novo ADR** (já explícito no card, então não gerou
`docs/correcoes/decisions/2026-06-28-bloco-h.md`): a guarda vive em `runner.ts` (antes de
persistir), não em `groupAdjacentText` (render). Motivo: `runAgentTurn` é o ponto único
consumido tanto pelo canal web quanto pelo WhatsApp (`src/lib/whatsapp/adapter.ts` também
acumula os mesmos `text-delta` events); colapsar no `chat-message.tsx` corrigiria só o render web,
deixando o texto persistido (e o WhatsApp) com o eco.

**TDD strict:** teste primeiro (`runner.assistant-texto-duplicado-eco.test.ts`, 6 casos), visto
falhar (`collapseEchoedSegments is not a function`), implementado, visto passar. Por ser mitigação
100% determinística (não mexe em prompt/persona), cassette de Camada 2 é opcional e não foi
adicionado — nenhuma mudança de comportamento da LLM a proteger.

---

## Nota operacional — ambiente do workspace

O worktree não tinha stack local nem `.env.local` completo (`BETTER_AUTH_SECRET`,
`ANTHROPIC_API_KEY` real e outros vinham do template `.env.example`, não do clone principal).
Rodei `bootstrap-workspace.sh`, completei os secrets faltantes a partir de
`~/code/aja-agora/.env.local`, migrei o Postgres do workspace (`pnpm db:migrate`) e corrigi o
`DATABASE_URL` pra apontar pro DNS `.orb.local` do container (o valor gerado por padrão apontava
pra uma porta de host que este `docker-compose.yml` não publica). Gate final rodou 100% local,
sem mock.

## Gate final

```
pnpm test:unit
Test Files  200 passed (200)
     Tests  2050 passed (2050)
```

Push feito: `git push origin fix/chat-render-ux`.

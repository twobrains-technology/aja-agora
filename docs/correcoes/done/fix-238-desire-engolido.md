---
id: FIX-238
titulo: "Gate desire engolido na web — pergunta 'qual carro / por que agora' nunca sai"
status: done
bloco: bloco-r2-funil-cards
arquivos:
  - src/lib/web/adapter.ts
  - src/lib/web/adapter.fix-238.test.ts
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/system-prompt.fix-233-motivation.test.ts
  - src/lib/agent/agents/builder.ts
  - src/lib/agent/orchestrator/directives.ts
rodada: 2026-07-10 rodada 2 (Fable r1, gap P1 #5)
commit: PENDENTE (preenchido no commit real)
executado_em: "2026-07-10"
---

## Gap (veredito Fable §D3.3, gap #5)
`gatePartData("desire") = null` (não-bloqueante, sem card por design) e os DOIS pontos
que emitem gate no `web/adapter.ts` (`pipeGatePrompt` e o case `"gate"` de
`pipeOrchestratorToWriter`) tinham `if (data) { ...emite pergunta...; emite card }` — a
pergunta ficava PRESA dentro do guard do card. Resultado ao vivo: turno morto após o
nome ("Prazer, Madalena!" e nada mais). A 2ª pergunta (motivação, "por que agora?")
também nunca saía — não existe gate próprio pra ela.

## Correção
1. **`web/adapter.ts`**: pergunta (`gateQuestion`) e card (`gatePartData`) viram
   INDEPENDENTES nos dois pontos de emissão — a pergunta sai sempre que existir,
   o card só quando existir. Gates não-bloqueantes sem card (como `desire`) passam a
   emitir a pergunta normalmente.
2. **2ª pergunta (motivation)**: como não há gate próprio, criei
   `desireFollowUpSection(desiredItem, motivation)` em `system-prompt.ts` — mesmo
   padrão de `motivationMirrorSection` (instrução de sistema que confia no modelo
   conferir o histórico pra não repetir, sem flag de estado nova). Dispara quando
   `desiredItem` já é conhecido e `motivation` ainda não; some assim que `motivation`
   chega. Encadeado em `buildSpecialistDynamicBlocks`/`buildSpecialistPrompt` e no call
   site (`agents/builder.ts`, novo parâmetro `desiredItem`).
3. **Comentário stale em `buildNameCapturedDirective`**: citava "o sistema dispara o
   gate de experience em seguida" — desatualizado desde o FIX-233 (experience foi pra
   pós-reveal; o gate seguinte real é `desire`). Comentário e texto do directive
   corrigidos pra citar o gate certo.

## Regressão (TDD + suíte)
- `src/lib/web/adapter.fix-238.test.ts` (NOVO): `pipeGatePrompt`/`pipeOrchestratorToWriter`
  com gate `desire` (sem card) emitem a pergunta "Qual carro..." — falhava antes (turno
  mudo reproduzido), passa depois; gates COM card (ex. `experience`) seguem emitindo
  pergunta+card, sem regressão.
- `src/lib/agent/system-prompt.fix-233-motivation.test.ts`: 4 testes novos de
  `desireFollowUpSection` (pergunta quando desiredItem sem motivation; instrui a não
  repetir; some com motivation capturada; some sem desiredItem ainda).
- `pnpm test:unit`: 3003/3003 verde. `builder*.test.ts` (excluídos do test:unit,
  precisam de DB) rodados manualmente em container: 20/20 verde.
- E2E: pendente validação por API contra a app rodando (ver resumo final do bloco).

---
id: FIX-118
titulo: "WhatsApp: educação de lance embutido pra no/maybe (paridade FIX-92)"
status: done
commit: 98d8d39d
executado_em: 2026-07-01
bloco: bloco-whatsapp-funil-paridade
arquivos: [src/lib/whatsapp/interactive-handlers.ts]
rodada: 2026-07-01 — auditoria código×jornada (Mapa em docs/jornada/jornada-canonica.md)
---

# FIX-118 (D19) — WhatsApp pula a educação de lance embutido pra quem responde Não/Talvez

**Severidade:** P1 · **Paridade quebrada** (fix aplicado só no canal web).

## Origem — auditoria código×jornada 2026-07-01 (D19)

A **jornada canônica é a REGRA**, não referência (`docs/jornada/jornada-canonica.md`,
voz do operador). Duas linhas dela sentenciam este defeito:

- **Passo 2, linha 71:** *"**Educação de lance embutido** pra QUALQUER resposta
  (Sim/Não/Talvez)"* — marcada `🟢 web (route.ts:917) / 🔴 **WhatsApp pula** pra
  no/maybe (interactive-handlers.ts:357). FIX-92 corrigiu só web. Ver D19.*
- **Regra-mãe (Paridade Web ↔ WhatsApp, linha 25-30):** *"a jornada é **a mesma**
  nos dois canais — mesmos passos, mesma ordem, mesmas regras. Nenhum passo existe
  num canal e não no outro."* A auditoria classificou D19 como uma das **6 quebras
  de paridade silenciosas** (fix aplicado só num canal).

O próprio texto educativo do docx justifica por que ele TEM que aparecer pra
no/maybe: o lance embutido *"ajuda quem não possui todo o valor do lance hoje"* —
ou seja, existe EXATAMENTE pra quem respondeu Não/Talvez. Pular a educação
justamente pra esse público (a maioria) esvazia o sentido do passo.

## Cenário exato (o comportamento divergente hoje)

- **Canal:** WhatsApp.
- **Passos:** 1) usuário chega até o gate de lance ("Pretende dar um lance?");
  2) responde **"Não"** ou **"Talvez"** (botões `lance_no` / `lance_maybe`).
- **Atual (`interactive-handlers.ts:353-358`):** só o ramo `yes` reage e segue o
  funil educativo; no/maybe caem direto em `runSearchSummaryWithOrchestrator` — a
  pergunta "Você sabe o que é lance embutido?" + explicação **nunca aparecem**, o
  funil emenda direto na busca.
- **Esperado (paridade com o web já correto, `route.ts:917-928`):** no/maybe
  disparam o gate `lance-embutido` (educa + opt-in) ANTES da busca; só depois do
  opt-in a busca roda.

Este é o mesmo bug que o **FIX-4** matou no state machine e o **FIX-92** aplicou no
web — o WhatsApp ficou pra trás.

## Root cause (INVESTIGADO no código atual — file:line reais)

1. **`src/lib/whatsapp/interactive-handlers.ts:353-358`** — `handleLance`
   hard-coda o próximo passo em vez de consultar `nextGate`:
   ```ts
   if (resolved.value === "yes") {
       await runAgentDirective(from, conversationId, buildLanceReactionDirective(resolved.title));
       return true;
   }
   await runSearchSummaryWithOrchestrator({ from, conversationId }); // no/maybe: PULA lance-embutido
   return true;
   ```
   Só `yes` entra no ramo educativo (reage → gate lance-value → lance-embutido).
   no/maybe vão direto pra busca.

2. **`src/lib/whatsapp/adapter.ts:319-338`** — `runSearchSummaryWithOrchestrator`
   tem tripwire **só pra identidade** (`if (!refreshed.identityCollected)`, linha
   328), **nada** pra `lanceEmbutido`. Ele persiste `searchDispatched=true` (linha
   335) e dispara a busca. Ou seja, o gate lance-embutido é **irrecuperavelmente
   pulado** — não há rede que o re-emita depois (diferente do identify).

3. **`src/lib/agent/qualify-state.ts:71-77`** — `nextGate` FORÇA lance-embutido pra
   todos: `if (q.lanceEmbutido === undefined) return "lance-embutido"`. O state
   machine está CORRETO (provado por `qualify-state.lance-embutido.test.ts` e pelo
   cassette FIX-4 em `agent-trajectory.test.ts:3907-3911`). **O bug é que o handler
   WhatsApp curto-circuita o state machine** — nunca chama `nextGate` no ramo
   no/maybe, então a correção do FIX-4 não tem efeito nesse caminho.

4. **Contraste com o web (`src/app/api/chat/route.ts:917-928`)** — o handler web do
   gate `lance` faz o certo: `yes` reage; `no`/`maybe` → `pipeGatePrompt({ gate:
   "lance-embutido" })`. Foi o que o FIX-92 (regressão do FIX-4 no web) corrigiu.
   O comentário no próprio route.ts:914-916 registra o bug histórico idêntico
   (BUG-LANCE-EMBUTIDO-PULADO, QA noturno 2026-06-21) — o WhatsApp tem hoje
   exatamente essa regressão que o web já não tem.

**Confirmado:** FIX-113/114/115 não tocaram `handleLance`. O gap persiste no HEAD do
worktree.

## Correção proposta (o quê × onde)

**A REGRA é a paridade com o comportamento web já correto** (`route.ts:917-928`) —
não inventar fluxo novo, espelhar o web.

| O quê | Onde |
|-------|------|
| No ramo no/maybe de `handleLance`, disparar o gate `lance-embutido` (educa + opt-in) ANTES da busca, em vez de chamar `runSearchSummaryWithOrchestrator` direto | `src/lib/whatsapp/interactive-handlers.ts:357` |
| Reusar o mecanismo já provado no próprio arquivo: `await fireGate(from, conversationId, "lance-embutido", updated)` — é o MESMO caminho que `handleLanceValue` (`interactive-handlers.ts:410`) usa pra o ramo `yes` chegar ao lance-embutido. A busca só roda depois do clique em `lanceembutido_*`, que já cai em `handleLanceEmbutido:434 → runSearchSummaryWithOrchestrator` | `src/lib/whatsapp/interactive-handlers.ts` (ramo no/maybe) |
| Manter o ramo `yes` intacto (reage via `buildLanceReactionDirective` → gate lance-value → lance-embutido) | `src/lib/whatsapp/interactive-handlers.ts:353-356` |

Nota: `fireGate` já resolve `gateInteractive("lance-embutido", …)` →
`lanceEmbutidoQuestionToWhatsApp` (`adapter.ts:68-69`), então a copy educativa
(fonte única do sistema, gate-questions.ts) sai idêntica à do web.

## Regressão exigida (bug de comportamento do funil WhatsApp → 3 camadas)

Segue a regra do projeto (CLAUDE.md → "Regressão de agent — 3 camadas OBRIGATÓRIAS").
A **REGRA validada é a paridade com o web já correto**.

**Camada 1 — structural** (`src/lib/whatsapp/interactive-handlers.<slug>.test.ts`,
ou o arquivo de teste de handlers WhatsApp existente):
- Assert de acoplamento no source: o ramo no/maybe de `handleLance` referencia o
  gate `lance-embutido` (via `fireGate(… "lance-embutido" …)`) e **NÃO** chama
  `runSearchSummaryWithOrchestrator` diretamente no no/maybe.
- Assert de paridade: espelhar o acoplamento já verificado no web (o cassette
  FIX-4/`agent-trajectory.test.ts:3364-3374` cobre o tripwire de identidade; aqui é
  o análogo pro gate lance-embutido — o handler WhatsApp deve casar com
  `route.ts:917-928`).
- (O state machine já está coberto por `qualify-state.lance-embutido.test.ts` +
  cassette FIX-4 `agent-trajectory.test.ts:3907-3911` — NÃO regredir esses.)

**Camada 2 — cassette** (obrigatória, `tests/regression/agent-trajectory.test.ts`):
- Novo `describe("FIX-118-WHATSAPP-LANCE-EMBUTIDO-NO-MAYBE — paridade com FIX-92")`.
- Fluxo determinístico: `hasLance="no"` (e "maybe") pelo WhatsApp → o gate
  `lance-embutido` é emitido **ANTES** de qualquer search summary / antes de
  `searchDispatched` virar true.
- Cross-ref explícito pro cassette FIX-4 (state machine) e pro handler web
  (route.ts:917-928) — deixar registrado que os dois canais convergem no mesmo
  comportamento.

**Camada 3 — eval nightly** (não bloqueante): o cenário de persona no WhatsApp que
responde "Não" ao lance deve ver a educação de lance embutido. Opcional; as Camadas
1+2 são o gate de PR.

**Fluxo TDD:** escrever Camadas 1+2 → ver ambas FALHAREM com o handler atual
(no/maybe pula) → aplicar o fix (fireGate no ramo no/maybe) → ver verdes →
commit `test+fix:` único.

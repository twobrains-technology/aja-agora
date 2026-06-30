Você é o executor do bloco `bloco-streaming-chat-layer` no worktree isolado deste branch (`fix/streaming-chat-layer`).

## Contexto
3 bugs REAIS reportados pelo Kairo em 2026-06-30 (uso manual, vistos em PRODUÇÃO) na camada de streaming/fechamento do chat do Aja Agora. Eles podem compartilhar root cause — investigue os 3, mas conserte cada um com evidência.

## Passos

1. **Leia primeiro:**
   - `docs/correcoes/README.md` (regras do fluxo de correções).
   - `docs/correcoes/todo/bloco-streaming-chat-layer/_bloco.md` e os 3 `fix-NN-*.md` (root cause investigado + leads + correção proposta + regressão exigida). Os prints estão em `_evidencia/`.
   - `CLAUDE.md` do projeto, seção **"Regressão de agent — 3 camadas OBRIGATÓRIAS"** e **"Regra de TDD pra bugs — STRICT"**. FIX-110 e FIX-112 tocam comportamento de agente/stream → exigem Camada 1 (structural) + Camada 2 (cassette em `tests/regression/agent-trajectory.test.ts`).

2. **NÃO é design novo — é bug-fix.** Pule brainstorming. Para cada item, CONFIRME o root cause no código (os fix-NN trazem leads fortes mas marcam o que falta provar) e então conserte. Se ao investigar achar que o root cause real diverge do lead, ajuste o fix e DOCUMENTE no `.done/` o porquê.

3. **TDD STRICT, na ordem `itens:` do _bloco.md (FIX-110 → FIX-112 → FIX-111):**
   - Escreva o teste de regressão PRIMEIRO, veja-o FALHAR com a assinatura certa, então conserte, veja passar.
   - **FIX-110:** garanta `onError` (e recuperação de stream morto) em TODOS os `createUIMessageStream`/`createUIMessageStreamResponse` de `route.ts` (há paths SEM onError hoje — linhas ~299/345/1071/1085) + no client (`provider.tsx`) tratar `status:"error"`/timeout pra nunca ficar preso em "streaming". Cassette: stream que erra no meio → client sai de "streaming" (não fica mudo).
   - **FIX-112:** gateie o passo "documento" em `proposalStatus==="documentos"` (i.e., `confirmOffer` rodou: choose_offer→getDocumentLinks). NÃO quebre a ordem já correta em `fulfillment.ts:174-175`. Corrija a leitura de intent: "bora"/"ok estou pronto" = AVANÇO, não recusa. Cassette: "...quer completar? → bora" NÃO produz "Sem problema/quando quiser retomar".
   - **FIX-111:** estabilize o scroll (histerese no `scroll-intent.ts`; auto-scroll throttled e só quando colado no fim; sem controlador duplicado no teatro). Estenda `scroll-intent.test.ts` (função pura) — sem `waitForTimeout`.
   - ⚠️ NÃO afrouxe/gamee teste pra passar. Teste falha ANTES do fix. Nada de `.only`/`skip`/`as any`/`@ts-ignore` mascarando.

4. **Gate antes de cada commit:** `pnpm test:unit` verde (e os cassettes em `tests/regression`). Se o pre-commit hook reclamar de eval (Camada 3) por falta de crédito/credencial, isso é nightly — não é seu gate; mantenha Camadas 1+2 verdes.

5. **1 commit Conventional (PT-BR) por item:** `test+fix: <descrição>` (teste + fix juntos, é bug com TDD). Ex.: `test+fix: onError em todo stream do chat pra agente não ficar mudo (FIX-110)`.

6. **Ao concluir cada item:** mova o `fix-NN-*.md` pra `docs/correcoes/done/` com `status: done` + `commit: <hash>` + `executado_em: 2026-06-30` (best-effort — o orquestrador reconcilia se esquecer). Bloco esvaziou → apague a pasta.

7. **Ao terminar TUDO:** `git push origin fix/streaming-chat-layer` + gere `.done/2026-06-30-streaming-chat-layer.md` (resumo de negócio + decisões + testes + gaps honestos). **NÃO abra PR, NÃO faça merge, NÃO rode deploy/restart, NÃO crie reminder.** A integração na base é do orquestrador.

8. **RESUMO FINAL:** liste as decisões de design que tomou ("decidi X em vez de Y porque Z" por linha) e o que de root cause você CONFIRMOU vs o que era hipótese. Se algum bug não reproduziu/não tinha causa no código, diga explicitamente (não invente fix).

Você é o executor do bloco **bloco-r9-2-prompt-honestidade** no worktree isolado deste branch
(`fix/r9-2-prompt-honestidade`). Projeto: aja-agora (Next.js + Vercel AI SDK 6). Idioma: PT-BR.
Package manager: **pnpm** (único PM permitido — nunca npm/yarn).

1. Leia `docs/correcoes/README.md` (regras do fluxo) e
   `docs/correcoes/todo/bloco-r9-2-prompt-honestidade/` inteiro (`_bloco.md` +
   `fix-282-toolerror-evasao-honestidade.md` + `fix-283-metanarrativa-whatsapp-optin-vaza.md` —
   root cause já provado file:line em cada card, com o rastro completo do dossiê que confirmou o
   mecanismo real).

2. DESIGN — **FIX-282 tem UMA decisão de design real, aberta** (o card já registra as 2 opções):
   quando o usuário pressiona "por que essa e não outra", `meta.recommendedOffer` não persiste
   `score`/`scoreBreakdown` (só administradora/creditValue/termMonths/monthlyPayment/groupId).
   Use `superpowers:brainstorming` + **`AskUserQuestion`** com a opção recomendada em 1º lugar
   ("Recomendado"):
   - **Opção A (Recomendado)** — responder honestamente só a parte de EXATIDÃO (comparação real
     `rawCreditValue` × `creditValue`, números concretos) + uma frase honesta-mas-genérica sobre
     o critério combinado (prazo/parcela/contemplação), sem inventar um score que não existe em
     memória. Menor blast radius, resolve o P1 imediato.
   - **Opção B** — persistir `score`/`scoreBreakdown` em `meta.recommendedOffer` no momento do
     reveal (`orchestrator/runner.ts`, mesmo ponto que grava `creditValue`/`termMonths`/
     `monthlyPayment` hoje) e citar o critério REAL na resposta. Mais completo, mais invasivo
     (muda o schema de `ConversationMetadata.recommendedOffer`, `personas.ts`).
   Sem resposta em tempo razoável (fallback anti-trava): siga a Opção A. Registre a decisão em
   `docs/decisoes/blocos/{data}-bloco-r9-2-prompt-honestidade.md`. FIX-283 NÃO tem decisão de
   design aberta — o card já fecha a correção (nova categoria de blocklist no sanitizer +
   reforço no prompt); pule o brainstorming pra ele.

3. Execute NA ORDEM: **FIX-282** primeiro, depois **FIX-283**. TDD strict pros dois (teste de
   regressão que reproduz o cenário exato do dossiê PRIMEIRO, vê FALHAR, corrige, vê passar):
   - FIX-282: novo `orchestrator/index.fix-282-honestidade-toolerror.integration.test.ts` (mesmo
     padrão de `index.fix-266-recuperacao-resolve.integration.test.ts`) reproduzindo o cenário do
     probe-i2 — reveal com
     `rawCreditValue`≠`creditValue`, pergunta de exatidão/critério, tool-error via
     `search_groups` fora de fase → resposta final NÃO pode ser o texto verbatim do fallback
     genérico, TEM que conter a comparação real. Implemente o classificador
     (`isExactnessOrCriteriaQuestion` ou nome equivalente em `directives.ts`) + o novo branch em
     `index.ts:475-500` ANTES do fallback genérico. Confirme que `wants_more_options` genuíno
     (I1) continua recebendo o fallback antigo — não regredir.
   - FIX-283: novo teste em `sanitizer.test.ts` provando que o trecho EXATO do dossiê ("não crio
     esse tipo de texto por conta própria — isso é conduzido automaticamente pelo sistema quando
     chega a hora certa") é dropado pela nova categoria `isMechanismNarrationClaim` (adicionar a
     `isEphemeralSegment`). Cuidado com falso-positivo em frases operacionais legítimas que
     mencionem "sistema" — se achar ambiguidade real ao escrever os casos de teste, decida com
     `AskUserQuestion` (recomendada: manter o regex estreito, específico aos padrões do card,
     preferindo falso-negativo a falso-positivo). Secundariamente, reescreva
     `whatsappOptinSection("done")` (`system-prompt.ts:918-920`) pra reduzir o fraseado
     "colável" — mitigação, não substitui o sanitizer.

4. **1 commit Conventional (PT-BR) por item** (`test+fix:` cada um).

5. Ao concluir cada item: MOVA o `fix-NN` correspondente pra `docs/correcoes/done/` (`status:
   done` + `commit:` + `executado_em:`). Bloco esvaziou → apague a pasta
   `bloco-r9-2-prompt-honestidade/`.

6. Ao terminar: `pnpm test:unit` verde, **push da branch** (`git push origin
   fix/r9-2-prompt-honestidade`) + gere `.done/{data}-bloco-r9-2-prompt-honestidade.md` (resumo +
   decisão de design tomada no FIX-282 + testes + gaps honestos). **NÃO abra PR, NÃO faça merge,
   NÃO rode deploy/restart/migration, NÃO crie reminder.**

7. RESUMO FINAL: liste as decisões que você tomou, começando pela do FIX-282 (Opção A ou B, e
   por quê) — linha por decisão.

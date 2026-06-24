Você é o executor do bloco **bloco-d-acentuacao-textos** no worktree isolado deste branch (`fix/acentuacao-textos-ptbr`). Trabalha SOZINHO, sem o Kairo para responder: NÃO faça perguntas, NÃO espere aprovação — você É o decisor (best practice + padrões do repo).

## Contexto
Revisar/corrigir a acentuação e ortografia PT-BR de TODOS os textos da plataforma voltados ao usuário/operador. Inventário já feito: a **landing e a metadata estão limpas** (guardadas por `copy.test.ts` e `system-prompt.acentuacao.test.ts`). O que falta é (a) os **prompts do agente em `.ts`** (não cobertos pelo guard `.tsx`) — epicentro `system-prompt.ts` com 300+ palavras sem acento — e (b) alguns **textos de admin `.tsx`** ("Visao geral", "Conversao"). Os 3 cassettes de `agent-trajectory.test.ts` provam que o texto sem acento VAZA pro usuário.

## Passos (EM ORDEM — TDD do guard)
1. Leia `docs/correcoes/README.md` e a pasta `docs/correcoes/todo/bloco-d-acentuacao-textos/` inteira (`_bloco.md` + FIX-73, FIX-74, FIX-75). Leia `CLAUDE.md` do projeto e a regra global de "português correto em página/UI". Sem brainstorming: o caminho está fechado nos fix-NN (correção ortográfica, sem decisão de design).

2. **FIX-73 (teste-primeiro)** — estenda `src/lib/agent/system-prompt.acentuacao.test.ts`:
   - Adicione um bloco que **importa os prompts como string** (`SYSTEM_PROMPT`, `SPECIALIST_BASE_PROMPT`, e os prompts de `turn-analyzer.ts`, `insights-prompt.ts`, `mesa-copilot/system-prompt.ts`, `directives.ts`) e assere que NENHUMA palavra da blocklist aparece como palavra inteira (word-boundary, case-insensitive). Importar a string (não varrer o arquivo cru) evita falso-positivo em identificadores/tools.
   - Amplie a blocklist comum com: visao, conversao, operacao, decisao, opcao, numero, historico, orcamento, possivel, tambem (+ as já existentes). Para `sao`/`esta`/`ja`/`nao` use critério que não dê falso-positivo (ex.: só dentro de prosa; se arriscado, deixe fora da varredura .tsx mas inclua na varredura das strings de prompt importadas).
   - Rode (`pnpm exec vitest run src/lib/agent/system-prompt.acentuacao.test.ts`) e **CONFIRME que FALHA** listando os offenders reais. Esse é o estado vermelho do TDD.

3. **FIX-74** — acentue os prompts/diretivas `.ts` (`system-prompt.ts`, `turn-analyzer.ts`, `directives.ts`, `insights-prompt.ts`, `mesa-copilot/system-prompt.ts`). **CIRÚRGICO: só diacrítico/cedilha/til. NÃO reescreva, NÃO reformule, NÃO mexa em pontuação/markdown/ordem.**

4. **FIX-75** — acentue a admin UI `.tsx` (page.tsx, funnel-chart.tsx, kpi-cards.tsx, login-page-03.tsx) e faça o sweep de `src/components/chat/artifacts/`, `src/lib/whatsapp/formatter.ts`, `src/lib/email/templates/invite.ts` + mensagens de erro PT-BR de API. Acentue o que o guard apontar.

5. Rode o guard de novo + `pnpm typecheck && pnpm test:unit` até **VERDE**.

## LINHA VERMELHA do escopo (inviolável — não é design, é correção ortográfica)
- **NÃO toque nos 3 cassettes** de `tests/regression/agent-trajectory.test.ts` (≈L546 "Da uma olhada nas opcoes…", ≈L693 "credito voce esta…imovel", ≈L4941 "opcao bem proxima"). São fixtures de bug INTENCIONAIS (saída buggada do agente). Os `expect(...).toBe(cassette)` casam o cassette consigo mesmo — deixe ambos como estão.
- **Marcadores literais parseados pelo código** (ex.: `Nome do usuario:`, `Categoria de consorcio detectada`, rótulos `:` injetados como system message ou casados por `includes`/regex): ANTES de acentuar, `grep` o literal no repo. Se for construído/casado em código → acentue nos DOIS lados de forma idêntica, OU **preserve** o literal e anote no `.done/` ("marcador preservado — parseado em <arquivo:linha>"). Em dúvida: PRESERVE.
- **NÃO renomeie identificadores de código** (`computeConversaoDimension`, `scoreConversao`), nomes de tools, chaves JSON, variáveis. Texto em inglês intencional fica.
- Se um structural test assertar um literal que você acentuou E for só copy (não marcador) → atualize o assert do teste no MESMO commit. Se for marcador → você provavelmente devia ter preservado; reveja.

6. 1 commit Conventional (PT-BR) por item/grupo coeso (`fix:` — acento faltando é defeito ortográfico; `test:` para o guard do FIX-73, ou junte como `test+fix:` se preferir 1 commit do guard+correção). Ao concluir cada item, MOVA o `fix-NN` pra `docs/correcoes/done/` com `status: done` + `commit: <hash>` + `executado_em: 2026-06-24`. Bloco esvaziou → apague a pasta (deixe só o que sobrar).

7. **Gate antes de fechar:** `pnpm typecheck && pnpm test:unit` VERDE. Se o pre-commit hook bloquear SÓ por causa do passo de eval (`test:eval:quick` precisa de ANTHROPIC_API_KEY que pode não existir no workspace) e o `test:unit` + `typecheck` estiverem verdes, é aceitável commitar com `--no-verify` documentando o motivo no `.done/` (Camada 3/eval é nightly, não é gate de merge). NUNCA use `--no-verify` pra mascarar Camada 1/2 vermelha.

8. Ao terminar: **push da branch** (`git push origin fix/acentuacao-textos-ptbr`) + gere `.done/2026-06-24-bloco-d-acentuacao-textos.md` (resumo + quantos offenders corrigidos por arquivo + marcadores preservados + se usou `--no-verify` e por quê + gaps).

9. **PROIBIDO**: abrir PR, merge, deploy/restart. Sua linha vermelha é só push da branch (o merge-back é do orquestrador). [Em modo autônomo, a última ação — tag-sentinela — é injetada pelo disparo; siga o footer.]

10. RESUMO FINAL: liste o que corrigiu por arquivo, os marcadores que PRESERVOU (e por quê), e qualquer ocorrência que deixou de fora (com justificativa), pro Kairo revisar de relance.

Você é o executor do bloco bloco-g-remove-servicos no worktree isolado deste branch.

**Modo de urgência (pedido explícito do operador):** priorize velocidade. TDD SÓ nos dois
pontos que são lógica/invariante real (mapeamento de segmento Bevi sem `throw`; turn-analyzer
nunca mais classificando texto livre como categoria inexistente) — o resto da remoção (tipos,
enums, configs) é mecânico, não precisa de teste por arquivo, só precisa compilar limpo.

1. Leia `docs/correcoes/README.md` (regras do fluxo) e esta pasta
   (`docs/correcoes/todo/bloco-g-remove-servicos/`: `_bloco.md` + `fix-363-...md` — root cause,
   cenário, correção, regressão exigida). Leia também
   `.processo/loop/2026-07-22-1853-vendedor-matador-consorcio.md` (seção ITEM 1) pro contexto
   completo da campanha — mas a fonte de verdade da correção é o fix-363.

2. **Sem decisão de design nova aqui** — as duas decisões de produto (mapear segmento Bevi pra
   `auto`; erradicar `servicos` de todas as camadas) já foram tomadas no goal doc (default
   recomendado, Kairo revisa depois). Não pergunte de novo, não brainstorme — implemente.

3. Execute o FIX-363 na ordem que fizer sentido tecnicamente, mas **respeite esta sequência**
   pra migração não quebrar:
   a. Primeiro, ajuste `partner-offer-mapper.ts` (`beviSegmentToCategory`) pra mapear
      `SERVICOS`/`OUTROS BENS` → `auto` em vez de `servicos`/throw. Escreva o teste de
      regressão ANTES (TDD strict — é lógica real: uma oferta com esses segmentos não pode
      mais dar throw nem virar `servicos`).
   b. Escreva a nova migration Drizzle: DELETE da persona "Camila" (id=`servicos` em
      `drizzle/0004_agents_crud.sql`) e SÓ DEPOIS `ALTER` o CHECK constraint
      `personas_category_check` pra não aceitar mais `servicos`. Rode o comando de gerar
      migration do projeto se houver (`pnpm drizzle-kit generate` ou equivalente — confira
      `package.json`); não escreva SQL cru se o projeto usa migrations geradas.
   c. Remova `servicos` de `Category`/`SPECIALIST_CATEGORIES` (`personas.ts`), depois deixe o
      `pnpm typecheck` guiar os demais arquivos que vão quebrar (`categories.ts`,
      `qualify-config.ts`, `recommendation.ts`, `plan-estimate.ts`, `chat/types.ts`,
      `ui-message.ts`, `tools/ai-sdk.ts`, `tools/schemas.ts`, `diagnose/types.ts`,
      `personas-repo.ts`, `reactivation.ts`, `whatsapp/formatter.ts`,
      `validations/persona.ts`) — corrija cada erro de tipo até `pnpm typecheck` sair limpo.
   d. `turn-analyzer.ts` — remova o enum/few-shot que classifica texto livre como `servicos`;
      escreva o teste de regressão (TDD strict): texto com "reforma"/"viagem" NUNCA deve
      classificar como categoria válida de serviços.
   e. Remova regex remanescente em `routing.ts` e `assistant-tools.ts` que reconheça
      `servicos`.
4. Rode SÓ os testes dos arquivos que você tocou (ex.: `vitest run <path>`) — NUNCA a suíte
   inteira (isso é do gate da integradora). Rode `pnpm typecheck` no final e garanta que sai
   limpo — é o critério de aceitação mecânico deste item.
5. 1 commit Conventional (PT-BR) por sub-passo relevante (ex.: `fix: mapeia segmentos
   servicos/outros-bens da bevi para auto`, depois `fix: remove persona e categoria servicos do
   banco e do dominio`, etc.) — não precisa ser 1 commit gigante, mas também não precisa ser 1
   por arquivo mecânico.
6. Ao concluir: mova `fix-363-...md` pra `docs/correcoes/done/` com `status: done` + `commit:
   <hash>` + `executado_em: <data>` (best-effort — o orquestrador garante isso no merge de
   qualquer forma).
7. Ao terminar: **push da branch** (`git push origin fix/remove-servicos-categoria`) + gere
   `.done/{data}-bloco-g-remove-servicos.md` (resumo + decisões técnicas tomadas + testes +
   gaps honestos, ex.: se sobrou algum arquivo com `servicos` que você decidiu deixar por algum
   motivo, diga qual e por quê). **NÃO abra PR, NÃO faça merge, NÃO rode deploy/restart, NÃO
   crie reminder.** A integração na base é do orquestrador.
8. RESUMO FINAL: liste as decisões técnicas que você tomou durante a implementação (ex.: como
   resolveu um erro de tipo específico, se algum arquivo citado no fix-363 na verdade não
   precisava de mudança). Sem decisão nova? Diga isso.

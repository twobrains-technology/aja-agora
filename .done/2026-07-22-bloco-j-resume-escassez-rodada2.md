---
bloco: bloco-j-resume-escassez-rodada2
branch: fix/resume-escassez-rodada2
itens: [FIX-368, FIX-369]
executado_em: 2026-07-22
---

# Bloco J — resume pós-fechamento + escassez (rodada 2, campanha vendedor-matador)

Dois achados do juiz Sonnet (rodada 1, harness de conversa real das 3 personas). Ambos
concluídos, testados, empurrados pra `fix/resume-escassez-rodada2`.

## FIX-368 — turno "Voltei" pós-fechamento não reconhece a proposta fechada

**Root cause** (já vinha investigado no card, confirmado): `contractClosedSection` cobre
CONTESTAÇÃO e PERGUNTA DE STATUS, mas nenhuma seção do prompt instruía o modelo sobre como abrir
a resposta quando o turno é uma RETOMADA pós-fechamento — o modelo tratava "Voltei" como abertura
de conversa comum e cada persona inventou uma etapa pendente diferente.

**Fix**: novo sinal explícito `isResumeGreeting`, propagado desde o seed sintético "Voltei"
(`theater-chat.tsx`, disparado só quando a retomada hidrata SEM nada digitado pelo cliente) →
`provider.tsx` (`sendUserMessage` aceita opts) → `route.ts` (`ChatRequestBody.isResumeGreeting`)
→ `pipeUserTurn`/`TurnInput` → `runTurnVercel` → `runAgentTurn` → `resolveAgent`/`buildAgent` →
`buildSpecialistPrompt`. Nova seção `resumeAfterCloseSection` (system-prompt.ts) dispara SÓ
quando `contractClosedInfo` existe E `isResumeGreeting` é true — nunca por heurística de texto no
servidor (a frase exata continua do modelo). Cache key de `resolveAgent` ganhou o hash `rg-`.

**Decisão**: nenhuma decisão de design aberta — o card já trazia a correção fechada (reusar sinal
existente vs. flag explícita). Optei pela flag explícita (opção B do card) porque o `metadata.
resumed` client-side (FIX-49) nunca chega ao servidor — `ChatMessage` (orchestrator/types.ts) é
`{role, content}`, sem metadata; a história vem do banco (`loadConversationHistory`), não do
payload do cliente. Sem `AskUserQuestion` — não era decisão de produto/UX, era implementação
técnica com caminho único viável.

**Testes** (TDD, vistos falhando antes do fix via `git stash` em `system-prompt.ts`):
- `src/lib/agent/system-prompt.resume-after-close.test.ts` (6 casos)
- `src/components/chat/theater/theater-chat.resume-greeting.test.tsx` (3 casos)
- `src/components/chat/theater/chat-theater.test.tsx` (2 casos pré-existentes atualizados pra
  nova assinatura de `sendUserMessage`)

**Commit**: `9aa0cb55801679a09baec11a6507ee4d5fcc632c`

## FIX-369 — card de escassez nunca aparece (0/3 personas)

**Hipótese do card** (bypass via `present_decision_prompt` chamado direto pelo modelo, sem passar
por `dispatchDecisionCascade`) — **REFUTADA**. Confirmado por dois caminhos independentes:

1. Leitura de código: `present_decision_prompt` nunca entra em `allowedTools()` (tool-policy.ts)
   em NENHUMA fase desde o FIX-253 — comentário do próprio `server-cards.ts` já documenta que a
   tool foi deliberadamente removida do toolset pra fechar exatamente essa classe de bypass ("mata
   a tool por completo"). O modelo não tem a tool disponível — impossível chamá-la.
2. Reprodução empírica: teste de integração contra Postgres real (`AI_RUNTIME=vercel`,
   `resolveAgent` mockado pra devolver SÓ TEXTO, sem tool-call nenhuma) prova que
   `dispatchDecisionCascade` dispara a cascata scarcity→decision_prompt corretamente por TEXTO
   LIVRE — sem depender de clique nem de qualquer tool-call do modelo.

Uma segunda hipótese (assimetria clique×texto no gate `simulator-offer`) também foi levantada e
testada durante a investigação — **igualmente refutada**: `nextGate()` só olha
`simulatorOfferDispatched` (não `simulatorOfferAnswered`) pra liberar o gate `decision`, então o
caminho de texto livre não fica pra trás do caminho de clique.

**Causa real encontrada** (por leitura de código, confirmada pela mesma reprodução):
`buildScarcityCard` (server-cards.ts) só checava `groupId` antes de devolver um card não-nulo.
Quando a Bevi não devolve `availableSlots` pro grupo, `coerceScarcityPayload` corretamente nunca
fabrica o número (`availableSlots: undefined`) — mas o componente React `Scarcity` (scarcity.tsx)
só renderiza quando `availableSlots` é um número finito, retornando `null` caso contrário. O
servidor seguia **emitindo e persistindo** o artifact mesmo assim — um card "fantasma", tecnicamente
no banco/stream, mas invisível na tela. Isso explica o "0/3 personas" sem nenhum bug de controle de
fluxo: dado ausente da Bevi + servidor emitindo o que o front sempre esconde.

**Fix**: `buildScarcityCard` agora espelha a mesma condição do componente — depois de coagir o
payload, se `availableSlots` não for um número finito, devolve `null` em vez de um card fantasma.
`dispatchDecisionCascade`/`pipeClosingCeremony` (que só checam `if (scarcityCard)`) passam a pular
a emissão nesse caso, sem alterar nenhuma outra lógica.

**Decisão**: card previa `AskUserQuestion` só SE a hipótese fosse refutada E restasse decisão de
design genuína entre 2 caminhos alternativos. Não foi o caso — a causa real, uma vez encontrada,
tinha correção única e óbvia (espelhar a condição do componente), então corrigi direto, sem
pergunta.

**Gap residual** (fora do escopo): não investiguei se a Bevi de fato nunca devolve
`monthlyAwardedQuotas` pra moto/auto no ambiente de teste, ou se é intermitente — pergunta de
dado/integração externa, não de código.

**Testes** (TDD, vistos falhando antes do fix):
- `src/lib/agent/orchestrator/fix-369-scarcity-embedded-bid.integration.test.ts` — integração
  contra Postgres real, 2 casos (com `availableSlots` real → scarcity aparece; sem → só
  decision_prompt, scarcity ausente). Requer `DATABASE_URL` (skip automático sem ele).
- `src/lib/agent/orchestrator/server-cards.test.ts` — 1 caso pré-existente (FIX-367) atualizado:
  a asserção antiga (`expect(card).not.toBeNull()` sem availableSlots) codificava o próprio bug;
  agora afirma `null`.

**Commit**: `31fa8b91272c256aba22a1f176b03b6290f79eb1`

## Infra de reprodução (efêmera, não faz parte do fix)

Pra rodar os testes de integração (FIX-369, FIX-313 pré-existente), criei um banco de dados de
workspace `aja_agora_ws_fix_resume_escassez_rodada2` no Postgres compartilhado (`aja-shared-pg`,
clone de `aja_agora_template`), acessível via `aja-shared-pg.orb.local:5432` (DNS OrbStack). Não é
parte do código do fix — é infraestrutura local de desenvolvimento, seguindo a convenção
`local-dev` v2 do projeto (1 DB por workspace no PG shared).

## Resultado geral

- `pnpm typecheck` limpo.
- `pnpm biome check` limpo nos arquivos tocados.
- Todos os testes tocados (41 casos, 10 arquivos) verdes, incluindo os de integração contra DB
  real e os pré-existentes atualizados.
- 2 commits `test+fix:` (1 por item) + 2 commits `docs:` (mover fix pra done/).
- Branch `fix/resume-escassez-rodada2` empurrada pro origin.
- NÃO rodei smoke/QA de browser neste bloco — a validação E2E das 3 personas é da próxima rodada
  do loop, no orquestrador, contra a base integrada.

## Resumo das decisões (linha por linha)

1. **FIX-368**: decidi propagar um sinal explícito `isResumeGreeting` de ponta a ponta (client →
   server) em vez de tentar reusar `metadata.resumed` — porque esse metadata é um conceito
   client-side (AjaUIMessage) que nunca chega ao servidor; o histórico do turno vem do banco, não
   do payload do cliente. Sem essa propagação explícita não haveria NENHUM jeito confiável de
   diferenciar "primeiro turno pós-retomada" de "turno normal pós-fechamento" no servidor.
2. **FIX-368**: decidi NÃO usar heurística de texto ("se o texto for 'Voltei', ativa a seção") —
   isso violaria a diretriz do card e do CLAUDE.md do projeto (invariante verificável vira código,
   não regex de texto do usuário). O sinal vem de ONDE o texto foi gerado (seed sintético do
   client), não do CONTEÚDO do texto.
3. **FIX-369**: a hipótese do card (bypass via tool-call) foi CONFIRMADA como refutada — não só
   por leitura de código, mas por reprodução empírica rodada de fato (não assumida). Registrei
   isso explicitamente porque o card pedia "documentar o achado real" quando refutado.
4. **FIX-369**: decidi corrigir direto (sem abrir FIX-370 no inbox) porque, uma vez encontrada, a
   causa real tinha correção única, pequena, e sem ambiguidade de design — exatamente a exceção
   que o card previa pra pular o `AskUserQuestion`.
5. **FIX-369**: decidi NÃO investigar se a Bevi de fato nunca devolve `monthlyAwardedQuotas` pra
   moto/auto — é uma pergunta de integração externa/dado, fora do escopo de um bloco de fix de
   código, e documentei isso como gap residual explícito em vez de fingir que o fix resolve 100%
   do sintoma "0/3 personas viram o card" (ele resolve o desperdício de write/stream fantasma;
   se a Bevi continuar sem devolver o dado, o card continua ausente — corretamente, por desenho).

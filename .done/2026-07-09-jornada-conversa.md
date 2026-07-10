---
titulo: "Bloco jornada-conversa — reordenação do funil, gate desire, sanitizer/voz, fecho WhatsApp"
data: 2026-07-09
bloco: bloco-jornada-conversa
branch: feat/jornada-conversa-consorcio
tipo: feature (handoff agente-vendas-consorcio, ADR 2026-07-09-agente-vendas-consorcio)
---

# Bloco jornada-conversa — funil, voz e fecho (FIX-233/234/235)

Onda "agente de vendas de consórcio" (handoff do protótipo validado). Este
bloco é dono único do `system-prompt.ts` na onda e executou os 3 itens em
sequência, cada um assentando terreno pro próximo (esqueleto do funil → voz →
fecho).

## TL;DR

- **FIX-233** — `experience` desce pra depois do `search`/reveal; `timeframe`
  reintroduz pós-recomendação (reverte o FIX-103); gate novo `desire` (não
  bloqueante, sem card) coleta `desiredItem`/`motivation` logo após o nome; 3ª
  saída do gate `lance` ("só a parcela") pula lance-value/lance-embutido/
  simulator-offer e aciona `present_two_paths` (tool do bloco-cards-ui,
  referenciada só pelo nome).
- **FIX-234** — sanitizer ganha 3 barreiras em código (Lei 4): redução de
  prazo ("reduzir o prazo"/"terminar antes"/"quitar antes", D7), reserva
  prematura ("cota garantida"/"reservado"/"você já está no grupo" antes da
  contratação real) e léxico banido ("saco", "furar a fila", "carro-problema",
  "na sua cabeça"). Prompt ganha a cadência "1 balão = 1 ideia completa" +
  emoji com parcimônia (substituindo a proibição total anterior).
- **FIX-235** — fecho pro WhatsApp: `closing-presentation.ts` ganha 3 balões
  novos DEPOIS do "Parabéns!" já travado por teste, pedindo o "oi" (função
  técnica — abre a janela de 24h) e citando a especialista em cadastros. Novo
  módulo `fecho-pedir-oi.ts` dispara o template HSM (usageKey configurável no
  admin, sem migration) e aciona a mesa **proativamente**
  (`dispatchAutoTransbordo`) em vez de esperar o worker assíncrono.
- **Gate**: `pnpm test:unit` verde — 303 arquivos / 2887 testes — e
  `pnpm test:integration` verde — 61 arquivos / 265 testes (3 skips
  pré-existentes, não relacionados) — rodado repetidamente num workspace local
  bootstrapado (Postgres real via `~/.claude/skills/local-dev`, não container
  transitório) porque o worktree não tinha stack local ainda.

## Commits

| Commit | O quê |
|---|---|
| `a4e8c510` | feat: reordena funil (experience pós-search, timeframe reintroduzido) + gate desire + 3ª saída do lance (FIX-233) |
| `d560be5` | docs: move fix-233 pra done |
| `106ccb5` | test: corrige fixtures de integração quebradas pelo gate desire (FIX-233) |
| `00ddfe6` | feat: sanitizer veda redução de prazo/reserva prematura + cadência consultiva do balão (FIX-234) |
| `1279dfd` | docs: move fix-234 pra done |
| `715d483` | feat: fecho pro WhatsApp pede o oi + aciona a mesa proativamente (FIX-235) |
| `a500db5` | docs: move fix-235 pra done + apaga bloco-jornada-conversa (concluído) |

## FIX-233 — reordenação do funil + gate desire + 3ª saída do lance

`qualify-state.ts::nextGate` reordenado: `desire` entra logo após o nome
(não bloqueante — marcado na emissão, mesmo padrão de `consentOffered`);
`experience` desce pra depois do reveal; `timeframe` reintroduz entre
`experience` e `lance`. A 3ª saída do lance (`hasLance: "so_parcela"`) pula
direto pro gate `decision`, onde `orchestrator/index.ts` agora escolhe entre
`buildDecisionPromptDirective` (padrão) e `buildLanceSoParcelaDirective`
(nova, chama `present_two_paths`) conforme o valor de `hasLance`.

**Achado tardio corrigido**: 3 testes de integração (rodam só com Postgres
real — mascarados nas primeiras rodadas por falta de DB no worktree) tinham
fixtures presas na ordem antiga. Só apareceram depois que bootstrapei o
workspace local; corrigidos em commit separado (`106ccb5`) — ficaram
temporariamente expostos entre `a4e8c510` e essa correção porque o Postgres
do workspace não existia ainda quando o commit do FIX-233 passou pelo
pre-commit (que só roda `test:unit`, excluindo `*.integration.test.ts`).

**Wiring mecânico fora do escopo declarado do card, mas mecanicamente
exigido** pela mudança de contrato `Gate`/`QualifyAnswers`: `gate-questions.ts`,
`web/adapter.ts`, `whatsapp/adapter.ts` (switches exaustivos sobre `Gate`),
`orchestrator/index.ts` (flag `desireAsked`), `turn-analyzer.ts`/`analyze.ts`
(extração de `hasLance:"so_parcela"` e `desiredItem`/`motivation`),
`tool-policy.ts` (allowlist do `present_two_paths`).

**Testes**: ~15 arquivos de teste de `qualify-state`/`analyze`/`gate-reengage`/
`interactive-handlers` reescritos (fixtures + assertions), nunca
`skip`/`.only`. 2 arquivos novos (`qualify-state.fix-103.test.ts` invertido —
premissa revertida, mantido o nome por histórico — e casos novos em
`qualify-state.sequence.test.ts` cobrindo `desire`/`so_parcela`/lead-numa-frase).

## FIX-234 — sanitizer + voz/cadência

3 padrões novos em `orchestrator/sanitizer.ts`
(`isPrazoReductionClaim`/`isPrematureReservationClaim`/`isBannedLexicon`),
dropados em runtime pelo `EphemeralTextFilter` — defesa em profundidade além
da regra no prompt (Lei 1/4). Note que o padrão de reserva prematura mira só
a fala da LLM: a copy determinística pós-evento do fechamento self-service
("sua reserva está confirmada", terminologia oficial da Ata 2026-07-04) não
passa pelo sanitizer e não foi tocada.

`system-prompt.ts` ganhou a seção "Cadência do balão" (1 balão = 1 ideia,
2-3 linhas, nem paredão nem picotado) + o léxico banido com substitutos ✅ +
2 exemplos novos no few-shot (`SHARED_SPECIALIST_EXAMPLES`). A regra antiga
"NUNCA use emoji" (absoluta) virou parcimônia (máx. 1 a cada 3-4 balões) —
reconciliei a contradição direta que teria ficado entre as duas instruções no
mesmo prompt.

**Achado corrigido no caminho**: meus próprios exemplos ❌/✅ na mesma linha
disparavam falso-positivo no teste `no-emoji-fix212.test.ts` (regex de
"emoji dentro de aspas" casava o texto ENTRE duas strings quando havia um
emoji ali) — resolvido usando "NÃO:"/"SIM:" em vez de ❌/✅, sem enfraquecer a
varredura existente.

`HARD_RULES.md` ganhou a seção 1.9; `hard-rules.ts` regenerado (paridade
byte-a-byte travada por `assistant-prompt.test.ts`).

## FIX-235 — fecho pro WhatsApp

**Decisão de produto resolvida nesta sessão** (ambiguidade real encontrada na
investigação, registrada em
`docs/decisoes/blocos/2026-07-09-jornada-conversa.md`): o self-service
(`present_contract_form`/`offer-confirm`) **continua criando a proposta real
sozinho** — o FECHO é uma camada adicional, não uma substituição. O "oi" só
serve pra abrir a janela de 24h; a mensagem que pede é um template HSM
configurável no admin (`usageKey: "fecho_pedir_oi"`, mecanismo já existente
via `resolveAndSend`/FIX-203, sem migration nova).

Copy adicionada como 3 `ClosingItem`s NOVOS em `closing-presentation.ts`,
DEPOIS do "Parabéns!" (que já era travado por teste do docx passo 5.2) — não
troquei nenhuma copy existente. Novo módulo `fecho-pedir-oi.ts` espelha
exatamente o padrão de `contract-summary.ts` (mesma injeção de dependências,
mesmo tratamento best-effort) e adiciona `dispatchAutoTransbordo(leadId)`
logo depois do envio — a mesa é acionada NA HORA, em vez de só esperar o
worker `proposal-status-poll.ts` (que só reconcilia quando a Bevi processa a
proposta na administradora, podendo levar dias).

**Decisão "mesa vs proxy"** (default do card, sem dúvida real → seguido):
`createMesaHandoff`/`dispatchAutoTransbordo` (mesa de cadastros), não
`handoffToAgents` (handoff antigo de vendas — mecanismo semanticamente
diferente).

## Gaps honestos / pendências

- **Template HSM não cadastrado** — o `usageKey: "fecho_pedir_oi"` precisa
  ser criado e aprovado no admin de WhatsApp Templates antes de ir pra prod.
  Sem ele, o envio cai na fila (`whatsapp_outbound_queue`) até aprovar —
  comportamento seguro, mas o cliente não recebe o pedido de "oi" enquanto
  isso. **PENDENTE-KAIRO**.
- **`present_two_paths`** (tool + componente) é do bloco-cards-ui, paralelo —
  referenciada só pelo nome (allowlist tolera até o merge do bloco irmão).
  Sem ele mergeado, a 3ª saída do lance chama uma tool que ainda não existe
  no registry — vai precisar de um ajuste de minutos pós-merge da onda (já
  avisado no `conflitos_esperados` do `_bloco.md`).
- **`monthlySavings`** — só o slot tipado em `QualifyAnswers`; captura por
  texto livre e consumo no motor de cálculo (âncora de dinheiro na agulha)
  ficam pro bloco-motor-calculo (PR8 da spec), fora do escopo deste bloco.
- Não validei manualmente no simulador (`/admin/simulator/whatsapp`) — a
  suíte é 100% determinística/unitária; QA de tela (Playwright real) da
  jornada completa pós-reorder fica pro acompanhamento (`qa-autonomo`/
  `qa-dono-produto`).
- `jornada-canonica.md` recebeu uma seção nova ("Refino Handoff 2026-07-09 —
  SUPERSEDE") + 2 pointers atualizados nas tabelas de auditoria antigas — não
  reescrevi o documento inteiro (risco desproporcional pro escopo deste
  bloco), então algumas linhas do "Mapa de divergências — auditoria
  2026-07-01" ainda citam a ordem pré-FIX-233 como histórico, não como
  estado atual (a seção SUPERSEDE deixa isso explícito).

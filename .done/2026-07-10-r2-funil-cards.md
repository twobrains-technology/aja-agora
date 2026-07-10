---
titulo: "Bloco r2 funil-cards — corrige gaps de FUNIL do veredito Fable r1 (3/10)"
data: 2026-07-10
bloco: bloco-r2-funil-cards
branch: fix/r2-funil-cards-consorcio
tipo: fix (rodada 2 do loop-de-goal — verificação independente Fable)
---

# Bloco r2 funil-cards — FIX-236..239

Rodada 2 do loop-de-goal contra o veredito independente do Fable r1
(`docs/correcoes/rodada2-fable/veredito-fable-r1.md`, nota 3/10). Corrige os 4
gaps de FUNIL priorizados (P0 x2, P1 x2) — cards/compliance ficaram no bloco
irmão `bloco-r2-valor-compliance`.

## TL;DR

- **FIX-236** — gate `lance` estava sendo pulado (ia direto pra
  `lance-embutido`). Causa raiz: `hasLance` era capturado de QUALQUER texto
  livre sem checar se o gate estava ativo — "não tenho grana agora"
  respondendo `timeframe` vazava `hasLance="no"` cedo demais, e depois
  bloqueava a recusa explícita real ("só a parcela"), repetindo a mesma
  bolha de educação de embutido em loop. Corrigido com snapshot do gate
  ativo antes do merge do turno.
- **FIX-237** — `present_embedded_bid`/`present_scarcity` eram ÓRFÃOS: tool,
  schema, allowlist e coerção server-side já existiam, mas ZERO directive
  instruía o modelo a chamá-las (0 de 3 cards do handoff apareciam).
  `buildEmbeddedBidDirective`/`buildScarcityDirective` novos, disparados nos
  pontos certos do funil.
- **FIX-238** — gate `desire` (não bloqueante) nunca perguntava nada na web —
  a pergunta ficava presa dentro do guard `if (data)` do emissor, que só
  emitia texto quando havia CARD (desire não tem card por design). Pergunta
  e card viram independentes; 2ª pergunta (motivação) ganha mecanismo de
  encadeamento próprio (`desireFollowUpSection`).
- **FIX-239** — `decision_prompt` disparava num elogio solto ANTES da
  qualificação pós-reveal estar completa (tool liberada só por FASE, nunca
  pelo estado); e um re-pedido em texto livre pós-decisão virava turno morto
  (guard suprimia o card duplicado mas o texto "deixa eu confirmar" já tinha
  saído). Nova regra `premature-decision` + roteamento determinístico de
  avanço direto pro passo 5.
- **Gate**: `pnpm test:unit` verde — 320 arquivos / 3010 testes — rodado
  repetidamente num workspace local bootstrapado (Postgres real via
  `~/.claude/skills/local-dev`).

## Commits

| Commit | O quê |
|---|---|
| `e8d46293` | fix: hasLance só captura no gate lance ativo, gate não é mais pulado (FIX-236) |
| `87b36fd7` | fix: aciona embedded_bid e scarcity via directive (FIX-237) |
| `3a0849a8` | fix: pergunta do gate desire deixa de ser engolida na web (FIX-238) |
| `9fbadb82` | fix: decision_prompt nao dispara prematuro + re-pedido nao vira turno morto (FIX-239) |

## Metodologia de teste

TDD strict em todo item — teste escrito e verificado FALHANDO antes da
correção (reproduzindo o cenário exato do veredito), depois corrigido até
passar. Duas classes de teste usadas, seguindo o padrão já estabelecido no
repo:
1. **Unitário puro** (vitest, mocks de `analyzeTurn`/DB) para lógica de merge
   de estado e directives.
2. **Source-level** (`readFileSync` + assertions sobre o código-fonte real de
   `route.ts`/`index.ts`) para travar que a WIRING (não só a função) existe
   no ponto certo do funil — mesmo padrão de `agent-trajectory.test.ts` e
   `decision-advancement.test.ts` já existentes no repo.

**Achados extras corrigidos no caminho** (erro visível, mesmo pré-existente —
CLAUDE.md): duas janelas de slice FIXAS em char em
`tests/regression/agent-trajectory.test.ts` (`FIX-118`, `FIX-38`) que meu
código/comentário legítimo estourou — trocadas por janela dinâmica até o
próximo bloco `if (action.gate ===`. Um teste pré-existente em
`artifact-guard.test.ts` ("PERMITE: primeiro decision_prompt") encodava a
premissa ERRADA que o FIX-239 corrige (decision_prompt sempre ok logo após o
reveal) — fixture atualizado pra qualificação completa, preservando a
intenção original do teste.

## Gap honesto: validação E2E ao vivo NÃO foi possível

A instrução do bloco pedia validação por condução E2E real via API (`POST
/api/chat`) contra a app rodando. Bootstrapei a stack local do workspace
(`~/.claude/skills/local-dev`, Postgres+Redis+App em containers,
`.env.local` com backfill de secrets do clone principal) e cheguei a montar
um driver Python (`scratchpad/conduz-jornada.py`) com CPF/celular de teste
reais (`secrets.sh decrypt contas-teste`). A condução falhou na primeira
chamada de LLM: `Error: invalid x-api-key`. Causa raiz confirmada nos logs do
container — o `ANTHROPIC_API_KEY` usado localmente é uma **virtual key do
LiteLLM gateway shared**, que só funciona roteada por `litellm-srv.tb.local`
(Cloud Map, rede interna AWS). Sem `LITELLM_SRV_NAME`/`LITELLM_BASE_URL`
configurado, o `gateway-anthropic.ts` cai no fallback de ir direto pra
`api.anthropic.com` — que rejeita a virtual key.

Alcançar `litellm-srv.tb.local` exigiria VPN/túnel pra dentro da VPC —
**não configurei isso**, por ser uma ação explicitamente vetada sem pedido
(CLAUDE.md: "VPN NUNCA no host sem pedido explícito... connection refused →
avise, não suba VPN por precaução"). A validação da wiring real (que os 4
fixes realmente disparam no ponto certo do funil, não só existem como
função) ficou então nos testes source-level descritos acima, que replicam
literalmente a lógica de despacho de `route.ts`/`index.ts` linha a linha —
mas isso não substitui ver o card de verdade no stream de uma conversa real.

**PENDENTE-KAIRO**: rodar `scratchpad/conduz-jornada.py` (ou repetir a
condução manual pelo chat web) com acesso ao gateway LiteLLM (VPN ou key
direta da Anthropic) pra confirmar visualmente: (1) o gate `lance` aparece
com o chip "Só a parcela, sem lance"; (2) `embedded_bid` aparece no gate
`lance-embutido`; (3) `scarcity` aparece antes do card de decisão; (4) a
pergunta "Qual carro você tem em mente?" sai logo após o nome.

## Gaps honestos / pendências

- Item acima (E2E ao vivo) é o principal gap desta rodada.
- `desireFollowUpSection` (2ª pergunta, motivação) depende do modelo conferir
  o próprio histórico pra não repetir (mesmo padrão já usado por
  `motivationMirrorSection`) — sem flag de estado dedicada. Se a robustez
  disso vazar em produção (LLM repetindo a pergunta), o próximo passo natural
  é promover pra uma flag determinística (`motivationAsked`), mas não criei
  isso preventivamente (YAGNI — o padrão espelhado já está em produção sem
  esse problema reportado).
- Não toquei no gap #10 (P3, higiene: contradição de emoji no
  `system-prompt.ts`, comentário stale em `contemplation-dial.ts:70`,
  exemplo genérico "R$ 100 mil" na educação de embutido) nem nos gaps de
  compliance/valor (#2, #7, #4, #9) — são do bloco irmão
  `bloco-r2-valor-compliance`.

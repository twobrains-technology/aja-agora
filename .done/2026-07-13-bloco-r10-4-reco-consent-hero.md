# Bloco r10-4 reco-consent-hero — FIX-308

## O que foi implementado

Root cause confirmada no dossiê real da Madalena: o hero (`recommendation_card`) aparecia 6 turnos
atrasado (turno 18 em vez de ~12), e o fecho (`contract_form`/`whatsapp_optin`) chegava a disparar
ANTES dele. Causa dupla:

1. **`nextGate()` (qualify-state.ts) acoplado a `recoConsentDispatched`, não a `recoConsentAnswered`**
   — a cascata avançava (timeframe → lance → decisão) assim que a pergunta "Posso te mostrar a opção
   que eu recomendo?" era DISPARADA, não quando era RESPONDIDA. Fix: acopla ao `recoConsentAnswered`
   real — mesmo padrão dos gates de coleta (credit/lance/lance-embutido), que também travam até o
   dado chegar. `decideShowGate` já evitava re-perguntar em pergunta/dúvida/off-topic, então o gate
   fica "parado, mas conversável" enquanto não resolve.
2. **`YES_TEXT_MARKERS` (orchestrator/index.ts) não reconhecia "pode mostrar"/"pode"/"mostra"/
   "mostrar"** — variantes comuns de aceite a um CONVITE. Adicionados ao regex; também passou a
   aceitar `intent==="ready_to_proceed"` como sinal de consentimento (cobre gírias que o regex não
   pega, mas o analyzer classifica com confiança).

## TDD (RED→GREEN provado)

- Teste de integração novo (`orchestrator/index.fix-308-reco-consent-hero.integration.test.ts`, DB
  real + LLM mockado) reproduz o cassette exato: reco-consent perguntado → "Pode mostrar" → hero
  NÃO liberava (RED, confirmado antes da mudança em `YES_TEXT_MARKERS`) → libera no turno seguinte
  (GREEN, após o regex). Mais 4 testes no mesmo arquivo: `ready_to_proceed` libera mesmo sem bater
  regex; cascata não avança pra timeframe/lance/decisão sem resposta clara; contract_form/
  whatsapp_optin nunca disparam antes do hero; regressão de "não"/hesitação não quebra (sem travar,
  sem crash, hero continua pendente).
- **Ripple de fixtures**: o acoplamento a `recoConsentAnswered` quebrou 19 arquivos de teste
  pré-existentes (todos usavam `recoConsentDispatched: true` sozinho como atalho pra "já passei do
  reco-consent" — comportamento antigo, agora incorreto). Todos corrigidos (adicionado
  `recoConsentAnswered: true` junto), incluindo `tests/regression/agent-trajectory.test.ts` (arquivo
  grande de regressão, 6 ocorrências).
- `pnpm test:unit` completo verde: **368 arquivos / 3404 testes**, zero regressão.
- Pre-commit Camada 3 (LLM real cirúrgico, `EVAL-SAVE-CONTACT-NAME-CIRURGICO` +
  `EVAL-ASSISTANT-LESS-FORMAL`) verde nos 2 commits de código.

## Infra usada (atrito real, documentado pra próximo bloco)

- DB do workspace: `aja_agora_ws_r10_4_reco_consent_hero` clonado de `aja_agora_template` (Postgres
  shared `aja-shared-pg`), acessível do host via `aja-shared-pg.orb.local:5432` — `.env.local`
  gerado pelo bootstrap apontava pro path legado (`localhost:5433`), corrigido manualmente.
- **Camada 3 (pre-commit) precisou de túnel** — ao contrário do bloco r10-3 (cujo `.done/` registra
  que a key do clone principal funcionava DIRETO): a key do clone principal e a do Secrets Manager
  (`aja-agora dev`) estavam **revogadas/rotacionadas** (401 `invalid x-api-key` direto na Anthropic
  real). Resolvido em 2 passos, com confirmação do Kairo antes de subir túnel:
  1. `scripts/tunnel-litellm.sh` (repo `twobrains-aws-platform`) + virtual key temporária gerada via
     `/key/generate` (admin, master key de `tb/shared/litellm/env`) — cobre o path que usa
     `createGatewayAnthropic()` (`EVAL-SAVE-CONTACT-NAME-CIRURGICO`).
  2. `EVAL-ASSISTANT-LESS-FORMAL` usa `createAnthropic()` DIRETO (bypassa o gateway por design) —
     precisou da key real que o PRÓPRIO gateway usa (`tb/shared/litellm/env` → `ANTHROPIC_API_KEY`),
     testada via curl antes de usar. `.env.local` final: `LITELLM_API_KEY` (virtual, temp, $2/1d) +
     `ANTHROPIC_API_KEY` (real, upstream) separados — `gateway-anthropic.ts` prefere `LITELLM_API_KEY`.
  3. Túnel derrubado ao final (`--stop`); virtual key temporária expira sozinha em 1 dia.

## Resumo final

- **Marcadores de "sim" adicionados a `YES_TEXT_MARKERS`:** `pode`, `mostra`, `mostrar` (mantidos os
  existentes: sim/quero/considero/considerar/pode ser/topo/bora/vamos/manda ver/isso mesmo/show/
  beleza/claro/positivo/certo/ok).
- **Sinal extra de consentimento:** `intent==="ready_to_proceed"` também libera o hero (bullet 3 da
  correção proposta do fix-card, "considerar").
- **Teste de regressão:** usuário responde "não" ou pede mais detalhes — hero fica pendente, sem
  crash, sem travar, conversa continua normalmente (LLM responde, gate não re-spamma card).
- **Caso de borda FORA do escopo:** um "não" EXPLÍCITO e claro ao convite não tem hoje um caminho
  determinístico pra AVANÇAR a cascata sem o hero (fica esperando indefinidamente, igual aos outros
  gates de coleta — não está em `STUCK_ESCAPE_GATES`). Isso é o comportamento correto pro caso comum
  (raramente alguém recusa ver a própria recomendação), mas se acontecer na prática, o usuário fica
  preso ali até dar algum sinal reconhecido como consentimento. Não adicionei escape automático
  porque não havia decisão de produto pra isso no card e envolveria decidir "o que assumir" ao
  declinar — trade-off de produto, não técnico.

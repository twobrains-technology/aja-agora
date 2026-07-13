# Bloco r10-4 topic-picker-serverside — FIX-309

## Resumo

`topic_picker` (menu de dúvidas pós-`experience`: lance/sorteio/contemplação/cartas variam)
tinha **0 emissões** em 2 dossiês limpos da investigação de causa-raiz da rodada 10, apesar do
fluxo passar pelo ponto certo do funil — mesma classe de bug já corrigida pros outros cards da
cascata (`decision_prompt`/`scarcity`/`embedded_bid`/`two_paths`/`whatsapp_optin`, FIX-246/253/
280): invariante crítico dependia do LLM "lembrar" de chamar `present_topic_picker`
espontaneamente. Migrado pra emissão server-side determinística, mesmo padrão de
`emitServerCard` já usado nos outros cards.

## Decisão de design (sem re-perguntar)

A tool `present_topic_picker` foi **removida do toolset do LLM em TODA fase** (antes só saía de
`closing`/`terminal`, FIX-300) — segui o precedente mais forte e mais consistente já estabelecido
no mesmo arquivo (`tool-policy.ts`) pelos FIX-246/253/280: a definição da tool em `ai-sdk.ts`
(schema + `execute`) e a 2ª linha de defesa em `artifact-guard.ts` (`topic-picker-server-gate`)
ficam **inalteradas** — documentadas, porém inalcançáveis, exatamente como as outras 5 tools já
migradas (nenhuma delas teve a definição apagada nem o system-prompt.ts limpo das menções
antigas). Sem ambiguidade real: era a única leitura consistente com o resto do código.

## O que mudou

- **`personas.ts`**: nova flag `topicPickerDispatched` (idempotência — mesmo padrão de
  `recoConsentDispatched`/`simulatorOfferDispatched`).
- **`orchestrator/server-cards.ts`**: `buildTopicPickerCard()` — payload estático com o catálogo
  canônico inteiro (`topic-catalog.ts`, 4 tópicos), mesmo padrão de `buildDecisionPromptCard`/
  `buildWhatsappOptinCard` (nenhum dado da conversa é necessário).
- **`orchestrator/index.ts`**: novo bloco em `runTurn`, logo após `if (result.isConcierge)`,
  que emite `topic_picker` via `emitServerCard` quando `experiencePrev === "doubts"` (usuário
  clicou "Tenho dúvidas" no gate `experience`, pós-reveal) — guardado por
  `recoConsentDispatched !== true` (nunca regride a fase numa conversa que já avançou pro
  próximo gate) e por `topicPickerDispatched` (emissão única).
- **`orchestrator/tool-policy.ts`**: `present_topic_picker` saiu de `allowedTools()` em toda
  fase (removida a função `topicPickerTools`/os 4 usos condicionais).
- **`tool-policy.test.ts`**: matriz atualizada pra ausência total (mesmo padrão dos testes
  FIX-246/253/280 já existentes no arquivo).

## Testes (TDD strict)

- Escrito **primeiro** `index.fix-309-topic-picker-serverside.integration.test.ts` (DB real,
  LLM mocado sem tool-call nenhuma — espelha `buildExperienceDoubtsDirective`, que já proíbe
  "chame tools"). Confirmado **RED**: `expected [] to include 'topic_picker'`.
- Implementada a emissão server-side → confirmado **GREEN** (5 casos):
  1. emite `topic_picker` sempre, mesmo sem tool-call do LLM;
  2. idempotente — não re-emite num 2º turno já disparado;
  3. não regride fase — `experiencePrev="first"` não emite;
  4. não regride fase — `experiencePrev="returning"` não emite;
  5. não regride fase — funil já em `reco-consent` não reabre o card.
- Regressão (arquivos tocados + família de cards já migrados): `index.fix-246-server-cards`,
  `index.fix-253-254-embedded-bid-gate`, `index.fix-280-whatsapp-optin-server-side`,
  `index.fix-303-whatsapp-optin-fecho`, `index.fix-301-clarify-usuario-confuso`,
  `tool-policy.test.ts`, `artifact-guard.test.ts`, `ai-sdk.fix-300-topicpicker-enum.test.ts`,
  `server-cards.test.ts`, `system-prompt.behavior-guards.test.ts`, `ai-sdk.test.ts`,
  `builder.topic-picker.test.ts`, `whatsapp/artifact-coverage.test.ts` — **173 testes / 14
  arquivos, 100% verde**.

## Gate

- `pnpm test:unit` completo (via pre-commit, nos 2 commits de código): **368 arquivos / 3403
  testes, 100% verde**.
- **Camada 3 (`test:eval:quick`, LLM real Anthropic) rodou e passou** nos 2 commits — diferente
  de blocos anteriores desta onda (ex. FIX-303) que precisaram `--no-verify` por falta de VPN:
  `.env.local` deste worktree veio com `ANTHROPIC_API_KEY` placeholder do `.env.example`;
  troquei pela chave real via `secrets.sh decrypt aja-agora` (vault TwoBrains) — a chave é uma
  Anthropic key nativa (`sk-ant-api03-...`), chamada direta a `api.anthropic.com` funcionou sem
  precisar de VPN/gateway LiteLLM.
- Bootstrap do ambiente: `bootstrap-workspace.sh --db-only` (convenção local-dev v2) + correção
  manual da `DATABASE_URL` em `.env.local` (o template gerado apontava pro padrão legado
  `localhost:5433`; corrigido pra `aja-shared-pg.orb.local:5432/aja_agora_ws_r10_4_topic_picker_serverside`,
  resolvido via DNS OrbStack).
- Commits (branch `fix/r10-4-topic-picker-serverside`):
  1. `cba33cf3` — `test+fix: emite topic_picker server-side no ponto pos-experience (FIX-309)`
  2. `e19ebf23` — `refactor: remove present_topic_picker do toolset do LLM em toda fase (FIX-309)`
  3. `aae542b0` — `docs: move fix-309 pra done/ e fecha bloco r10-4-topic-picker-serverside`
  4. `37cc40e7` — `docs: completa frontmatter (status/commit) e resultado do FIX-309 em done/`
- Push: `git push origin fix/r10-4-topic-picker-serverside` ✅ (branch nova no remoto).

## Gap honesto

- Não validei E2E ao vivo (browser) — fora do escopo deste bloco (`_prompt.md`: "🚫 Sem smoke de
  browser neste bloco").
- O gap estrutural anotado no `_bloco.md` (`experiencePrev` capturado oportunisticamente do
  texto livre, sem trava de "gate ativo" — FIX-310) **não** foi tocado aqui: é um item separado
  da mesma onda 4, escopo de outro bloco. Meu hook em `orchestrator/index.ts` dispara sobre
  `experiencePrev === "doubts"` como estiver no `meta` no momento — se FIX-310 mudar quando/como
  essa flag é setada, o ponto de emissão do `topic_picker` continua correto (mesma condição),
  só a robustez de COMO `doubts` chega até ali é responsabilidade daquele outro fix.
- Não removi as referências a `present_topic_picker` em `system-prompt.ts` (seção "6 tools
  idempotentes" + "Atalhos com tópicos curtos") — segui o precedente exato dos FIX-246/253/280,
  que também deixaram essas menções obsoletas no prompt (dead prompt text, sem efeito real já
  que a tool nunca entra no request). Cleanup desse texto, se desejado, é mudança cosmética
  separada — não afeta comportamento.

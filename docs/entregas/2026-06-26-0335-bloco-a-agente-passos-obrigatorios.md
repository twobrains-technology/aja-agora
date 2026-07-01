# Bloco A — Robustez do agente nos passos obrigatórios da jornada

**Data:** 2026-06-26 · **Branch:** `fix/agente-passos-obrigatorios` · **Onda:** 1
**Origem:** rodada de QA manual do Kairo (2026-06-25) na jornada chat/fechamento.

## O que estava quebrado (e por que importa)

Três falhas de comportamento NÃO-determinístico do agente — ele **pulava ou inventava
passos obrigatórios** da jornada. Duas tocavam a confiança do cliente direto na cara:

- **FIX-76 — o agente mentia.** Numa conversa retomada, ao pedir simular R$ 130.000 sobre
  um reveal antigo de R$ 256.000, ele dizia "estou com dificuldade em acessar os grupos" /
  "instabilidade nas buscas" **sem nunca ter tentado buscar** (zero tool, zero erro real) e
  oferecia o R$ 256.000 do histórico como "dados reais disponíveis". Duas mentiras numa
  frase só — e violação direta da regra inviolável **Bevi fonte única** (nenhum número
  exibido pode vir do histórico, só da busca real no turno).
- **FIX-78 — o cliente via menos do que deveria.** No reveal com 2+ grupos, o agente
  mostrava a proposta recomendada mas **dropava o carrossel comparativo** — o usuário
  perdia a etapa de comparar alternativas, o coração da decisão.
- **FIX-77 — ruído técnico + desperdício.** A cada turno o agente disparava um warning de
  segurança da AI SDK (system messages dentro de `messages`) e injetava a **memória Letta em
  dobro** no mesmo request — tokens jogados fora a cada interação.

## O que foi entregue

- **FIX-76:** REGRA DURA no prompt proíbe narrar falha de busca sem ter buscado e
  reapresentar valor do histórico como dado real; e o gate de busca volta a **forçar a
  descoberta** quando o usuário troca de faixa numa retomada (em vez de deixar o modelo
  livre pra alucinar). Reaproveita o sinal `revealValueTargetChanged` (FIX-68) — anti-loop
  de reveal preservado.
- **FIX-77:** systemContext + examplesBlock passam a entrar pelo caminho idiomático
  (`instructions`/`system`), o warning sumiu e a duplicação da memória Letta morreu. Prompt
  caching por bloco **intacto** (stable continua 1º item, byte-idêntico, único com
  ephemeral).
- **FIX-78:** REGRA DURA de inseparabilidade — no ramo 2+ grupos, `recommendation_card` e
  `comparison_table` andam sempre juntos; emitir um sem o outro é defeito.

## Qualidade — regressão de agente nas 3 camadas (obrigatória)

Cada bug ganhou Camada 1 (structural, lê a fonte de produção) + Camada 2 (cassette
determinístico com `MockLanguageModelV3`), conforme a regra inviolável do projeto.

| Item | Camada 1 (structural) | Camada 2 (cassette) |
|---|---|---|
| FIX-76 | `system-prompt.fix-76.test.ts` (regra anti-alucinação no prompt) + `qualify-state.fix76.test.ts` (gate reabre na troca de faixa, não na mesma) | `FIX-76-ALUCINA-FALHA-BUSCA` — detector pega a frase com `toolsCalled=[]` + assert do gate forçado |
| FIX-77 | `orchestrator/system-messages.fix-77.test.ts` (nenhum role:system em `messages`; builder anexa sem cacheControl; cache key com `ex-` hash; Letta sem duplicação) | `FIX-77-SYSTEM-IN-MESSAGES` — system em messages dispara o warning; via opção não |
| FIX-78 | `directives.fix-78.test.ts` (inseparabilidade no directive; ramo 1-grupo intacto) | `FIX-78-COMPARISON-DROPADO` — detector pega recommendation_card sem comparison_table |

**Validação:** suíte unit completa (Camadas 1+2) **1959 testes verdes**, rodada num
container transitório com store pnpm compartilhado + pg develop + bind-mount deste worktree
(host é pnpm-only, sem `node_modules`). Builder tests (prompt-cache) também verdes.

## Decisões de design (ADR `docs/correcoes/decisions/2026-06-25-bloco-a-agente-passos-obrigatorios.md`)

- **FIX-76:** prompt anti-alucinação **+** reabertura do gate via `revealValueTargetChanged`,
  em vez de só-prompt — o card pede a reabertura e o prompt sozinho deixa o agente livre pra
  mentir. Via sinal derivado (não reset de flag persistida) pra não dar efeito colateral nos
  gates downstream.
- **FIX-77:** Opção A (threadar pro builder) em vez de suprimir o warning com
  `allowSystemInMessages` — suprimir manteria a duplicação Letta e o uso não-idiomático.
- **FIX-78:** reforço de prompt em vez de injetar o `comparison_table` em runtime — injetar
  exigiria remontar o payload a partir do stub `DISCOVERY_NO_CONTEXT` do `recommend_groups`;
  fabricar número em runtime violaria Bevi fonte única.

## Gaps honestos

- **FIX-76/78 são defesas por prompt + cassette** (mesma natureza de todos os bugs de
  comportamento do agente no repo). A Camada 3 (eval LLM real nightly) é o teste de fundo
  que confirma o comportamento sob o modelo real — não foi adicionada aqui (é append
  opcional, não bloqueia merge). Recomendo um cenário de retomada-com-troca-de-faixa
  (FIX-76) e um de reveal multi-grupo (FIX-78) na próxima rodada de evals.
- **FIX-76 gate:** o cenário exato (retomada via Bevi real) não é reproduzível
  deterministicamente sem a Bevi; a correção foi validada pela suíte `qualify-state.*`
  inteira (zero regressão no anti BUG-REVEAL-LOOP) e pelos cassettes, não por E2E contra a
  Bevi.
- **Não validado em browser/E2E** (escopo do bloco é implement-only + push; a integração e o
  QA E2E são do orquestrador/Kairo).

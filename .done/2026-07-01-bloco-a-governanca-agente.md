# Bloco A — Governança determinística do agente (a cura da doença da Mirella)

> 2026-07-01 · branch `feat/governanca-agente` · FIX-181 + FIX-180 + FIX-182
> ADR: `docs/correcoes/decisions/2026-07-01-bloco-a-governanca-agente.md`

## O que estava quebrado (por que isso importa)

Na conversa real da Mirella (prod, conv 69a38af1), depois de ver o comparativo ela disse
"quero ver todos" — e o agente **saiu do trilho**: pulou pra simular, detalhar e propor
decisão sobre um plano ("Embracon") que **nunca apareceu na tela dela**. Pior: não dava pra
provar se "Embracon" era um grupo real da Bevi ou um nome inventado pelo modelo, porque o
sistema **não guardava o que cada ferramenta recebeu e devolveu**. Num produto onde confiança
é o produto, "a IA inventou ou não?" não pode ficar sem resposta.

Este bloco é a **resposta arquitetural** — não mais um remendo, mas governança de verdade,
seguindo as 6 leis de arquitetura de IA e usando os primitivos NATIVOS do SDK (confirmados na
doc oficial, não de memória).

## O que foi entregue

### FIX-181 — Caixa-preta do agente (observabilidade de tool I/O)
Agora **todo argumento e todo resultado de cada ferramenta** é registrado (log estruturado,
ligado à conversa), com CPF/celular/e-mail/documentos **mascarados** (LGPD). A pergunta "a IA
pegou de dado real ou confabulou?" passou de **impossível** para **respondível em segundos**.
Usa o primitivo nativo `onStepFinish` do AI SDK 6.

### FIX-180 — A allowlist estado→ação→precondição (o coração)
A governança da metade de trás da jornada virou uma **lista de permissões positiva** em vez de
uma lista reativa de proibições (que, por construção, está sempre a um bug do próximo susto).
Uma tabela declarativa (`action-policy.ts`) diz: uma ferramenta de risco (simular/detalhar/
propor decisão) **só age sobre um grupo/plano que o usuário viu na tela**. O que antes era um
remendo pontual (FIX-179) virou princípio. Reforçado pelo primitivo nativo `prepareStep.activeTools`.
Resultado: **é impossível** o agente decidir sobre um plano-fantasma — não "improvável".

### FIX-182 — Fim da sopa de frases
As narrações de passos internos (que se colavam numa mensagem ilegível em turnos de várias
etapas) agora ficam separadas em parágrafos. Correção cirúrgica, zero risco de falso-positivo
em texto legítimo.

## Decisões de design (decidi X em vez de Y porque Z)

- Decidi **allowlist declarativa (action-policy.ts) como cura** em vez de mais um guard reativo, porque blocklist é incompleta por construção (Lei 2) — a positiva é completa por construção.
- Decidi **adoção incremental do `prepareStep.activeTools` (belt) mantendo o filtro build-time** em vez de migração big-bang, porque o big-bang complica a chave de cache de agents e arrisca expor ferramenta se o prepareStep falhar; o incremental adota o primitivo nativo sem esse risco.
- Decidi **reclassificar o artifact-guard como 2ª linha documentada** em vez de rasgá-lo, porque single-option e reveal-loop são genuinamente pós-fato (dependem do resultado da ferramenta no turno) e removê-los regrediria 6 famílias de bug de prod.
- Decidi **manter as 4 fases (não sub-fasear `reveal`)** porque o eixo certo pro bug é a precondição sobre DADO ("o grupo foi exibido?"), não sub-estados — sub-fasear seria complexidade especulativa.
- Decidi **NÃO adotar `experimental_repairToolCall`** (que o card sugeria) porque, verificado na doc, ele só dispara em erro de PARSE (nome/schema inválido), nunca num retorno `{error}` da precondição; o padrão que já usamos (devolver diretiva acionável no tool-result) é superior — zero round-trip extra.
- Decidi **mascarar PII por chave + por padrão (regex)** no log em vez de só por chave, porque args de ferramentas têm shapes variados e um CPF/telefone pode aparecer sob chave não-óbvia (ex.: `reason` de handoff).

## Primitivos AI SDK 6 confirmados na doc oficial (context7, `ai@^6.0.158`)

- `prepareStep` — setting do construtor do `ToolLoopAgent`; `({ stepNumber, steps, messages }) → { activeTools, toolChoice, ... }`. `activeTools` restringe as ferramentas por step. (loop-control)
- `onStepFinish` — opção de chamada de `agent.stream()`/`.generate()`; recebe `{ stepNumber, text, toolCalls, toolResults, ... }`. `toolCalls`=args, `toolResults`=output.
- `experimental_repairToolCall` — setting do construtor; só dispara em `NoSuchToolError | InvalidToolInputError` (parse). **Avaliado e NÃO adotado** (não encaixa na precondição).
- **Correção de premissa:** o `_prompt`/`_bloco` diziam que o projeto usa `streamText` cru em `runner.ts`. Verifiquei: usa **`ToolLoopAgent`** (builder.ts) e `agent.stream()` (runner.ts). Registrado no ADR pro orquestrador não propagar o erro.

## Testes (3 camadas do projeto)

- **Camada 1 (structural):** `action-policy.test.ts` (tabela nega ação sobre grupo não-exibido); `tool-io-log.test.ts` (masker + log estruturado, PII mascarada); asserts no source do runner/builder/ai-sdk.
- **Camada 2 (cassettes em `agent-trajectory.test.ts`):** reproduz o turno "quero ver todos" da Mirella e prova que as 3 ações são BLOQUEADAS sobre grupo não-exibido; cassette multi-step (MockLanguageModelV3) provando ids de bloco distintos por step (FIX-182).
- **TDD strict:** cada item viu o teste FALHAR antes do fix (RED→GREEN registrado).
- **FIX-179 NÃO regride** — integration + shown-groups verdes após a migração pra tabela.

## Gate (rodado em container transitório com pg dedicado migrado)

- ✅ `pnpm test:unit` — **230 arquivos, 0 falhas** (é o gate do merge-wave).
- ✅ `pnpm build` — **EXIT 0** (typecheck completo + Next build; meu código compila limpo).
- ✅ Integração do meu escopo — FIX-179 integration, builder (prepareStep), artifact-guard: **40 verdes**.

## Gaps / PENDENTE-KAIRO

- **3 falhas de integração PRÉ-EXISTENTES (não introduzidas por este bloco, fora do escopo):**
  - `route.admin-message-persistence.test.ts` (2) — falha **idêntica na base** (4a80a642), sem
    minhas mudanças. Bug de contrato do BUG-ADMIN-MESSAGE-MISSING (rota/persistência), fora do
    escopo_arquivos deste bloco.
  - `resolve.integration.test.ts` (1, FIX-42 backfill dedup de contatos) — falha isolada com DB
    limpo; nenhum commit deste bloco toca `contacts/resolve`. Provavelmente território do
    `bloco-c-frontend-e-flaky`.
  - Não corrigidas de propósito: são de outro escopo/bloco; corrigi-las aqui seria scope-creep
    com risco de conflito. Deixo diagnosticadas pro orquestrador/bloco-c.
- **UX de "ver mais opções"** (roteamento do intent `wants_more_options`) é do **bloco-b** (FIX-183)
  e depende do aval do Bernardo sobre o FIX-96 (hero+5). Este bloco só garante que, sem grupo
  escolhido, o agente **não consegue** decidir/simular sobre grupo não-exibido (a trava).

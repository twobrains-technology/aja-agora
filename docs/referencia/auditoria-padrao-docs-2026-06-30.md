# Auditoria de documentação × padrão `padrao-de-docs` — Aja Agora

> **Data:** 2026-06-30 · **Branch:** `feat/auditoria-reorganizacao-de-docs-no-padrao-padrao-d`
> **Referência:** skill `padrao-de-docs` (mapa dos 2 mundos `docs/` durável × `.processo/` efêmero;
> templates em `~/.claude/skills/padrao-de-docs/templates/`).
> **Escopo:** só estrutura/local/formato — nenhum conteúdo técnico de doc foi alterado.

---

## 1. Método

1. Inventário de toda doc versionada (`*.md`, dotfolders, planos) — 308 arquivos `.md` trackeados.
2. Cruzamento de cada doc/pasta com o **mapa canônico** da skill (que doc é → onde vive).
3. **Análise de acoplamento** antes de mover: para cada pasta candidata, mediu-se quantas
   referências em código de produção (`src/`, `tests/`), em configs e no ecossistema externo
   (hook do ClaudeNotch) quebrariam — porque mover path cravado em runtime/regra é defeito, não arrumação.
4. Reorganização via `scripts/reorganizar.sh` (git mv, preserva histórico) — **nunca movendo pasta na mão**.
5. Conserto na fonte dos atritos achados (script incompleto + leitor hardcoded desatualizado).

---

## 2. Não-conformidades encontradas

| # | Item (antes) | Tipo de desvio | Destino canônico |
|---|---|---|---|
| 1 | `.done/` | Entregas em dotfolder fora de `docs/` | `docs/entregas/` |
| 2 | `.qa-loop/` | Processo efêmero (ledgers QA) na raiz | `.processo/qa/` |
| 3 | `.planning/` | Processo de planejamento (GSD) na raiz | `.processo/planning/` |
| 4 | `docs/superpowers/specs/` | Spec de design fora de `design/` | `docs/design/specs/` |
| 5 | `docs/superpowers/plans/` | Plano fora de `design/` | `docs/design/planos/` |
| 6 | `docs/specs/` | Specs soltas sem o `design/` | `docs/design/specs/` |
| 7 | `docs/decisions/` | Decisão/ADR em inglês fora de `decisoes/` | `docs/decisoes/` |
| 8 | `docs/correcoes/decisions/` | ADRs de bloco fora da taxonomia de decisões | `docs/decisoes/blocos/` |
| 9 | `CONTEXT.md` (raiz) | Glossário de domínio na raiz do repo | `docs/referencia/CONTEXT.md` |
| 10 | `docs/agent-eval-*.md` (3) | Guias temáticos soltos no topo de `docs/` | `docs/referencia/` |
| 11 | `docs/qa-suggestions.md` | Observações de QA soltas no topo de `docs/` | `docs/referencia/` |
| 12 | `docs/test-plan-letta-memory-{PO,QA}.md` | Planos de teste soltos no topo de `docs/` | `docs/test-plans/` |
| 13 | (ausência) `docs/README.md` | Faltava o MAPA da documentação | gerado pelo script |

**Atritos de FONTE corrigidos durante a auditoria** (regra "conserte o atrito na fonte"):

- **A.** `reorganizar.sh` não cobria 4 mapeamentos canônicos recorrentes → adicionados ao `DIR_MAP`/`FILE_MAP`
  (`docs/specs`, `docs/plans`, `docs/decisions`, `.planning`, `CONTEXT.md`). Inócuos por guard `[ -d ]`/`[ -f ]`.
- **B.** `qa-autonomo/scripts/anchor.sh` contava `.done/*.md` hardcoded → atualizado para contar
  `docs/entregas/` + `.done/` (legado), senão zeraria após a migração.

---

## 3. Antes → Depois (estrutura)

### Antes (raiz poluída, vocabulário misto)
```
.away/ .done/ .qa-loop/ .planning/   CONTEXT.md
docs/
├── jornada/  decisions/  specs/  superpowers/{specs,plans}/  visao/  integracoes/  test-plans/
├── correcoes/{inbox,todo,done,decisions}/  +  atas soltas
└── agent-eval-*.md  qa-suggestions.md  test-plan-letta-*.md   (soltos no topo)
```

### Depois (2 mundos, vocabulário canônico)
```
docs/                              🟦 PRODUTO (durável)
├── README.md                      ← MAPA (gerado)
├── jornadas? → jornada/           ← MANTIDO (exceção, ver §5)
├── decisoes/{,blocos/}            ← +1 ADR avulso + 8 ADRs de bloco
├── design/{specs,planos}/         ← specs + superpowers + docs/specs unificados
├── entregas/                      ← 23 entregas (ex-.done)
├── correcoes/{inbox,todo,done}/   ← já canônico (decisions/ saiu p/ decisoes/blocos)
├── referencia/                    ← CONTEXT.md + agent-eval-* + qa-suggestions
├── test-plans/  visao/  integracoes/   ← MANTIDOS (exceções, ver §5)
└── (raiz limpa: só README.md)
.processo/                         🟨 PROCESSO (efêmero)
├── qa/        ← 13 (ex-.qa-loop)
└── planning/  ← 95 (ex-.planning, GSD concluído)
.away/                             ← MANTIDO (lido hardcoded pelo notch, ver §5)
```

**Movimentos:** 158 renames via `git mv` (histórico preservado) + `docs/README.md` gerado +
15 arquivos de código/processo ativo com ponteiros de path atualizados.

---

## 4. Atualização de ponteiros (refs que apontavam para paths movidos)

Refs em **código ativo** e **processo ativo** foram corrigidas (ponteiro quebrado = defeito):

- `docs/correcoes/decisions/` → `docs/decisoes/blocos/`: 9 comentários em `src/`+`tests/`
  (`mesa/handoff.ts`, `validations/mesa.ts`, `whatsapp/mesa/{routing,outbound}.ts`,
  `agent/mesa-copilot/system-prompt.ts`, `agent/qualify-config.test.ts`, `chat/resume.meaningful.test.ts`,
  `regression/agent-trajectory.test.ts`) + 6 ocorrências em prompts/cards de **blocos TODO abertos**.
- `docs/specs/` → `docs/design/specs/`: 1 comentário (`src/lib/utils/simulator-clock.ts`).

**Histórico datado NÃO foi reescrito** (registros imutáveis da época): diários `.away/`,
ledgers `.processo/qa/`, entregas `docs/entregas/` e cards `docs/correcoes/done/` mantêm os
paths que existiam quando foram escritos — reescrever falsificaria o registro.

---

## 5. Exceções conscientes (o que foi MANTIDO de propósito)

Nem todo desvio do vocabulário deve virar movimento: quando o path está cravado em runtime,
em código de produção ou numa regra inviolável, mover é mais defeito que arrumação.

| Item mantido | Por quê | Evidência |
|---|---|---|
| **`.away/`** | Lido **hardcoded** pelo hook do ClaudeNotch a cada evento — mover cega o modo autônomo/notificações | `~/.claude/hooks/autonomous.py` (`find_latest_away`, `read_away`). Por isso `--keep-away`. |
| **`docs/jornada/`** | Path cravado na **REGRA INVIOLÁVEL** do `CLAUDE.md` do projeto + `docker-compose.yml:143` + testes. Hierarquia: instrução do projeto > padrão global. Renomear p/ `jornadas/` seria cosmético de alto risco. | `CLAUDE.md:20,23`; `docker-compose.yml:143`; `tests/regression/agent-trajectory.test.ts`; `tests/helpers/mock-proposal-gateway.ts` |
| **`docs/integracoes/`** | `docs/integracoes/assets/segmentos/*/offers.json` é **carregado em runtime** por teste — mover **quebra a suíte** | `src/lib/adapters/bevi/offer-mapper.test.ts:16` (`resolve(process.cwd(), 'docs/integracoes/...')`) |
| **`docs/visao/`** | 17 referências em **código de produção** (specs da Mesa de Operação) | `src/app/api/admin/leads/[id]/transbordo/route.ts`, `src/lib/mesa/*`, etc. |
| **`docs/test-plans/`** | **Convenção explícita** do `CLAUDE.md` do projeto ("Salvar em `docs/test-plans/<slug>.md`") | `CLAUDE.md:204,223` |
| **`docs/correcoes/{inbox,todo,done}/` + atas** | Já é exatamente o padrão canônico; atas soltas são legitimadas pelo próprio `README.md` da pasta | `docs/correcoes/README.md` |
| **`src/lib/agent/HARD_RULES.md`** | Doc técnica acoplada ao código — fica junto da fonte | — |

---

## 6. Caminho aberto (passo 2 opcional, se o Kairo quiser purismo total)

Para alinhar 100% ao vocabulário (custo: tocar regra inviolável + suíte), seria preciso, **com aval**:

1. `docs/jornada/` → `docs/jornadas/` **e** atualizar a regra inviolável do `CLAUDE.md`, o
   `docker-compose.yml` e ~30 refs em docs/testes.
2. `docs/integracoes/` → `docs/referencia/integracoes/` **e** ajustar o path de runtime em
   `offer-mapper.test.ts` (+ revalidar a suíte de adapters).
3. `docs/visao/` → `docs/referencia/visao/` **e** atualizar os 17 ponteiros em `src/`.
4. `docs/test-plans/` → reconciliar a convenção do projeto com o padrão global (decisão de produto).

Nenhum desses foi feito por padrão por ter **blast radius alto** (regra: deixa pronto + reporta, não força).

---

## 7. Observação para as skills geradoras

A skill **`todo-blocks`** ainda grava ADRs de bloco em `docs/correcoes/decisions/`, enquanto o
padrão canônico (e agora este repo) usa `docs/decisoes/blocos/`. Os prompts dos blocos TODO
abertos já foram atualizados para o path novo; convém alinhar a skill na fonte numa próxima passada
para não recriar o path legado.

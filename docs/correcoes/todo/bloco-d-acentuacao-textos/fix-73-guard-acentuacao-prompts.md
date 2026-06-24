---
id: FIX-73
titulo: "Estender o guard de acentuação para cobrir prompts .ts + ampliar blocklist (teste-primeiro)"
status: todo
bloco: bloco-d-acentuacao-textos
arquivos:
  - src/lib/agent/system-prompt.acentuacao.test.ts
rodada: 2026-06-24 — pedido por voz do Kairo (revisar/garantir acentuação de todos os textos da plataforma)
---

## Palavras do operador
> "corrigir e revisar todos os textos da plataforma para que garanta que todos
> os textos possíveis tenham acentuação" · "sempre que fizer uma página, a
> página tem que estar com o português correto"

## Cenário exato
O guard atual (`src/lib/agent/system-prompt.acentuacao.test.ts`) só varre arquivos
`.tsx` (texto JSX entre `>` e `<`) com uma blocklist de ~20 palavras. Por isso:
- Não enxerga os **prompts do agente em `.ts`** (`system-prompt.ts`,
  `turn-analyzer.ts`, `insights-prompt.ts`, `mesa-copilot/system-prompt.ts`,
  `directives.ts`) — onde está a maior massa de erros (300+ em `system-prompt.ts`).
- A blocklist não inclui `visao`, `conversao`, `operacao`, `decisao`, `opcao`,
  `numero`, `historico`, `orcamento`, `imovel`, `automatico`, `possivel`,
  `tambem`, `sao` (verbo), `esta` (verbo) — palavras que aparecem sem acento na
  admin UI e nos prompts.

## Root cause investigado (provado)
- `system-prompt.acentuacao.test.ts` L24-62: glob só `**/*.tsx` (exclui `.test.tsx`),
  padrão `>[^<>{}]*\b(palavra)\b[^<>{}]*<` — cobre só JSX text, não template
  literals de `.ts` nem atributos.
- Camada 1 (L16-22) já importa `SYSTEM_PROMPT`/`SPECIALIST_BASE_PROMPT` e checa
  que **instruem** acentuação — mas não checa que o próprio corpo está acentuado.

## Correção proposta
| O quê | Onde |
|---|---|
| Adicionar um bloco de teste que **importa os prompts como string** (`SYSTEM_PROMPT`, `SPECIALIST_BASE_PROMPT`, prompt do `turn-analyzer`, `insights-prompt`, `mesa-copilot`, `directives`) e assertam que NENHUMA palavra da blocklist aparece como palavra inteira (word-boundary, case-insensitive) | `system-prompt.acentuacao.test.ts` |
| Ampliar a blocklist com as palavras faltantes (visao, conversao, operacao, decisao, opcao, numero, historico, orcamento, possivel, tambem, sao/esta como verbo só se viável sem falso-positivo) | mesmo arquivo |
| Manter o varredor `.tsx` existente, só ampliando a blocklist comum | mesmo arquivo |
| Em caso de marcador legítimo que NÃO pode ter acento (literal parseado pelo código), permitir uma allowlist explícita e COMENTADA no teste (com o porquê) — exceção, não regra | mesmo arquivo |

**Importar o valor do prompt e varrer a string** é mais robusto que varrer o
arquivo `.ts` cru (evita falso-positivo em identificadores/código). Ao varrer a
string do prompt, use word-boundary nas palavras PT da blocklist (não casa com
identificadores em inglês nem com `snake_case` de tools).

## Regressão exigida (Camada 1 — estrutural)
Este item **É** a regressão: o próprio guard estendido. Ordem TDD:
1. Estender o teste/blocklist.
2. Rodar `pnpm test:unit` (ou só este arquivo) e **VER FALHAR** listando os
   offenders reais (vai apontar `system-prompt.ts` etc.).
3. (FIX-74/75 corrigem os offenders.)
4. Rodar de novo e **VER VERDE**.

Sem cassette de Camada 2 aqui: é guard estrutural de texto, não comportamento
não-determinístico do agente (CLAUDE.md: typo/copy → Camada 1 basta).

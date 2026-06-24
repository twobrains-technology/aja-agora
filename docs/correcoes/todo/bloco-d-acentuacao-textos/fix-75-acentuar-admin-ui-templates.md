---
id: FIX-75
titulo: "Acentuar admin UI (.tsx) + sweep de artifacts/templates voltados ao usuário"
status: todo
bloco: bloco-d-acentuacao-textos
arquivos:
  - src/app/admin/(dashboard)/page.tsx
  - src/components/admin/dashboard/funnel-chart.tsx
  - src/components/admin/dashboard/kpi-cards.tsx
  - src/components/shadcn-studio/blocks/login-page-03/login-page-03.tsx
  - src/components/chat/artifacts
  - src/lib/whatsapp/formatter.ts
  - src/lib/email/templates/invite.ts
rodada: 2026-06-24 — pedido por voz do Kairo
---

## Palavras do operador
> "corrigir e revisar todos os textos da plataforma"

## Cenário exato
Texto voltado ao operador/usuário sem acento, fora do alcance do guard .tsx atual:
- `src/app/admin/(dashboard)/page.tsx` L94 "Visao geral do funil de vendas";
  L111 "Funil de Conversao".
- `src/components/admin/dashboard/funnel-chart.tsx` L22 "Funil de Conversao".
- `src/components/admin/dashboard/kpi-cards.tsx` L86 "Taxa de Conversao".
- `src/components/shadcn-studio/blocks/login-page-03/login-page-03.tsx` L31
  "Painel de vendas inteligente para a sua operacao de consorcio."

## Root cause investigado (provado)
"visao"/"conversao"/"operacao" não estão na blocklist do guard, e o padrão dele
casa só texto JSX direto entre tags — não pega atributos/expressões. Strings de
componente ficaram sem acento e ninguém barrou.

## Correção proposta
| O quê | Onde |
|---|---|
| "Visao geral" → "Visão geral"; "Conversao" → "Conversão"; "Taxa de Conversao" → "Taxa de Conversão" | page.tsx, funnel-chart.tsx, kpi-cards.tsx |
| "operacao de consorcio" → "operação de consórcio" | login-page-03.tsx |
| **Sweep**: rodar o guard ampliado (FIX-73) e varrer `src/components/chat/artifacts/`, `src/lib/whatsapp/formatter.ts`, `src/lib/email/templates/invite.ts` e qualquer outro texto PT-BR voltado ao usuário; acentuar o que aparecer | conforme achados |

### Linha vermelha
- **NÃO** renomear identificadores: `computeConversaoDimension`/`scoreConversao`
  em `src/lib/eval/scorer-internals.ts` são CÓDIGO, não texto — fora de escopo.
- Só diacrítico/ortografia; não reescrever copy (isso é do bloco-c, dormente).
- Mensagens de erro de API (`src/app/api/admin/attendants/...`) voltadas ao
  cliente: acentuar o texto PT-BR exibido; preservar códigos/strings técnicas.

## Regressão exigida (Camada 1)
- Guard ampliado do FIX-73 verde cobrindo .tsx (admin) — sem offenders.
- `pnpm typecheck` verde (Next/Image e tipos intactos).
- Para copy de admin é typo de copy → Camada 1 basta (CLAUDE.md). Sem cassette.

---
id: FIX-402
titulo: "Tags de anúncio não rodam no painel: a trava por rota, ao lado da trava de iframe"
status: done
executado_em: 2026-09-29
bloco: pendencias-regua-ab-pixel
arquivos:
  - src/components/analytics/analytics-scripts.tsx
  - src/components/analytics/analytics-scripts.test.tsx
rodada: 2026-09-29
---
## Palavras do operador
Item 4 do PRD `docs/design/planos/2026-09-29-pendencias-regua-ab-pixel.md`: *"o Pixel no `/admin`"*.
A pergunta era "a confirmar" — e a resposta medida é que **confirma**.

## Cenário exato (medido em 29/09)
`src/app/layout.tsx:73` monta `AnalyticsScripts` no layout **raiz**, que é o mesmo dos dois mundos: a
landing/chat e o painel. A única trava que existia era `ehJanelaDeTopo()`, que pega o iframe — e ela
não pega a equipe **navegando** no `/admin`. Abrir qualquer tela do painel (pipeline, mapa de calor, o
próprio login) disparava GTM, GA4 e `fbq('track','PageView')`.

## Root cause
`AnalyticsScripts` não pergunta pela rota. A trava que existia protegia contra o **embed** (a landing
dentro do `visor-do-mapa.tsx`, defeito medido em 18/08), não contra a **navegação da equipe**. São o
mesmo mal — PageView interno virando sinal da campanha — atacado por dois caminhos diferentes.

## Correção
| O quê | Onde |
|---|---|
| `usePathname()` e a trava por rota: caminho começando por `/admin` (inclui `/admin/login`) não renderiza tag NENHUMA | `analytics-scripts.tsx` |
| Hook sempre chamado antes das travas (a ordem não pode variar entre renders) | `analytics-scripts.tsx` |
| Comentário no cabeçalho, no mesmo tom da trava de iframe, com o porquê de negócio | `analytics-scripts.tsx` |
| Fora do painel: GTM/GA4 em `lazyOnload` e Pixel em `afterInteractive` seguem intactos | não mudou |

A trava fica no componente da raiz, e não em cada página do painel, pela mesma razão da trava de
iframe: a próxima tela do `/admin` já nasce protegida, sem precisar lembrar deste detalhe.

## Regressão exigida (e entregue)
`src/components/analytics/analytics-scripts.test.tsx`, com `next/navigation` mockado por rota:

- `/admin/pipeline` e `/admin/login` → **zero** `[data-tag]`;
- `/` e `/chat`, janela de topo e `NEXT_PUBLIC_META_PIXEL_ID` definido → `meta-pixel` presente com
  `afterInteractive` (via `vi.stubEnv` + `vi.resetModules` + import dinâmico — a env é lida no load do
  módulo);
- os casos que já existiam (iframe; GTM/GA4 em `lazyOnload`; Pixel não adiado) continuam verdes.

## Validação
`pnpm -s vitest run src/components/analytics/analytics-scripts.test.tsx src/lib/admin/remarketing-config.test.ts src/lib/remarketing/`
→ **9 arquivos, 189 testes, verdes**. `pnpm -s typecheck` limpo. `biome check` limpo nos arquivos tocados.

## O que NÃO muda
O Pixel na landing e no chat (`afterInteractive`, `fbq('init')` + `PageView`), a trava de iframe, e
nenhum arquivo de `src/app/api/**`, `src/app/admin/**` ou `src/app/layout.tsx`.
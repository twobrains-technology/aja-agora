---
id: FIX-401
titulo: "O resultado do A/B do telefone na tela — lado a lado, com a meta de 30 por variante"
status: done
commit: ba909842
executado_em: 2026-09-29
bloco: bloco-telefone-ab
rodada: 2026-09-29
arquivos:
  - src/components/admin/performance/teste-do-telefone.tsx
  - src/components/admin/performance/teste-do-telefone-leitura.ts
  - src/components/admin/performance/
  - src/app/admin/(dashboard)/performance/page.tsx
  - src/app/api/admin/performance/telefone-ab/route.ts
---
## Palavras do operador
Kairo, 29/09/2026 12:13:46: *"O melhor jeito de a gente validar isso vai ser realmente com essa
metrificação. A gente imagina que são três possibilidades aqui. Vamos tirar as três então. Qual foi
melhor?"* — e a condição dele (12:15): sem número confiável, A/B com pouca gente é viés.

## Cenário exato
O endpoint `GET /api/admin/performance/telefone-ab` (FIX-397) devolve o resultado por variante e **não
tem consumidor**: o dado estava pronto e o dono não tinha onde ler. No dia 01/10, "qual caminho foi
melhor?" não teria resposta na tela.

## Root cause
Faltava o bloco que desenha a leitura. O dado existia; a tela, não.

## Correção proposta
| O quê | Onde |
|---|---|
| Card com as duas variantes **lado a lado** (B e C): visitas, telefones, chegaram à comparação e taxa de telefone | `teste-do-telefone.tsx` |
| A régua da leitura (formatação, meta, "não calculável") **pura**, testável sem React | `teste-do-telefone-leitura.ts` |
| Montado em `/admin/performance` com **o mesmo período** da página (`from`/`to` do `DateRangeFilter`, via `useQueryState`) | `performance/page.tsx` |
| Meta **≥30 por variante** por **rótulo** ("meta atingida" / "faltam N"), com ícone + cor de reforço — nunca só a cor | `teste-do-telefone.tsx` |
| `null` ⇒ **"não calculável"** em cada linha e no selo; total `null` idem. Nunca `0`, `0%` ou `NaN` | `teste-do-telefone-leitura.ts` |
| Cabeçalho alinhado ao código (aceita `attendant`, como a rota irmã `/api/admin/performance`) e aviso "o bloco NÃO desenha a tela" removido — agora tem tela | `route.ts` (só comentário) |

**Nada dispara para a Meta:** o card é `fetch` de leitura no endpoint que já existe. Sem pixel, sem
evento de conversão, sem `src/lib/conversions/*`. E **não declara vencedor**: mostra os dois lados e a
meta; a conclusão é de quem lê, com o tamanho da amostra na frente.

## Divergência PRD × código (decidida pelo código)
O PRD escreve `?de=&ate=`. O código usa `periodoDaRequisicao(request)`, que lê **`?from=&to=`** (ISO) —
é o que o `DateRangeFilter` escreve e o que a página já manda para `/api/admin/performance`. O card usa
`from`/`to`.

## Regressão exigida
- `teste-do-telefone.na-tela.test.tsx`: variante com `null` mostra "não calculável" e **nenhum dígito**
  naquele lado (`colunaC.textContent` não casa `/[0-9]/`), enquanto o outro lado mantém os números; B com
  31 → "meta atingida" e C com 12 → "faltam 18"; taxa `0.25` → `25%`; total `null` → "não calculável"; a
  chamada bate `/api/admin/performance/telefone-ab` com `from`/`to` ISO do período da tela.
- `teste-do-telefone-leitura.test.ts`: a parte pura — ausência × zero de verdade (`0` de telefone com
  visita presente é zero, não ausência), rótulo da meta e vírgula decimal (`0.256` → `25,6%`).

## Verificação (na lane)
```
pnpm -s vitest run src/components/admin/performance/teste-do-telefone   → 12 passed (2 files)
pnpm -s vitest run src/components/admin/performance                      → 37 passed (6 files)
pnpm -s typecheck                                                        → limpo
grep -n "telefone-ab" page.tsx teste-do-telefone.tsx                     → página e card consomem o endpoint
! grep -rnE "fbq|lib/conversions" src/components/admin/performance/teste-do-telefone*  → vazio
git diff ...telefone-ab/route.ts | grep -E "^[+-][^+-]" | grep -vE "^[+-]\s*(\*|//)"   → vazio (só comentário)
```
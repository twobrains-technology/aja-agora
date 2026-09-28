---
id: FIX-383
titulo: "A exportação leva o filtro da tela"
status: done
bloco: bloco-percurso9
arquivos:
  - src/lib/exportacao/index.ts
  - src/lib/exportacao/tipos.ts
  - src/lib/exportacao/percurso.ts
  - src/app/admin/(dashboard)/exportacao/page.tsx
  - src/app/api/admin/exportacao/[tipo]/route.ts
  - src/app/api/admin/exportacao/route.ts
rodada: 2026-09-28
commit: 0c521525
executado_em: 2026-09-28
---
## Palavras do operador
Bruna, 23/09: *"Só preciso ter um diagnóstico por etapa"* — ela exporta e leva para o Edu e o BC. Se a
lista está filtrada e a exportação não leva o filtro, o arquivo responde por OUTRO recorte.

## Cenário exato
`OpcoesDeExportacao` (`src/lib/exportacao/index.ts:22-28`) só tem `de`, `ate` e `mascarar`; a tela monta
o link apenas com `from`/`to`/`formato`/`completo` (`exportacao/page.tsx:98-110`). Exportar com um
degrau selecionado devolve TODOS os degraus.

## Root cause
O recorte da tela nunca viajou para a exportação: não há campo no contrato nem parâmetro na rota.

## Correção proposta
| O quê | Onde |
|---|---|
| `OpcoesDeExportacao` ganha `passo`/`modo` (e os demais filtros que a lista tiver) | `exportacao/index.ts`, `tipos.ts` |
| A rota repassa o recorte ao módulo puro | `app/api/admin/exportacao/[tipo]/route.ts` |
| A tela monta o link com o filtro em vigor | `exportacao/page.tsx` |

## Regressão exigida
Integração: exportar com o degrau X selecionado devolve EXATAMENTE as linhas da lista filtrada por X
(nem uma a mais, nem uma a menos) para a mesma janela.

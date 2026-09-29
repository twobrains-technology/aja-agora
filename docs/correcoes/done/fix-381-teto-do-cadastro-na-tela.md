---
id: FIX-381
titulo: "O teto exibido vem do cadastro, não da constante"
status: done
bloco: bloco-toques
arquivos:
  - src/lib/admin/remarketing-tela.ts
  - src/app/api/admin/remarketing/route.ts
rodada: 2026-09-28
commit: 8a93a762
executado_em: 2026-09-28
---
## Palavras do operador
Reunião de 22/09 — o "onde a gente para" (Kairo, 12:12:30): a tela precisa dizer o limite real, e o
limite passou a ser editável no cadastro (AJA-20 T1, commit `06ec1e27`).

## Cenário exato
A tela mostra "1 de 3" e "cota de 30 dias: 2 de 3" a partir de `MAX_TOQUES`, importado de `regua.ts:63`
(`remarketing-tela.ts:301,305`). O ciclo já lê `maxToques` do `remarketing_config`; se alguém mudar o
cadastro para 2, **a tela continua dizendo 3** e passa a mentir para o operador.

## Root cause
O AJA-20 T1 ligou o cadastro ao CICLO, não à TELA: `app/api/admin/remarketing/route.ts` não chama
`lerParametrosRegua`.

## Correção proposta
| O quê | Onde |
|---|---|
| A rota lê o cadastro vigente e passa o teto no shape | `app/api/admin/remarketing/route.ts` |
| `passoLegivel`/`cotaLegivel` usam o valor recebido | `remarketing-tela.ts:301,305` |

## Regressão exigida
Unitário: com cadastro em 2, a tela diz "1 de 2"; sem cadastro, cai no valor de fábrica (o mesmo que o
ciclo usa).

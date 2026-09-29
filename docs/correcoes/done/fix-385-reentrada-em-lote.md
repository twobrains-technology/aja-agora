---
id: FIX-385
titulo: "Reentrada deliberada do bolo parado, em lote"
status: done
bloco: bloco-reentrada
arquivos:
  - src/lib/remarketing/regua.ts
  - src/lib/remarketing/entrada.ts
  - src/app/api/admin/remarketing/
  - src/components/admin/remarketing/
rodada: 2026-09-28
executado_em: 2026-09-30
commit: c83177fe
---
## Palavras do operador
Reunião de 22/09 (Kairo, 12:20:41): *"eu tento separar eles e montar uma mensagem pelo menos para cada
grupo… E aí você me liberando. Eu já mando essas."* E a cliente (12:10:09): *"eles continuam parados
desde a semana passada."*

## Cenário exato (medido em produção, 28/09)
`[remarketing-cycle] avaliadas 210, elegíveis 0`. A janela de entrada de 7 dias
(`motivo-de-exclusao.ts:247`) fecha a porta por construção: o bolo que a cliente quer retomar **não pode
entrar** — 4 conversas aparecem exatamente com `parada_ha_mais_de_7_dias`.

## Root cause
Não existe ação de admin em lote que inscreva conversa elegível ignorando a janela. As rotas da régua só
têm segurar/soltar por conversa; a "reentrada" de `regua.ts:312,354,384` é por nova simulação no ciclo
natural, não por decisão do operador.

## Correção proposta
| O quê | Onde |
|---|---|
| Ação de admin que inscreve em lote as conversas elegíveis ignorando `JANELA_DE_ENTRADA_MS` | rota da régua + `regua.ts`/`entrada.ts` |
| Estado inicial explícito: `step = 0`, `status = "ATIVO"`, `nextTouchAt = agora`, `touchesNaJanela = []`, `motivoSaida = null` | idem |
| Registro de **quem autorizou e quando** | `remarketing_config` ou coluna `origem_da_reentrada` |
| Idempotência contra o `entrar()` do ciclo (índice único por conversa já existe) | idem |
| UI: seleção + botão, dizendo quantas vão entrar e quantas ficam de fora com o motivo | componentes da régua |

## Guardas que NÃO se afrouxam
`optoutDaPessoaEm` (quem pediu para sair **nunca** reentra) · telefone da equipe · `is_simulated` ·
e quem ficou terminal **por ter respondido**.

## Decisão do dono
Cota de 30 dias: **CONTA** o histórico (recomendação do PRD; o dono ainda não respondeu — registre no ADR).

## Regressão exigida
Integração: lote com 1 com opt-out, 1 da equipe, 1 teste e 2 elegíveis ⇒ entram 2, com `step = 0` e
`motivoSaida = null`; rodar de novo não duplica nem reativa quem respondeu.

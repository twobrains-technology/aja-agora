---
id: FIX-403
titulo: "O teste do telefone no ar não era o que o dono pediu — e ele só conseguia ver uma das pontas"
status: done
bloco: fix-ab-telefone
arquivos:
  - src/lib/chat/variante-da-visita.ts
  - src/lib/chat/desbloqueio-do-telefone.ts
  - src/lib/chat/types.ts
  - src/lib/chat/actions.ts
  - src/components/chat/chat-message.tsx
  - src/components/chat/oferta-embacada.tsx
  - src/components/chat/artifacts/telefone-do-desbloqueio.tsx
  - src/app/api/chat/route.ts
  - src/lib/chat/provider.tsx
rodada: 2026-09-29
executado_em: 2026-09-29
---
## Palavras do operador
Kairo, 29/09/2026 (depois de subir a versão com o teste): *"temos dois problemas aqui, na versao que
subimos, o teste A / B nao esta conforme eu queria. teste A deveria ser, antes de mostrar para o
cliente as ofertas, pedir o numero dele, e so depois mostrar. teste B deveria ser, mostra as ofertas
totalmente embacadas com blur, e alguma especie de clique para desbloquear, e ai pede o numero do
cliente. teste C nao existe, sao somente esses 2. eu ja tentei 4 vezes e so recebi o comportamento
seguinte: Mostra a oferta e em baixo pede o numero para continuar simulacao completa. --- nao foi isso
que pedimos."*

## O que estava no ar (medido no código, não no relato)
| Pedido dele | O que existia |
|---|---|
| **A** = telefone antes de qualquer oferta | existia, mas **chamava-se `B`** (`estado = "pede-antes"`) |
| **B** = ofertas **totalmente** embaçadas + clique → telefone | existia como **`C`** (`estado = "borrado"`), e mostrava a **parcela legível**, borrando só o resto |
| **C** não existe | existia e era a única ponta que ele conseguia ver |

Os dois defeitos de fundo:

1. **A nomenclatura do código não era a do dono.** A tupla vivia em `variante-da-visita.ts`
   (`["B", "C"]`) e o mesmo par aparecia redigitado em `types.ts` (`"B" | "C"`) e em `actions.ts` —
   três fontes para a mesma verdade.
2. **Não havia como ver as duas pontas.** A variante é sorteada por VISITA e é determinística
   (`hashDaSemente` do id da visita): no mesmo navegador a pessoa cai sempre na mesma ponta. Foram as
   quatro tentativas dele — quatro vezes no `borrado`, que é exatamente "mostra a oferta e embaixo
   pede o número".

## O que mudou
1. **Só duas pontas, com o nome dele**: `VARIANTES_DO_TELEFONE = ["A", "B"]`. `A` = `pede-antes`
   (nada da oferta antes do número, como já era); `B` = o desbloqueio. `C` deixou de existir.
2. **B virou o que ele descreveu**: as ofertas aparecem **embaçadas** (`OfertaEmbacada`: blur real,
   fora da árvore de acessibilidade, com botão *"Desbloquear minhas opções"*) e o clique leva ao
   **campo do telefone** — quem desbloqueia é o número, não o clique. A parcela legível **saiu** do
   card: *"mostra as ofertas TOTALMENTE embacadas"*.
3. **Fonte única do nome das variantes**: `types.ts` e `actions.ts` passaram a importar
   `VarianteDoTelefone` em vez de redigitar `"B" | "C"`. Foi a redigitação que deixou painel e card
   divergirem.
4. **`?variante=A|B` na URL** (override de QA/dono): o cliente lê o parâmetro da página e manda no
   corpo; a rota grava na conversa — inclusive numa conversa **já existente**, que é o caso de quem
   está testando no chat aberto. Valor desconhecido é ignorado.

## Provado
- `pnpm -s typecheck` → limpo (worktree `fix-ab-telefone`, base `3c2ec866`).
- `pnpm -s vitest run src/app/api/chat src/lib/chat src/components/chat src/components/admin/performance`
  → **611 verdes**; o único vermelho é `src/app/api/chat/route.handoff-echo.test.ts`, que é de
  ambiente (precisa app/LLM) em qualquer banco.
- Testes novos/reescritos: `oferta-embacada.test.tsx` (blur + a11y + clique leva ao campo + campo
  desabilitado não finge foco), `telefone-do-desbloqueio.variante-b.test.tsx` (o card não entrega
  NENHUM valor), `variante-da-visita.test.ts` (`C` recusado, guard `A|B`).

## Seguro renomear
Medido em produção antes da troca: **0 conversas** com `metadata.telefoneDoDesbloqueio` — nenhuma
visita tinha caído em variante ainda, então não há dado histórico para reinterpretar.
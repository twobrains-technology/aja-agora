# Bloco comunicações — a mensagem certa para a macro-fase, e a arte amarrada à chave

- **Branch:** `kairogyn/feat-comunicacoes-por-fase` (worktree `feat-comunicacoes-por-fase`)
- **Bloco:** `bloco-comunicacoes` (onda 2) — FIX-387, FIX-388, FIX-389
- **Data:** 2026-09-29
- **Commits:** `7e796347` (387), `29ea1476` (388), `645d3f5f` (389) + `style` + `docs(correcoes)`

## O que passou a existir

A comunicação do remarketing deixou de ser "uma chave pelo bem" e passou a ser **fase do funil ×
bem**, com fallback. As três macro-fases da reunião de 22/09 viraram fato do servidor:

| item | entrega | prova |
|---|---|---|
| **FIX-387** | `faseDoFunil(sinais)` **pura** em `sinais-do-funil.ts` → `"inicio" \| "viu_oferta" \| "fechamento"`. Os sinais (`viuOferta`, `teveProposta`) saíram de **fonte única**: estavam inline em `percurso-queries.ts`, `performance-queries.ts` e `exportacao/percurso.ts` | `sinais-do-funil.test.ts` (5 casos de fase + teste de FONTE: os 3 consumidores usam o fragmento e não redefinem) |
| **FIX-388** | `chavesDoToque(fase, bem)` devolve a **lista ordenada** `[fase+bem, genérico]`; o motor entrega `usageKeys` na ação; `template-dispatch.escolherChave` usa a 1ª `APPROVED` ou **enfileira** | `motor.test.ts` (fallback: bem → genérico; sem bem → só genérico) + `template-dispatch.chaves.test.ts` (6 casos: escolhe, cai no genérico, enfileira, `PENDING`≠aprovado) |
| **FIX-389** | `comunicacaoDoToque(fase, bem)` amarra **chave e arte** à mesma entrada; genérico nunca leva arte de bem | `motor.arte-fase.test.ts` (3 estados de fase; genérico ⇒ `arte: null`) + AJA-14 intacto |

## As chaves candidatas (o dono cadastra com estes nomes)

| fase | com bem conhecido | fallback da fase |
|---|---|---|
| `inicio` | `remarketing_inicio_carro`, `remarketing_inicio_moto`, `remarketing_inicio_imovel` | `remarketing_inicio_generico` |
| `viu_oferta` | `remarketing_viu_oferta_carro`, `remarketing_viu_oferta_moto`, `remarketing_viu_oferta_imovel` | `remarketing_viu_oferta_generico` |
| `fechamento` | `remarketing_fechamento_carro`, `remarketing_fechamento_moto`, `remarketing_fechamento_imovel` | `remarketing_fechamento_generico` |

**Ordem de fallback:** 1º `remarketing_<fase>_<bem>`; 2º `remarketing_<fase>_generico`. Sem bem
conhecido, a lista tem **uma só** chave — o genérico da fase. Sem nenhum aprovado, a linha vai para
a fila (`pending`) **com a chave específica** e o alerta sobe: nunca some.

## Regra dura respeitada

**Nenhum texto de comunicação virou texto fixo no servidor.** A função pura do motor só monta a
ORDEM das chaves; quem decide se o template existe/aprovado é o `template-dispatch` (que enfileira
quando não há aprovado). O texto é cadastro (template na Meta) e prompt.

**Este bloco não falou com a Graph API:** nenhuma mensagem real disparada, nenhum template
submetido à Meta. A régua em produção continua desligada por `REMARKETING_ATIVO` (a chave liga os
envios, não este código).

## Verificação (comandos, sem suíte inteira e sem smoke de browser)

```bash
pnpm typecheck                                                        # verde
pnpm vitest run src/lib/remarketing/ src/lib/whatsapp/                # 636 passed
pnpm vitest run src/lib/workers/remarketing-cycle.test.ts \
  src/lib/admin/sinais-do-funil.test.ts \
  src/lib/admin/remarketing-config.test.ts \
  src/lib/admin/remarketing-queries.test.ts                           # 85 passed
pnpm lint                                                             # biome: 1530 arquivos, limpo
```

## Consumidores ajustados (para os sinais serem fonte única)

`src/lib/admin/percurso-queries.ts`, `src/lib/admin/performance-queries.ts` e
`src/lib/exportacao/percurso.ts` passaram a usar `viuOferta()`/`teveProposta()` de
`src/lib/admin/sinais-do-funil.ts` (os `EXISTS` inline saíram). O ciclo passou a ler os sinais na
`listarVencidas` e a calcular a fase antes de decidir.

## Decisões e pendências

- ADR: `docs/decisoes/blocos/2026-09-28-bloco-comunicacoes.md`.
- **Dívida (fora do escopo):** a tela de forma do toque (`remarketing-queries.ts`) ainda usa a
  função **legada** `templateDoObjetivo` (`remarketing_oportunidade_<objetivo>`), porque a tela não
  conhece a fase. O disparo não usa mais essa função. Levar a fase até a tela é item do bloco dono
  da tela.
- Os três `fix-NN` foram movidos para `docs/correcoes/done/`; a pasta
  `docs/correcoes/todo/bloco-comunicacoes/` foi removida.
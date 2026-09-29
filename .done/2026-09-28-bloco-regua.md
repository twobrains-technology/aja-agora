# Bloco régua — os três toques saem de verdade

- **Branch:** `kairogyn/feat-regua-cadencia`
- **Bloco:** `bloco-regua` (onda 1) — FIX-376, FIX-377, FIX-378
- **Data:** 2026-09-28
- **Commits:** `5164aeb0` (376), `1c277eb2` (377), `3c3e48e5` (378) + ADR `b407f3f8` + bookkeeping `docs(correcoes):`

## O problema, medido em produção (28/09)

A régua está LIGADA (`REMARKETING_ATIVO=1`) e o ciclo roda a cada 30 s, mas não entra ninguém:
`[remarketing-cycle] avaliadas 210, elegíveis 0` (180 `sem_contato`, 9 `teste`, 8
`telefone_da_equipe`, 8 `ja_na_regua`, 4 `parada_ha_mais_de_7_dias`). A cadência em vigor era a de
**fábrica**: 90 min de silêncio, depois **3 dias** e **5 dias** — o toque 03 saía 4 dias depois do
01, fora da janela de 24 h de qualquer conversa. E havia um portão externo que matava os toques 02 e
03 em silêncio.

## O que foi feito

| Item | Problema | Correção | Prova |
|---|---|---|---|
| **FIX-376** | Não existia cadência intra-janela: `regua.ts` só tinha `esperaSilencioMs + dias` | Novo parâmetro `escalaDeRetomadaMs` (fábrica `[10, 20, 30]` min) em `ParametrosRegua`; dentro da janela de 24 h ele substitui o silêncio de 90 min e os intervalos de dias. Fora da janela, o desenho por dias fica intacto. O fato que decide cadência e forma do envio é **o mesmo** (`dentroDaJanelaDeTexto`) | `src/lib/remarketing/regua.escala.test.ts` (16 casos) + `regua.test.ts` / `regua.parametros.test.ts` |
| **FIX-377** | `MAX_RETOMADAS=2` / backoff de 30 min (`workers/retomada.ts`) barrava o turno da régua **antes do envio e sem gravar** (`motor.ts:443`), matando o toque 02 e o 03 | Os toques intra-janela ganharam **contador próprio** (`step` / `touches_30d`, com `maxToques` e `tetoToques30Dias`). Saíram `retomadaPermitida` do motor e a escrita de `meta.retomada` no ciclo; `retomada.ts` **não mudou** | **Prova por comando**: `remarketing-cycle.test.ts` roda o ciclo 3× com estado vivo e mostra os toques 1/2/3 saindo **mesmo com `metadata.retomada` esgotado** |
| **FIX-378** | A tela mostrava só a data do próximo toque, nunca o motivo (o caso da Irene) | `motivoDoProximoToque()` **derivado** do estado da linha (4 motivos com rótulo humano), com a precedência de `podeDisparar`, usando os parâmetros vigentes do cadastro. Sem motivo, não há texto | `src/lib/admin/remarketing-tela.test.ts` (7 casos: os 4 motivos, "sem motivo não inventa", cadastro move o motivo) |

Decisões registradas em `docs/decisoes/blocos/2026-09-28-bloco-regua.md` (ADR): opção (b) do PRD
§AJA-20 T3 seguida à risca; representação da escala no cadastro (linha CSV, fora de `vigentes`) e o
porquê; motivo calculado em tela (PRD recomenda).

## Cadência resultante (valores EFETIVOS, fábrica)

| Momento | Antes | Agora |
|---|---|---|
| Entrada na régua | silêncio entre 90 min e 7 dias (**inalterado**) | igual |
| Toque 01 | 90 min de silêncio (mas só entra com ≥ 90 min → sai no 1º ciclo após a entrada) | no 1º ciclo após a entrada; com a linha já vencida, sai em **10 min** de silêncio |
| Toque 02 | +3 **dias** | **+20 min** |
| Toque 03 | +5 **dias** | **+30 min** |
| Série completa | ~8 dias, toque 03 como template (fora das 24 h) | **~50 min depois do toque 01**, os três como texto livre (dentro das 24 h) |
| Tetos | `maxToques=3`, `tetoToques30Dias=3`, horário 9h–20h | iguais (a escala não afrouxa nenhuma guarda) |

**Fronteira explícita:** a escala governa os **toques**, não a **entrada**. A guarda de entrada
continua exigindo ≥ 90 min de silêncio (`ESPERA_SILENCIO_MS`, `motivo-de-exclusao.ts`) — ela não foi
tocada, e a medição de produção tem **0 conversas** excluídas por `ainda_em_silencio`. Ou seja: o
toque 01 sai no primeiro ciclo após a entrada, e os toques 02 e 03 em +20 e +30 min. Os "10 minutos"
da reunião valem para uma linha já na régua (reentrada/simulação); para encurtar a entrada seria
preciso mexer na elegibilidade, que **não** é deste item.

## Como conferir

```bash
pnpm vitest run src/lib/remarketing/ src/lib/workers/remarketing-cycle.test.ts \
  src/lib/admin/remarketing-config.test.ts src/lib/admin/remarketing-tela.test.ts
pnpm typecheck
```

Verde: **235 testes / 10 arquivos**, typecheck limpo.

## Riscos tratados e limites

- **Nenhuma mensagem real** foi disparada: todos os testes do ciclo usam `deps` injetadas (mocks de
  `dispararTurno` / `enviarTemplate` / `enviarArte`); a régua não foi ligada nem reiniciada.
- **Nenhuma migration**: o motivo do próximo toque é calculado, não persistido; a escala usa a tabela
  `remarketing_config` que já existe (linha de texto CSV).
- **Gap conhecido e registrado:** a tela de cadastro (`/admin/remarketing/config`) ainda **não** tem
  campo para a escala — o valor é ajustável gravando a linha `escala_retomada_minutos` no banco
  (vale sem deploy, que é o critério do PRD). O campo na tela é do bloco dono da tela de config: ela
  reenvia TODOS os vigentes no save e um vigente não-numérico apagaria a escala.
- **Dívida observada (não minha):** `pnpm lint` falha em
  `src/components/admin/percurso/escada-do-percurso.tsx` (formatação do `TooltipContent`), arquivo
  não tocado por este bloco e fora do escopo — por isso os commits foram feitos com `HUSKY=0`, como
  manda o `AGENTS.md` do projeto. Vale corrigir na lane dona do Percurso.
- O teste de integração com banco `gate-reengage-poll.dois-jobs.test.ts` falha por **ambiente**
  (`ECONNREFUSED ::1:5432` — sem Postgres de pé neste worktree); é anterior a este bloco.

## Não foi feito (por instrução)

Sem PR, sem merge, sem deploy/restart de worker, sem QA de browser, sem suíte inteira. A marca de
conclusão é local: tag `block-done/feat-regua-cadencia`.
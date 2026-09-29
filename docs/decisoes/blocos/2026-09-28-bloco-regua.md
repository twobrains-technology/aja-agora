---
data: 2026-09-28
titulo: "Bloco régua — contador próprio dos toques intra-janela, a escala curta e o motivo calculado em tela"
status: aceita
decisor: executor (técnico) seguindo a recomendação do PRD §AJA-20 — nenhum trade-off de produto em aberto
contexto: bloco-regua (FIX-376, FIX-377, FIX-378); fonte de design em docs/design/planos/2026-09-22-frente-aja-agora-medicao-remarketing-e-base.md
---

# ADR — bloco régua: como os três toques passam a sair de verdade

Contexto medido em produção (28/09/2026): a régua está ligada (`REMARKETING_ATIVO=1`), o ciclo
roda a cada 30 s e **não entra ninguém** (`avaliadas 210, elegíveis 0`). A cadência em vigor é a de
fábrica — 90 min de silêncio, depois **3 dias** e **5 dias** entre toques —, ou seja, o toque 03 sai
4 dias depois do 01, fora de qualquer janela de conversa (24 h da Meta). A reunião de 22/09 fixou a
escala curta (10 → 20 → 30 min). Este bloco entrega os três itens que fazem essa escala sair.

Este ADR registra só o que **realmente foi decidido**; o resto é implementação direta do card.

## Decisão 1 (FIX-377) — os toques intra-janela ganham contador próprio; `retomada.ts` fica intacto

**O que decidir:** o portão `MAX_RETOMADAS = 2` / `BACKOFF_RETOMADA_MS = 30 min`
(`src/lib/workers/retomada.ts:18-20`) bloqueava o turno da régua com
`semDisparo("teto_de_retomadas")` **antes** do envio (`motor.ts:442-443`), em silêncio. Duas saídas
estavam na mesa (PRD §AJA-20 T3):

| opção | o que faz | custo |
|---|---|---|
| (a) | o teto e o backoff de retomada viram parâmetros da régua (contador por ciclo da régua) | acopla dois sistemas que medem coisas diferentes; a régua passa a mexer no contador do watchdog |
| **(b)** | os toques intra-janela **não são** turnos de retomada e ganham contador próprio; `retomada.ts` fica intacto | separa dois conceitos hoje colados; exige um teste de integração no ciclo |

**Escolhida: (b)**, a recomendação explícita do PRD. Evidência de código que sustenta:
`conversationMetadata.retomada` é escrito e lido pelo watchdog (`gate-reengage-poll.ts:296` lê
`podeRetomar`; `:306` grava o contador) e mede o **turno de retomada** — "o turno que morreu sem
conduzir" —, não a série de toques da régua. A régua já tem contador próprio e correto:
`remarketing_touches.step` + `toques_30d` (teto deslizante global), ambos com guardas nomeadas
(`maxToques`, `tetoToques30Dias`, `motivo: esgotado|teto_30_dias`). Ou seja, o contador próprio
**já existia**; o defeito era o motor consultar o contador do outro sistema.

**Consequências implementadas (as duas direções, não só a leitura):**
- `EntradaDoMotor.retomadaPermitida` e o motivo `teto_de_retomadas` **saem** do motor — não existe
  mais o caminho mudo (`motor.ts:443`). Quem bloqueia a régua a partir de agora devolve **motivo
  nomeado** (`aguardando_data`, `teto_30_dias`, `fora_da_janela_de_horario`, `esgotado`), que entra
  no log agregado do ciclo e na tela.
- O ciclo **não grava mais** `meta.retomada` (`gravarRetomada` sai de `RemarketingDeps`). Se a
  régua lesse fosse só a leitura, o watchdog continuaria com o orçamento consumido pelos toques da
  régua (2 toques → watchdog bloqueado numa conversa que não é dele). `retomada.ts` **não muda uma
  linha**.
- Sem risco de mensagem duplicada: o watchdog só age quando a **última mensagem é do cliente**
  (`findConversasSemResposta`); o turno da régua deixa a última mensagem como do assistente e
  portanto silencia o watchdog por construção.

**Não discordo da recomendação** — não há trade-off de produto aqui, e a opção (b) está literal no
PRD. Sigo-a.

## Decisão 2 (FIX-376) — `escalaDeRetomadaMs` é uma LISTA, e o cadastro a guarda como CSV

**O que decidir:** a forma do parâmetro novo. O PRD manda `escalaDeRetomadaMs: number[]` (fábrica
`[10, 20, 30]` min). O cadastro (`remarketing_config`) é **chave/valor de TEXTO** e o motor de
cadastro (`remarketing-config.ts`) trata cada linha como **um inteiro** (`numeroInteiro`,
`DefinicaoDeParametro.paraMotor(valor: number): number`). Uma lista não cabe nesse molde.

**Escolhida:** manter a LISTA no contrato do motor (nome e fábrica exatamente como o PRD pede) e
guardá-la em **uma linha CSV** (`escala_retomada_minutos` = `"10,20,30"`), com validação própria
(cada elemento inteiro, entre 1 min e 24 h, lista não-decrescente, 1–5 passos; inválido → fábrica).
`LIMITES_DOS_PARAMETROS` e `CAMPOS_DOS_PARAMETROS` seguem escalares (`CampoEscalar`), e a escala
tem a sua faixa em `LIMITES_DA_ESCALA`.

**Por que essa linha NÃO entra em `vigentes` (e portanto na tela de config):** a tela
(`src/app/admin/(dashboard)/remarketing/config/config-da-regua.tsx`) renderiza um `<input
type="number">` por vigente e, ao salvar, reenvia **todos** (`parametros: vigentes.map(...)`); um
vigente não-numérico voltaria como `""` e a régua o interpretaria como **remoção** — ou seja, abrir
o cadastro e salvar qualquer outro campo **apagaria a escala**. A tela de config está **fora do
escopo deste bloco** (os arquivos do bloco são `src/lib/remarketing/`, o ciclo, a tela da régua e a
API `/api/admin/remarketing`). Então:
- o **servidor** lê, valida e usa a escala (a promessa "muda sem deploy" vale: gravar a linha no
  banco muda o comportamento no próximo ciclo);
- a exposição **na tela de cadastro** fica para o bloco dono da tela de config (escopo).
- `escalaDeRetomadaMs` sem linha = fábrica `[10, 20, 30]` min, e a lista usa o último elemento
  repetido se for mais curta que o número de toques ("de 30 em 30 até a janela fechar", Kairo
  22/09).

**Fronteira explícita (não é gargalo, é o desenho):** a escala governa os **toques**, não a
**entrada**. A entrada continua exigindo ≥ 90 min de silêncio (`ESPERA_SILENCIO_MS`,
`motivo-de-exclusao.ts:239-241`), guarda que não foi tocada. Efeito prático: o toque 01 sai no
primeiro ciclo depois da entrada (a escala de 10 min já está vencida), e o 02 e o 03 saem em +20 e
+30 min — tudo dentro da janela de 24 h. A medição de produção (28/09) mostra **0 conversas**
excluídas por `ainda_em_silencio`: mexer nessa guarda não destrava ninguém e aumentaria a
exposição sem pedido.

## Decisão 3 (FIX-378) — o motivo do próximo toque é CALCULADO em tela, não persistido

**O que decidir:** coluna nova com o último motivo de bloqueio (backfill `NULL`) **ou** calcular em
tela a partir do estado da linha. O PRD recomenda **calcular em tela** ("é mais barato e não mente
sobre o passado").

**Escolhida: calcular em tela**, seguindo o PRD. Motivos: (1) não exige migration (fora do escopo);
(2) o passado não tem esse dado e uma coluna nasceria mentindo; (3) o motivo é **derivável** com o
que a linha já tem (`status`, `nextTouchAt`, `touches30d`) mais a janela de horário e o teto
vigentes. A derivação é uma função pura em `remarketing-tela.ts`
(`motivoDoProximoToque`) com a MESMA precedência de `podeDisparar` (teto → data → horário),
alimentada pelos parâmetros vigentes do cadastro para não mentir quando o dono muda a hora ou o
teto. Sem motivo, a coluna **não inventa texto**.

## Resumo

| item | decisão | por quê |
|---|---|---|
| FIX-377 | opção (b): contador próprio (step/toques_30d), `retomada.ts` intacto; sai a leitura E a escrita de `meta.retomada` na régua | recomendação do PRD; dois conceitos diferentes hoje colados; `conversationMetadata.retomada` mede o turno do watchdog |
| FIX-376 | `escalaDeRetomadaMs: number[]` (fábrica `[10,20,30]` min); cadastro em linha CSV, validada, fora de `vigentes` | nome/fábrica do PRD; `remarketing_config` é texto e a tela de config reenvia todos os vigentes (apagaria a linha) e está fora do escopo |
| FIX-378 | motivo calculado em tela, com os parâmetros vigentes | recomendação do PRD; sem migration; não mente sobre o passado |
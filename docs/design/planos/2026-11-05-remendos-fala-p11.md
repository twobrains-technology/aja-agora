# Migração dos remendos de fala do motor para a conduta (P11)

> Conferido nesta worktree em 05/11/2026: todos os `arquivo:linha` abaixo foram conferidos contra
> o código real; onde divergiam do rascunho anterior, corrigidos (código manda).
>
> **ESTADO (05/11, conferido contra develop nesta worktree): os itens 1-14 estão FEITOS** —
> commits `baaee29c` (itens 1-2), `79f49539` (item 3), `5b39bdeb` (item 6), `7d6d87a1` (itens 4-5,
> 7-11), `fbce8b82` (item 13) e item 14. Evidências na seção
> **"Estado em develop — o que já está feito"**. O que RESTA é a **Onda de conduta 05/11
> (regras A/B/C)**, no fim deste arquivo.

## Problema
O motor do vendedor (`src/lib/agent/pi/turno-livre.ts`) carrega ~14 pós-processamentos de fala do
modelo — teto de pergunta, contador de pedido de nome, dedup por conteúdo, balão fixo de handoff,
classificadores em regex — que violam a P11 do `AGENTS.md`: "o código garante só a verdade... conversa
é do prompt: nada de teto, dedup ou contador de recusa em código; tom, repetição e fluidez viram
medida e correção de contexto".

## Solução
Cada remendo migra para (a) a caixa de conduta (`src/lib/agent/prompt-do-vendedor.ts`, partes
editáveis, validadas por `pnpm prompts:check` contra `caixa_de_prompt`) e (b) sinal de
observabilidade (`src/lib/observability/sinais/`, linha `[sinal]` grepável) — nunca guarda silenciosa.
O que é FATO (identidade, card que existe, gate P5 de produto) fica em código.

## Grandes ideias
- **Fato fica, fala sai.** Só sai do código o remendo que corta/reescreve/classifica FALA. Regras
  que conferem verdade (identidade servidor-side, id de carta que existe na busca, P5) ficam.
- **Onda 2 = turno-livre.ts sozinho.** Quase todos os call sites estão nele; é o gargalo de onda
  única. Nenhuma outra onda toca o arquivo.
- **Sinal antes de remoção.** Cada comportamento migrado ganha sinal que mede a ocorrência, para o
  dono ler o efeito no lugar de ter a fala escondida.
- **Conduta entra na caixa antes do remendo sair.** As partes novas da caixa são publicadas
  (`caixa_de_prompt`) e validadas por `pnpm prompts:check` antes de o corte do código ir.
- **Tools novas para decisão do modelo**: qualificação com schema e flag de `falar_com_humano`,
  no lugar de NLU em regex sobre a fala.

## Decisões do chefe (05/11/2026)
- **Q1 — fechada (confirmado).** `linhaDeFato` (`system-do-vendedor.ts:22-43`) interpola
  `contactName` cru (`:36`). Sanitizar na ORIGEM (`saveContactName`,
  `src/lib/leads/contact-capture.ts:118`): uma linha, sem quebra/controle, teto de 60 caracteres;
  `linhaDeFato` re-sanitiza (defesa em profundidade). `montarFatoDaFila` não recebe dado de usuário
  (verificado) — nada a fazer. Item 14 entra na onda 1.
- **Q2 — fechada.** A NLU do lance migra TUDO para tool aditiva `informar_perfil` com schema; o
  servidor valida (bounds, `parse-asset-value` como tipo) e grava em
  `funnel.qualifyAnswers`/`currentCategory` — o mesmo lugar de hoje. `cards-livres.ts` não muda.
  `capturarIdentidadeDoTexto` FICA.
- **Q3 — pendente-KAIRO.** `pnpm eval` precisa de app+Bevi; testar na onda 3; se não rodar,
  PENDENTE-KAIRO (gate cai para testes pontuais + playground manual, registrado no relatório).
- **Item 9:** `picarEmBaloes` é FORMA (não reescreve palavra) — fica. Tetos 260/3 são defaults
  configuráveis; sinal quando o teto atinge.
- **Item 13:** a suspensão de anúncio colada a card TAMBÉM sai (corte de fala); sinal
  `narracao_de_ferramenta`; a conduta "não anuncie o card" já existe no sufixo
  (`prompt-do-vendedor.ts:75`).
- **Sinais novos via publicarScores** (linha `[sinal]`): `fala_com_multiplas_perguntas`,
  `pedido_de_nome_recorrente`, `lista_no_texto`, `promessa_de_atendimento`,
  `fala_em_primeira_pessoa`, `fala_repetida_no_turno`, `turno_sem_fala`,
  `teto_de_balao_atingido`, `fala_contradiz_mesa`, `narracao_de_ferramenta`, `informar_perfil`.
- **Item 11:** `clientePedeHumano` (fato do cliente) FICA como gatilho;
  `clientePedeFechar`/`decidirRota` de fala do modelo SAI — o modelo declara via tool; o gate P5
  fica no servidor.

## Variáveis
- RAIZ: `/Users/kairo/orca/workspaces/aja-agora/chefe-remendos-v2`   BASE: `develop`
- PROJETO: aja-agora   GATE: `pnpm -s typecheck` + teste do arquivo tocado + `pnpm prompts:check` + `pnpm eval`

## Fluxo
1. **Planejar** — este plano; conferir `arquivo:linha` de cada remendo.
2. **Construir** — ondas disjuntas por arquivo. Commits por remendo, Conventional Commits, sem
   `--no-verify`. Não tocar: `db/schema`, `identity`, `telefone-ou-cpf`, `parse-asset-value` (fato).
3. **Verificar** — gate por onda e, no fim, `pnpm eval` + playground (P12).

## Contexto — o que muda (remendo por remendo, `arquivo:linha` conferido)

| # | remendo | onde | migra para |
|---|---|---|---|
| 1 | `manterUmaPergunta` corta a 1ª pergunta | `uma-pergunta.ts:21` | caixa (descoberta) + sinal `fala_com_multiplas_perguntas` |
| 2 | teto/contador/apagador de pedidos de nome | `pergunta-de-nome.ts` | caixa (abertura) + sinal `pedido_de_nome_recorrente` |
| 3 | `remover-lista-de-texto` no `garantirChip` | `chips.ts` | conduta (cartas-e-cards) + sinal `lista_no_texto` |
| 4 | balão fixo de handoff | `handoff.ts:54` | fala do modelo + sinal `promessa_de_atendimento` |
| 5 | `RE_DE_PROMESSA` classificador | `handoff.ts:35` | flag da tool `falar_com_humano` + sinal |
| 6 | `removerLinhasDePlano` | `orchestrator/vazamento.ts` | mantém só máquina; `fala_em_primeira_pessoa` vira sinal |
| 7 | dedup `jáSoltos` por conteúdo | `turno-livre.ts:274` | dedup por `toolCallId`/sequência; sinal `fala_repetida_no_turno` |
| 8 | fala de reserva de turno mudo | `turno-livre.ts:1825-1826` | sinal `turno_sem_fala` + conduta (P0) |
| 9 | teto fixo de `picarEmBaloes` | `baloes.ts` | mantém forma; sinal `teto_de_balao_atingido` |
| 10 | NLU paralela em regex | `turno-livre.ts` ~431-940 | tool `informar_perfil` com schema |
| 11 | classificador de intenção da mesa | `rota-do-humano.ts` | decisão via tool; gate P5 fica no servidor |
| 12 | `corrigirComparacoes` reescreve fala | `comparacao-de-prazo.ts` | verificação vira sinal `fala_contradiz_mesa` |
| 13 | corte de narração por vocabulário | `narracao.ts` | sinal `narracao_de_ferramenta` |
| 14 | sanitização do contactName | `system-do-vendedor.ts:22-43` | sanitizar na ORIGEM (`contact-capture.ts`) |

### O que NÃO muda
- `capturarIdentidadeDoTexto` e `mascararTodas` — FATO.
- `semRepetirChamada` — dedup por `toolCallId` é FATO.
- `passaFinal` com scrub de CPF, JSON de argumento e nome de tool — máquina.
- `chipDoTurno`/`garantirChip` como derivação, `picarEmBaloes` como forma, cards factuais (P10/P11).
- Gate P5 no servidor (item 11), `abrirCasoNaMesa`, fila de vendedores, mesa.
- `clientePedeHumano` (fato do cliente) como gatilho.
- `cards-livres.ts` não muda (decisão Q2).
- Premissas LGPD/PII: nada de mascaramento novo (decisão do dono, 27/10/2026).

---

## Estado em develop — o que já está feito (conferido nesta worktree, 05/11/2026)

Todos os itens 1-14 conferidos no código de develop. Commits: `baaee29c`, `79f49539`, `5b39bdeb`,
`7d6d87a1`, `fbce8b82`. Evidências, `arquivo:linha` conferido nesta sessão:

- **Item 1 (uma pergunta, medida):** `uma-pergunta.ts:21` — `manterUmaPergunta` devolve o texto
  inalterado; `uma-pergunta.ts:16` (`contarPerguntas`) alimenta o sinal. Call site de medida em
  `montarTrechoDeSaida` (`turno-livre.ts:~217`, chamada `:255`), com comentário P11
  ("MEDIDA, não corte: a fala passa inalterada").
- **Item 2 (pedido de nome):** `pergunta-de-nome.ts` migrado para medida; conduta "o nome se pede na
  abertura e no máximo MAIS UMA vez" publicada em `prompt-do-vendedor.ts`, parte `abertura`.
- **Item 3 (lista no texto):** `chips.ts` sem corte; conduta "Se a pergunta tem alternativas, elas
  vão no card, nunca escritas no texto" na parte `cartas-e-cards`.
- **Item 4 (balão de handoff):** `linhaFinalDoHandoff` (`handoff.ts:54`) **sem call site em
  produção** — as únicas referências em `src/lib` fora de teste são o comentário P11 de
  `turno-livre.ts:206` e o próprio `handoff.ts`. Testes em `handoff.test.ts:144` afirmam que o
  turno NÃO chama `linhaFinalDoHandoff`.
- **Item 5 (RE_DE_PROMESSA → flag):** flag `pediuHumano` da tool `falar_com_humano`
  (`tools-livres.ts:242`, setada em `tools-humano.ts:88`); gatilho de handoff por flag em
  `turno-livre.ts:1061` (`if (ctx.pediuHumano && !estado.funnel.handoffSuggested)`).
- **Item 6 (vazamento):** `orchestrator/vazamento.ts` mantém só máquina; `PASSO_EM_PRIMEIRA_PESSOA`
  vira sinal `fala_em_primeira_pessoa`.
- **Item 7 (dedup por conteúdo):** `criarSeparadorDeTrechos` (`turno-livre.ts:~255-301`) — o
  `aoDelta` solta o texto SEMPRE e conta duplicatas (`duplicatasNoTurno`); sinal
  `fala_repetida_no_turno` publicado em `turno-livre.ts:1208`.
- **Item 8 (turno mudo):** sinal `turno_sem_fala` em `turno-livre.ts:1089`, com nota de contexto em
  vez de fala de reserva; prova em `livre.contrato.test.ts:288-292`.
- **Item 9 (teto de balões):** sinal `teto_de_balao_atingido` em `turno-livre.ts:693`
  (comentário do sinal em `:675`); `picarEmBaloes` segue como forma.
- **Item 10 (NLU → tool):** tool `informar_perfil` em `tools-livres.ts:1118` (schema validado,
  sinal `informar_perfil` em `tools-livres.ts:1179`); gravação no funil em `turno-livre.ts:~928`
  ("A gravação é a MESMA de antes, no MESMO lugar"); rota do handoff por tool, sem NLU de fala, em
  `turno-livre.ts:635-639` ("o FATO que define o estado é `ctx.pediuHumano`").
- **Item 11 (intenção da mesa):** `clientePedeFechar`/`decidirRota` fora do caminho de fala; gate
  P5 mantido no servidor; `clientePedeHumano` fica como gatilho (`turno-livre.ts:1061`).
- **Item 12 (comparação de prazo):** `comparacao-de-prazo.ts:18` — devolve o texto INALTERADO e
  emite o sinal `fala_contradiz_mesa` (`comparacao-de-prazo.ts:81`).
- **Item 13 (narração):** corte removido; sinal `narracao_de_ferramenta`; conduta "não anuncie o
  card" no sufixo (`prompt-do-vendedor.ts:75`).
- **Item 14 (contactName):** `sanitizarContactName` na ORIGEM (`contact-capture.ts:16`, aplicado
  em `saveContactName` em `contact-capture.ts:151-156`); re-sanitização na defesa em profundidade
  (`system-do-vendedor.ts:~32`).

---

## Onda de conduta 05/11 — regras A/B/C (recado r-20261105T002236-97da)

Três regras novas de conduta, medidas num turno real de escolha de carta (Kairo, 05/11). Entra tudo
em **uma parte só**: `cartas-e-cards` (`PARTES_PADRAO["cartas-e-cards"]`,
`src/lib/agent/prompt-do-vendedor.ts`), na voz das demais regras da caixa. Sem código: é fala, e
fala é do prompt (P11).

### Onde entra (âncoras conferidas no arquivo)

1. **Regra A** — logo DEPOIS do parágrafo "Ao comparar duas cartas, leia o número do card e diga a
   direção certa…" (parte `cartas-e-cards`, `PARTES_PADRAO`, `src/lib/agent/prompt-do-vendedor.ts`).
   É a mesma família: o que aparece na fala é o que está na tela.
2. **Regra B** — integrada/estendida ao parágrafo "Recomenda com convicção…" (mesma parte), que
   continua: escolhe UMA carta com porquê em números. A nova sentença fecha a porta do menu.
3. **Regra C** — DEPOIS do parágrafo "Recomenda com convicção…" (mesma parte): é a correção de
   número citado no meio da venda, contexto da comparação e da recomendação.

### Texto proposto (para `PARTES_PADRAO["cartas-e-cards"]`)

Regra A (parágrafo novo, após "Ao comparar duas cartas…"):

> Fale da carta pelo que o cliente vê no card: valor, parcela, prazo e contemplados. Número de
> grupo, taxa de administração e detalhe que não está na tela só entram na fala quando a conversa
> já trouxe o contexto ou quando ele pedir.

Regra B (acréscimo ao final do parágrafo "Recomenda com convicção…"):

> Recomende UMA carta e diga o porquê em números da própria cota: parcela menor, prazo mais curto,
> mais contemplações no grupo. Alternativa entra como fator de decisão ("a parcela da outra fica
> R$ 40 acima, se o aperto do mês falar mais alto"), nunca como menu: sem "se prefere X, temos X;
> se prefere Y, temos Y".

Regra C (parágrafo novo, após "Recomenda com convicção…"):

> Auto-correção é o FATO, nunca confissão. Se corrigir um número dito antes, corrija e siga: "olha,
> o prazo certo dessa é 94" — sem "errei", sem "me desculpe", sem justificar o erro. Reafirme a
> decisão com a correção na mão.

### Publicação e validação

- A fonte viva da caixa é a tabela `caixa_de_prompt` (banco); o arquivo é o fallback que o
  `prompts:check` compara. Publicar com `scripts/publicar-prompt-do-vendedor.ts` depois de editar
  `PARTES_PADRAO`.
- **Gate:** `pnpm -s typecheck` && `pnpm -s prompts:check`.
  **Nota:** a caixa mora no banco — o `prompts:check` precisa do Postgres local. Se não rodar,
  registrar **PENDENTE-KAIRO** e o gate cai para o typecheck + leitura do diff.
- `pnpm eval` (golden, onda 3) segue o Q3: se o ambiente não rodar, PENDENTE-KAIRO.

### Critérios de pronto (risco: alto — fala em produção, gate de prompt)

- [ ] As três regras estão em `PARTES_PADRAO["cartas-e-cards"]`, na posição descrita acima, sem
  repetir regra já existente (o parágrafo "Recomenda com convicção…" recebe acréscimo, não cópia).
- [ ] `pnpm -s typecheck` verde.
- [ ] `pnpm -s prompts:check` verde (ou PENDENTE-KAIRO registrado com o motivo).
- [ ] Publicação em `caixa_de_prompt` feita via `scripts/publicar-prompt-do-vendedor.ts` (ou
  PENDENTE-KAIRO se o banco local não estiver de pé).
- [ ] Nas conversas de teste/playground, nenhuma resposta em cenário de escolha de carta cita id de
  grupo/taxa fora da tela sem pedido; a recomendação nomeia UMA carta com porquê numérico; nenhuma
  ocorrência de "errei"/"me desculpe" — leitura direta das falas.

---

## Riscos
- **Fala que piora sem a guarda:** os remendos existiam por defeito medido. A caixa pode não segurar
  de imediato — risco assumido da P11; o sinal é o que prova. Plano de volta: conduta mais forte na
  parte, nunca remendo em código (regressão de fato — dinheiro, dado — é código, não fala).
- **Dedup por conteúdo removido (7):** duplicata do stream volta a aparecer em falha de provedor;
  dedup por `toolCallId`/sequência fica, e o sinal aponta o caso.
- **`prompts:check`/`publicar` dependem do PG local:** sem banco de pé, o gate de conduta não roda —
  PENDENTE-KAIRO em vez de publicar às cegas.

## Definição de pronto
Risco: **alto** — toca fala em produção e o gate de promoção de prompt.

- [ ] Itens 1-14: FEITOS e conferidos (seção "Estado em develop").
- [ ] Onda de conduta 05/11: as três regras publicadas e o gate da seção anterior verde (ou
  PENDENTE-KAIRO registrado).
- [ ] Nenhum remendo corta fala em código; FATO (identidade, card existente, P5, scrub de máquina)
  intacto.
- [ ] `pnpm -s typecheck` verde; teste do arquivo tocado verde.
- [ ] `pnpm eval` verde ou PENDENTE-KAIRO registrado.
- [ ] Relatório com as falas observadas no teste da nova conduta (antes/depois).

## Como você será avaliado
- Um ponto por item da Definição de pronto.
- **Falha imediata:** voltar a cortar fala em código sob outro nome; publicar conduta sem
  `prompts:check` sem registrar PENDENTE-KAIRO; declarar pronto sem o reporte de verificação.
- **Falha imediata:** remover garantia de FATO (identidade, card existente, P5,
  `clientePedeHumano`) junto com o remendo.

## Perguntas em aberto
- **Q3** (parou em: demanda — PENDENTE-KAIRO): `pnpm eval` fala com o app real (Bevi/credencial).
  Não confirmei que o ambiente da lane o executa — ninguém rodou comando. Confirmar na hora da
  onda 3; sem ele, o gate de risco alto fica nos testes pontuais + playground.
- **Q4** (parou em: premissa — PENDENTE-KAIRO): `pnpm -s prompts:check` e a publicação
  (`scripts/publicar-prompt-do-vendedor.ts`) precisam do Postgres local de pé. Não confirmei que o
  ambiente da lane o tem. Se não estiver, registrar PENDENTE-KAIRO: o texto fica editado no arquivo
  e a publicação fica para quando o banco local existir.

(Q1 e Q2 foram fechadas pela decisão do chefe de 05/11/2026 — ver seção "Decisões do chefe".)

# Migração dos remendos de fala do motor para a conduta (P11)

> Conferido nesta worktree em 05/11/2026: todos os `arquivo:linha` abaixo foram conferidos contra
> o código real; onde divergiam do rascunho anterior, corrigidos (código manda).

## Problema
O motor do vendedor (`src/lib/agent/pi/turno-livre.ts`) carrega ~14 pós-processamentos de fala do
modelo — teto de pergunta, contador de pedido de nome, dedup por conteúdo, balão fixo de handoff,
classificadores em regex — que violam a P11 do `AGENTS.md`: "o código garante só a verdade... conversa
é do prompt: nada de teto, dedup ou contador de recusa em código; tom, repetição e fluidez viram
medida e correção de contexto".

## Solução
Cada remendo migra para (a) a caixa de conduta (`src/lib/agent/prompt-do-vendedor.ts`, partes
editáveis, validadas por `pnpm prompts:check` contra `caixa_de_prompt`) e (b) sinal de
observabilidade (`src/lib/observability/sinais/`, linha `[sinal]` grepável — `publicar.ts:49`) —
nunca guarda silenciosa. O que é FATO (identidade, card que existe, gate P5 de produto) fica em código.

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
- **Q2 — fechada.** A NLU do lance vive de `turno-livre.ts` ~431 a ~940 (não 270-720). Migra TUDO
  (`declaracaoDoTurno` :491, `lanceEPrazoDoTurno` :938, `MOLDES_DO_LANCE` :762, travas, máscara) para
  tool aditiva `informar_perfil` com schema; o servidor valida (bounds, `parse-asset-value` como
  tipo) e grava em `funnel.qualifyAnswers`/`currentCategory` — o mesmo lugar de hoje
  (`turno-livre.ts:1188-1190`). `cards-livres.ts` não muda (`perfilDeclarado` em
  `cards-livres.ts:434,736,895` recebe o mesmo tipo). `capturarIdentidadeDoTexto` FICA.
- **Q3 — pendente-KAIRO.** `pnpm eval` precisa de app+Bevi; testar na onda 3; se não rodar,
  PENDENTE-KAIRO (gate cai para testes pontuais + playground manual, registrado no relatório).
- **Item 9:** `picarEmBaloes` é FORMA (não reescreve palavra) — fica. Tetos 260/3 são defaults
  configuráveis (já são: `baloes.ts:115-116` aceita `opts.maxChars`/`opts.maxBaloes`);
  sinal quando o teto atinge.
- **Item 13:** a suspensão de anúncio colada a card TAMBÉM sai (corte de fala); sinal
  `narracao_de_ferramenta`; a conduta "não anuncie o card" já existe no sufixo
  (`prompt-do-vendedor.ts:75`).
- **Sinais novos via publicarScores** (linha `[sinal]`): `fala_com_multiplas_perguntas`,
  `pedido_de_nome_recorrente`, `lista_no_texto`, `promessa_de_atendimento`,
  `fala_em_primeira_pessoa`, `fala_repetida_no_turno`, `turno_sem_fala`,
  `teto_de_balao_atingido`, `fala_contradiz_mesa`, `narracao_de_ferramenta`, `informar_perfil`.
- **Item 11:** `clientePedeHumano` (fato do cliente) FICA como gatilho;
  `clientePedeFechar`/`decidirRota` de fala do modelo SAI — o modelo declara via tool; o gate P5
  fica no servidor (mesa só com `temProposta` ou pedido explícito).

## Variáveis
- RAIZ: `/Users/kairo/orca/workspaces/aja-agora/chefe-remendos-fala`   BASE: `develop` (b149578a)
- PROJETO: aja-agora   GATE: `pnpm -s typecheck` + teste do arquivo tocado + `pnpm prompts:check` + `pnpm eval`

## Fluxo
1. **Planejar** — este plano; conferir `arquivo:linha` de cada remendo abaixo (conferido nesta
   sessão, 05/11/2026).
2. **Construir** — três ondas, disjuntas por arquivo (seção final). Commits por remendo,
   Conventional Commits, sem `--no-verify`. Não tocar: `db/schema`, `identity`, `telefone-ou-cpf`,
   `parse-asset-value` (fato).
3. **Verificar** — gate por onda (seção final) e, no fim, `pnpm eval` + playground (P12).

## Contexto — o que muda (remendo por remendo, `arquivo:linha` conferido)

| # | remendo | onde (conferido nesta worktree) | migra para |
|---|---|---|---|
| 1 | `manterUmaPergunta` corta a 1ª pergunta | `uma-pergunta.ts:21` (função), `:16` (`contarPerguntas`); chamado em `montarTrechoDeSaida` (`turno-livre.ts:217`, chamada em `:255`) | caixa: parte "descoberta" — "uma pergunta por mensagem, no máximo uma interrogação por fala"; sinal `fala_com_multiplas_perguntas`; na onda 1 a função vira medida (retorna o texto inalterado + emite o sinal), assinatura preservada |
| 2 | teto/contador/apagador de pedidos de nome | `pergunta-de-nome.ts:12` (`LIMITE_DE_PEDIDOS_DE_NOME`), `:28` (`pedeONome`), `:34` (`pedidosDeNomeNoHistorico`), `:42` (`semPerguntaDeNome`); call sites `turno-livre.ts:1329`, `:1408-1416` | caixa: parte "abertura" ("o nome se pede na abertura e no máximo mais uma vez, sempre amarrado a um motivo"); sinal `pedido_de_nome_recorrente` (fato do histórico conta no sinal, não no corte) |
| 3 | `remover-lista-de-texto` no `garantirChip` | `chips.ts:120` (`listaDeOpcoes`), `:224` (`garantirChip`) — o corte do texto quando a lista vira botão | chip continua como derivação (`chipDoTurno`/`garantirChip`), mas **sem cortar fala**: a lista marcada fica no balão e o chip fica ao lado; conduta ("cartas-e-cards"): "alternativas vão no card, nunca escritas no texto"; sinal `lista_no_texto` |
| 4 | balão fixo de handoff | `handoff.ts:54` (`linhaFinalDoHandoff`); usado em `montarTrechoDeSaida` (`turno-livre.ts:245`) e `soltarTrecho` (`turno-livre.ts:1373`, chamada em `:1395`) | a tool `falar_com_humano`/`abrir_caso` devolve o FATO (`caso-aberto`/`sem-lead`); a fala de aceitar transferência é do modelo, com a conduta de "atendimento-humano"; sinal `promessa_de_atendimento` |
| 5 | `RE_DE_PROMESSA` classificador de balão | `handoff.ts:35`; usado em `turno-livre.ts:1407`, `:1442` para decidir se o turno é handoff | flag da tool `falar_com_humano` (o modelo declara a intenção); `semPromessa` (`handoff.ts:164`) vira só sinal (`promessa_de_atendimento`) |
| 6 | `removerLinhasDePlano` (vocabulário de plano) | `src/lib/agent/orchestrator/vazamento.ts:165` (`ROTULO_DE_PLANO`), `:171` (`PASSO_EM_PRIMEIRA_PESSOA`), `:177` (`INTERJEICAO_SOLTA`), função em `:182`; `passaFinal` em `:224` | **mantém só vazamento de máquina**: rótulo de plano `Step 2:`-style e JSON/tool-name ficam (máquina); `PASSO_EM_PRIMEIRA_PESSOA` ("Pergunto o valor.") e interjeição saem do corte e viram sinal (`fala_em_primeira_pessoa`) |
| 7 | dedup `jáSoltos` por conteúdo | `turno-livre.ts:274` (`criarSeparadorDeTrechos`, normalização/comparação de texto em `aoDelta`) | dedup só por `toolCallId`/sequência de stream; repetição por conteúdo vira sinal (`fala_repetida_no_turno`) e conduta |
| 8 | fala de reserva de turno mudo | `turno-livre.ts:1825-1826` ("Achei essas opções..."/"Desculpa, me perdi...") | sinal (`turno_sem_fala`) + fala na conduta (o que fazer quando nada sai); o turno nunca fica sem próximo passo (P0 fica, mas quem o sustenta é o prompt; o sinal mede o caso) |
| 9 | `picarEmBaloes` MAX_CHARS/MAX_BALOES fixos | `baloes.ts:24` (`MAX_CHARS=260`), `:27` (`MAX_BALOES=3`), `picarEmBaloes` em `:111` (já aceita `opts` em `:115-116`) | picagem é FORMA (não reescreve palavra) — mantém a função; tetos 260/3 são defaults configuráveis (via `opts`, já suportado); sinal `teto_de_balao_atingido` no call site quando o teto é atingido |
| 10 | NLU paralela em regex da fala do cliente | `turno-livre.ts` ~431-940: `declaracaoDoTurno` (`:491`), `lanceEPrazoDoTurno` (`:938`), `MOLDES_DO_LANCE` (`:762`), travas e máscara do lance | tool aditiva `informar_perfil` com schema: o modelo declara categoria/valor/lance/prazo; servidor valida (bounds, `parse-asset-value` como tipo) e grava em `funnel.qualifyAnswers`/`currentCategory` — mesmo lugar de hoje (`:1188-1190`); **`capturarIdentidadeDoTexto` (`turno-livre.ts:107-215`) FICA** |
| 11 | classificador de intenção da mesa | `rota-do-humano.ts:7` (`clientePedeFechar`), `:12` (`decidirRota`); chamado em `turno-livre.ts:1312` | `clientePedeFechar`/`decidirRota` de fala do modelo SAEM (o modelo declara via tool com schema); `clientePedeHumano` (fato do cliente) FICA como gatilho; **gate P5 se mantém no servidor** (mesa só com `temProposta` ou pedido explícito — validação de tool contra o estado, não guarda de fala) |
| 12 | `corrigirComparacoes` reescreve a fala | `comparacao-de-prazo.ts:223` (`corrigirComparacaoDeParcela` troca palavras), `:301` (`semPrazoInventado` corta oração), `:400` (`corrigirComparacoes`); chamado em `montarTrechoDeSaida` (`turno-livre.ts:237`) | mantém a VERIFICAÇÃO como sinal (`fala_contradiz_mesa`), remove a reescrita: a conduta manda a fala bater com a mesa e o card trazer o número certo; sinal alimenta o eval |
| 13 | corte de narração por vocabulário fechado | `narracao.ts:21` (`LIMITE_DE_CARACTERES=120`), `:25` (`VOCABULARIO`) | sinal (`narracao_de_ferramenta`); o corte (inclusive o anúncio colado a card) deixa de existir; a conduta "não anuncie o card" já existe no sufixo (`prompt-do-vendedor.ts:75`) |
| 14 | sanitização do contactName | `system-do-vendedor.ts:22-43` (`linhaDeFato`): o nome chega CRU na fala do system (`:36`) | sanitizar na ORIGEM (`saveContactName`, `src/lib/leads/contact-capture.ts:118`): uma linha, sem quebra/controle, teto 60 chars; `linhaDeFato` re-sanitiza (defesa em profundidade) — decisão Q1 |

### O que NÃO muda
- `capturarIdentidadeDoTexto` e `mascararTodas` (`turno-livre.ts:107-215`) — captura de identidade
  é FATO (garantia), não remendo de fala.
- `semRepetirChamada` (`turno-livre.ts:338`) — dedup por `toolCallId` é FATO (efeito único), não
  é o dedup de fala do item 7.
- `passaFinal` continua com scrub de CPF, JSON de argumento e nome de tool — máquina, não fala
  (`vazamento.ts:224-226`).
- `chipDoTurno`/`garantirChip` como derivação de toque, `picarEmBaloes` como forma (item 9 muda só
  o teto/sinal), cards factuais por resultado da tool (P10/P11).
- Gate P5 no servidor (item 11), `abrirCasoNaMesa`, fila de vendedores (`tools-humano.ts`), mesa.
- `clientePedeHumano` (fato do cliente) como gatilho (decisão do chefe).
- `cards-livres.ts` não muda (decisão Q2).
- Premissas LGPD/PII: nada de mascaramento novo (decisão do dono, 27/10/2026).

---

## Seção final — blocos por onda

### Onda 1 — folhas, sem `turno-livre.ts` (8 blocos disjuntos)

**Arquivos:** `src/lib/agent/orchestrator/vazamento.ts` (6); `src/lib/agent/pi/uma-pergunta.ts` +
`src/lib/agent/pi/pergunta-de-nome.ts` (1, 2); `src/lib/agent/pi/chips.ts` (3);
`src/lib/agent/pi/narracao.ts` (13); `src/lib/agent/pi/comparacao-de-prazo.ts` (12);
`src/lib/agent/pi/system-do-vendedor.ts` (14); `src/lib/agent/prompt-do-vendedor.ts` (conduta);
`src/lib/agent/pi/tools-livres.ts` (tool aditiva `informar_perfil`, flag em `falar_com_humano`).
Cada remendo num commit próprio.

**Regra das funções de corte:** as funções de corte viram MEDIDA — retornam o texto inalterado e
emitem o sinal `[sinal]`; assinatura preservada; os testes de cada arquivo ajustados para a nova
semântica.

**Gate por bloco (comando):** `pnpm -s typecheck` && `pnpm vitest run <teste do arquivo tocado>` &&
`pnpm prompts:check` (por commit).

**Texto de conduta a inserir (nas partes, publicadas em `caixa_de_prompt`):**
- parte **descoberta**: "uma pergunta por mensagem, no máximo uma interrogação por fala".
- parte **abertura**: "o nome se pede na abertura e no máximo mais uma vez, sempre amarrado a um motivo".
- parte **cartas-e-cards**: "alternativas vão no card, nunca escritas no texto".
- parte **atendimento-humano**: "aceite o pedido na sua fala, diga que está chamando o consultor,
  NUNCA prometa prazo/a caminho/em instantes; de madrugada diga e combine retorno".
- **sufixo**: "nunca escreva raciocínio interno: fala de vendedor começa no cliente ou na oferta".

### Onda 2 — `turno-livre.ts` sozinho (onda única)

**Arquivos:** `src/lib/agent/pi/turno-livre.ts` (todos os call sites: `:237`, `:255`, `:1312`,
`:1329`, `:1408-1416`, `:1825-1826`, NLU ~431-940) e, no mesmo bloco, o sinal
`teto_de_balao_atingido` no call site de `picarEmBaloes`. Nenhum outro arquivo de remendo toca
esta onda.

**Conteúdo:** desligar/remover call sites dos itens 1, 2, 4, 5, 6 (o corte em `vazamento.ts` já
saiu na onda 1), 7 (dedup por conteúdo FORA; fica dedup por `toolCallId`/sequência), 8 (turno mudo
por re-execução com nota de contexto, sinal `turno_sem_fala`), 10 (tool `informar_perfil`), 11
(handoff pela flag da tool; `clientePedeHumano` fica como gatilho; gate P5 no servidor).

**Gate por bloco (comando):** `pnpm -s typecheck` && `pnpm vitest run src/lib/agent/pi/turno-livre.test.ts
src/lib/agent/pi/tools-livres.test.ts` (adaptar ao(s) teste(s) do arquivo).

### Onda 3 — gates

**Gate (comando):** `pnpm prompts:check` && `pnpm eval` — gate lento justificado pelo risco alto
(fala em produção): os golden falam com o app real. **Q3:** `pnpm eval` precisa de app+Bevi;
testar nesta onda; se não rodar, PENDENTE-KAIRO — o gate cai para os testes pontuais + playground
manual, registrado no relatório. Leitura dos sinais nas conversas de teste.

---

## Riscos
- **Trabalho suído em develop (registrado pelo briefing):** há mudança não commitada tocando
  `chips.ts`, `baloes.ts`, `sugestoes.ts`, `prompt-do-vendedor.ts`, `turno-livre.ts`,
  `tools-livres.ts`, `cards-livres.ts`. O merge pode conflitar. Mitigação: rebasear esta worktree
  antes de cada onda; os números de linha acima foram conferidos NESTA worktree e podem deslizar.
- **Fala que piora sem a guarda:** os remedos existem por defeito medido (6 perguntas com duas
  perguntas; 3 pedidos de nome; promessa de handoff). A caixa pode não segurar de imediato — é o
  risco assumido da P11, e o sinal é o que prova. Plano de volta: conduta mais forte na parte,
  nunca remendo em código (se houver regressão de fato — dinheiro, dado — aí é código, não fala).
- **Dedup por conteúdo removido (7):** a duplicata do stream volta a aparecer na tela em falha de
  provedor; mitigação: dedup por `toolCallId`/sequência fica, e o sinal (`fala_repetida_no_turno`)
  aponta o caso.

## Definição de pronto
Risco: **alto** — toca fala em produção, contrato externo do canal e tools de fechamento.

- [ ] Nenhum remendo da lista 1-13 corta, reescreve ou classifica FALA em código (exceto máquina:
  CPF, JSON, tool-name, id interno — item 6 reduzido a isso; sanitização do nome no item 14 é FATO).
- [ ] Cada comportamento migrado tem: (a) texto na parte da caixa correspondente, publicado em
  `caixa_de_prompt` (a `prompts:check` passa); (b) sinal `[sinal]` emitido no lugar da guarda, entre
  os 11 da decisão do chefe.
- [ ] `capturarIdentidadeDoTexto`, `semRepetirChamada`, gate P5, `clientePedeHumano` e scrub de
  máquina intactos, com os testes deles verdes.
- [ ] `pnpm -s typecheck` verde; teste ao lado de cada arquivo tocado verde.
- [ ] `pnpm eval` verde (cenários ajustados: os que esperavam corte — ex. `golden-probe-i1-empty-turn`,
  `golden-probe-p4-perguntas-compostas`, `golden-pede-humano` — refletem a nova conduta, não o
  remendo). Se o ambiente não rodar, PENDENTE-KAIRO registrado.
- [ ] Gap de cobertura declarado: o que o eval não prova (turno longo, WhatsApp real) fica na
  lista do relatório.
- [ ] Relatório com os sinais observados nas conversas de teste (antes/depois).

## Como você será avaliado
- Um ponto por item da Definição de pronto e por onda entregue com gate próprio.
- **Falha imediata:** voltar a cortar fala em código sob outro nome; tocar `turno-livre.ts` fora
  da onda 2; publicar conduta sem `prompts:check`; declarar pronto sem o reporte de verificação.
- **Falha imediata:** remover garantia de FATO (identidade, card existente, P5,
  `clientePedeHumano`) junto com o remendo.
- Trabalho sujo de develop que vira conflito: para e reporta, não resolve por contorno.

## Perguntas em aberto
- **Q3** (parou em: demanda — PENDENTE-KAIRO): `pnpm eval` fala com o app real (Bevi/credencial).
  Não confirmei que o ambiente da lane o executa — ninguém rodou comando. Confirmar na hora da
  onda 3; sem ele, o gate de risco alto fica nos testes pontuais + playground.

(Q1 e Q2 foram fechadas pela decisão do chefe de 05/11/2026 — ver seção "Decisões do chefe".)

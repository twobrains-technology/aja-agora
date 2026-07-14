---
id: FIX-340
titulo: "CPF pedido 2× (com desculpa fabricada) + botão 'Tenho interesse!\\n\\n' quebrado + números divergentes simulação × proposta"
status: done
bloco: bloco-c-whatsapp-invariantes
arquivos:
  - src/lib/agent/orchestrator/system-context.ts
  - src/lib/agent/orchestrator/index.ts
  - src/lib/agent/system-prompt.ts
  - src/lib/whatsapp/interactive-handlers.ts
rodada: 2026-07-14 — loop-de-goal desamarra, rodada 1
executado_em: 2026-07-14
---

# FIX-340 — três defeitos menores do WhatsApp (mesmo canal, mesmos arquivos)

## a) CPF pedido duas vezes, com desculpa inventada
Dossiê auto: o agente pede o CPF de novo e **fabrica uma justificativa** — "não consigo ver
dados anteriores" — que **não existe em lugar nenhum do código**. É alucinação pura.
Root cause: `identify-capture.ts:123` devolve `handled:false` quando o CPF já foi coletado, e o
turno cai no modelo sem o fato de que a identidade JÁ existe.
→ O contexto do turno tem que dizer ao modelo que a identidade já está coletada.

## b) Botão quebrado: `"Tenho interesse!\n\n"`
O título do botão vem com quebras de linha. Root cause achado pelo juiz: **contradição literal
dentro do próprio system-prompt** — a linha ~203 PROÍBE nomear o botão e a linha ~559 MANDA
nomear. Resolva a contradição (uma das duas sai) e limpe o título (`trim`).

## c) Números divergentes entre a simulação e a proposta real
Dossiê serviços: a simulação mostra um valor e a proposta criada tem outro. Root cause:
`interactive-handlers.ts:512-536` usa o valor NATIVO do catálogo em vez do valor-alvo do
usuário. (Em moto o mesmo sintoma foi visto, mas o juiz registrou como HIPÓTESE — confirme
antes de mexer.)

## Regressão exigida
- (a) Integração: identidade já coletada → o agente NÃO pede o CPF de novo.
- (b) Unit: título do botão sem `\n`; o system-prompt não se contradiz (teste estrutural).
- (c) Integração: o valor da proposta criada == o valor da simulação apresentada.

## Execução (2026-07-14)

### (a) CPF pedido 2x
Root cause confirmado (investigação): `identify-capture.ts` não mudou — a captura textual
determinística já está correta (`handled:false` é o comportamento CERTO quando a identidade já
foi coletada, senão ela sequestraria texto legítimo do resto do funil). O gap real é que,
depois desse `handled:false`, o texto cai no LLM livre SEM nenhum fato dizendo "a identidade já
está coletada" — daí a desculpa fabricada. Fix seguiu o padrão já estabelecido (`exactnessFacts`/
`confusedAboutGate`, mesmo arquivo, mesma filosofia "invariante vira FATO, fala continua do
modelo"): `buildSystemContext` (`system-context.ts`) ganhou `identityAlreadyCollected`, computado
em `index.ts` via `extractCpf(userText) !== null || looksLikeIdentityResendComplaint(userText)`
quando `meta.identityCollected === true`. Zero texto scriptado — só o fato + a proibição
explícita de alegar limitação técnica falsa.

### (b) Botão "Tenho interesse!\n\n"
Causa confirmada e resolvida: a contradição em `system-prompt.ts` (linha ~203 proíbe nomear o
botão, linha ~559 mandava citá-lo entre aspas) — removida a instrução de citação em ~559,
mantendo a proibição de ~203. Investigação técnica: a quebra de linha NÃO vinha do widget real
(os títulos de botão em `formatter.ts` já eram strings estáticas limpas, `"Tenho interesse!"`,
sem `\n`) — vinha do MODELO tentando ecoar/citar o rótulo em texto livre, que às vezes inseria
quebra de linha ao redor do "!" final. Removendo a instrução de citação, a causa raiz desaparece
por completo (o modelo nunca mais tenta citar o botão). Teste de regressão trava os títulos reais
(`formatter.fix-340b-botao-tenho-interesse.test.ts`, passa sem mudança de código — já eram
limpos) + teste estrutural do prompt (falha RED contra a versão antiga, prova a contradição).

### (c) Números divergentes simulação × proposta
**Serviços (CONFIRMADO, corrigido):** `handleGroupSelected`/`handleSimulate`
(`interactive-handlers.ts`) nunca persistiam `meta.recommendedOffer`/`recommendedAdministradora`
no momento do clique — só a heurística de texto do `runner.ts` (`isExploratoryWhatIf`, baseada em
MENÇÃO DE VALOR no texto do turno) re-ancorava depois de um novo `simulation_result`. Como o
"texto" de um clique de botão é só o nome da administradora (nunca o valor), a heurística
classificava a re-simulação como "exploratória" e MANTINHA o snapshot velho de uma recomendação
anterior — a proposta real (`contract-input.ts`, que lê `meta.recommendedOffer.creditValue`)
fechava com o número velho. Fix: os dois handlers agora ancoram `recommendedOffer` DIRETO com o
`GroupDetails` do clique, ANTES de disparar o directive — clique de botão é SEMPRE escolha
determinística do usuário, nunca what-if hipotético do modelo, então não deveria depender da
heurística de texto pra ancorar.

**Moto (HIPÓTESE do juiz — investigado, NÃO REPRODUZIDO, nenhum código mexido):** rastreei o
caminho completo — o "Banco do Brasil" do turno 5 vem do HERO server-ranqueado
(`pickBestRankedGroup`/`coerceRecommendationPayload`), não de um clique `group_<id>` nem de
`handleGroupSelected`. A carta "indicativa" (R$35.738, Descoberta/`BeviSelfContractAdapter`) e a
carta "real" (R$46.109, Fechamento/`ProposalGateway.simulate()`, API de parceiro vinculada ao
CPF) vêm de DUAS APIs Bevi estruturalmente diferentes — e o sistema JÁ tem o mecanismo de aviso
de ajuste (FIX-197/240/247/261/281) que disparou corretamente nos dois pontos do transcript
("você pediu 35 mil, mas a carta real ficou em R$35.738 — ajuste de 2%" no turno 8; "você pediu
~R$35.000 — a carta real ficou em R$46.109" no turno 15). Isso é comportamento ESPERADO e
documentado, não bug — "corrigir" isso quebraria o aviso de transparência que já funciona.
**Achado observacional fora de escopo, não corrigido:** parcela narrada em texto livre no turno 8
("~R$2.300/mês") diverge da parcela do card real no turno 10 ("R$3.240,25/mês") pro MESMO
grupo/prazo — parece ser o modelo narrando um número ANTES de qualquer `simulate_quota` ter
rodado (proibido por `directives.ts:197`), não o bug de creditValue perguntado.

Testes: `system-context.fix-340a-identity-already-collected.test.ts` (novo),
`system-prompt.fix-340b-botao-nao-nomeado.test.ts` (novo, estrutural),
`formatter.fix-340b-botao-tenho-interesse.test.ts` (novo, regressão de título limpo),
`interactive-handlers.fix-340c-ancora-grupo-clicado.test.ts` (novo). TDD confirmado via
`git stash` dos arquivos de produção em cada sub-item (RED → GREEN). Suíte completa
`pnpm test:unit` (382 arquivos, 3516 testes) verde.

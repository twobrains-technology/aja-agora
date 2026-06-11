# CONTEXT — Jornada × Bevi: histórico, diretivas e decisões

> Atualizado: 2026-06-04 · Fonte das diretivas: Kairo (verbal, transcrito)
> Documento canônico do fluxo: [`jornada-canonica.md`](./jornada-canonica.md) ([original .docx](./jornada.docx))

## Histórico — como chegamos aqui

1. **Piloto sem Bevi.** A plataforma nasceu como piloto ANTES da parceria com a Bevi (quem de fato tem os consórcios). A descoberta (passos 1-4) foi construída sobre um **mock rico** (`MockBeviAdapter` + 82 grupos fictícios em JSON) — placeholder deliberado da época.
2. **Bevi entrou.** A integração com a API de Parceiro da Bevi foi construída e validada end-to-end (spec em `docs/integracoes/bevi-api-parceiro-spec.md`), mas só foi plugada no **passo 5** (fechamento), atrás de `PROPOSAL_GATEWAY=bevi`. A descoberta continuou 100% mock — inclusive com guard que **impedia** Discovery via Bevi (`src/lib/adapters/index.ts`).
3. **O cliente trouxe a visão dele.** A jornada que construímos era a NOSSA interpretação do fluxo ideal. O cliente criticou vários pontos e formalizou a visão dele no `jornada.docx`. **A visão deles prevalece sobre o que construímos.**

## Diretivas do Kairo (2026-06-04) — REGRAS

1. **`jornada-canonica.md` é a regra de como o cliente quer.** Não é inspiração — é spec. Divergência = defeito.
2. **Mock de dados de produto será DESTRUÍDO.** Não pode existir arquivo de mock alimentando a jornada. Deletar `src/lib/adapters/mock/` (adapter + `groups.json`/`rates.json`/`contemplation.json`) e qualquer caminho de runtime que sirva dado fictício ao usuário.
3. **O fluxo da Bevi tem que ser integrado DENTRO da jornada canônica.** Bevi é a fonte única de grupos, ofertas, simulações e fechamento.
4. **Simulador (passo 4):** o Bernardo (stakeholder, dono do conceito do "simulador-agulha") ainda **não especificou** como ele deve ser. Nós propomos primeiro → [`proposta-simulador.md`](./proposta-simulador.md).

## Desvios de entendimento do stakeholder (docx × realidade da API)

> O `jornada-canonica.md` é REGRA, mas é a visão do stakeholder — e pode conter
> **desvios de entendimento** sobre o que a API da Bevi realmente faz. Quando a
> realidade técnica contradiz uma premissa do docx, registramos aqui o desvio (o
> docx não vira "defeito do código"; vira premissa a recalibrar com o cliente).

### DES-1 — "Assinatura digital no fechamento" (docx passo 5) é um desvio

- **O docx diz** (passo 5, linha 50): *"Encaminhamento pro fluxo de assinatura digital
  da administradora escolhida (sem o cliente sentir que 'mudou de empresa')"* — assume
  que o fechamento termina numa **assinatura digital self-service**.
- **A realidade verificada (2026-06-04, seguindo os redirects reais):** o
  `consortiumProposalLink` devolvido pelo `choose_offer` da API de Parceiro **NÃO é
  um portal de assinatura**. Ele é um link encurtado (`uselink.me`) que faz `302` para
  um **PDF da PROPOSTA de consórcio** no S3 (`indiky-production-bucket…_consortium.pdf`,
  `Content-Disposition: attachment` → o browser **baixa** o arquivo). O PDF contém a
  simulação consolidada (cliente, segmento, crédito, prazo, parcela, taxa adm, fundo,
  próxima assembleia) — é o **artefato de proposta**, não um documento assinável online.
  (A doc `bevi-consorcio-aderencia.md` supunha redirect para `edigital.beviconsorcio.com.br`
  — **isso estava incorreto**; corrigido.)
- **Verdade de negócio (Kairo, 2026-06-04):** a **assinatura/efetivação é da MESA** —
  etapa posterior, **manual, conduzida pela equipe (back office), NÃO automatizada**.
  *"A questão da assinatura não faz sentido agora porque é um passo posterior."*
- **Decisão de produto:** o card de fechamento (`signature_handoff`) **não promete mais
  "assinatura"** — apresenta a **proposta pronta** ("Sua proposta está pronta" / "Ver
  minha proposta") mantendo a continuidade da Aja Agora ("a gente segue com você até a
  contemplação"). O artifact-type interno segue `signature_handoff` (compat); só a
  semântica/copy mudou. O upload de documentos (`document_upload`, portal
  `conexia.agxsoftware.com`) continua válido e é coisa diferente do PDF de proposta.
- **Status (2026-06-04):** **NÃO sabemos** se a Bevi tem fluxo de assinatura digital via
  API/embedded/white-label. Até onde fomos, a assinatura é **só via mesa, manual, não
  automatizada** — e a jornada **não chegou nesse ponto ainda**. **PASSO PARA O FUTURO:**
  não construir, não prometer e não assumir assinatura embutida; quando/se a parceria
  destravar um fluxo automatizado (+ webhook de conclusão — Q10 da aderência), reavaliar.

## O que a auditoria de 2026-06-03/04 encontrou (resumo)

| Achado | Evidência |
|---|---|
| Passos 3-4 serviam 100% dados mock (82 grupos fictícios, premissas hardcoded: lance 20%, embutido 30%, INCC 6%, contemplação 43%) | `src/lib/adapters/mock/mock-bevi-adapter.ts`, `data/*.json` |
| Bevi real só no passo 5, e default `PROPOSAL_GATEWAY=mock` — usuário nunca via número real | `src/lib/adapters/index.ts:43` |
| Passo 4 divergia do docx: simulador 3/6/12 não garantido, fluxo de caixa mês a mês inexistente, "outras opções" sem surfacing determinístico | auditoria agentes B/C |
| Passo 2: valor do lance nunca perguntado (derivado silencioso = 30% do crédito) | `src/app/api/chat/route.ts:590` |
| Simulador-agulha (conceito do Bernardo) existia wired mas só em branch condicional do modelo — fora do caminho padrão | `system-prompt.ts:213`, `contemplation-dial.tsx` |
| Eval da jornada sem LLM-judge (só regex/toContain); rubric existente mede jornada antiga (sucesso=lead, não contrato) | `tests/eval/jornada-aja-agora.eval.test.ts`, `src/lib/eval/rubric.ts` |

## Fatos técnicos da Bevi que moldam o fluxo

- **Trilho A — API de Parceiro** (`api.uxvision.tech`, token): proposta-first. `simulate` devolve ofertas de 8 campos (administradora, grupo, valorCarta, parcela, taxaContemplacao…) — **não** tem prazo/taxas/correção. Serve o fechamento (passo 5).
- **Trilho B — Self-contract** (`/unauth/product-self-contract/...`, **sem token**): devolve ofertas RICAS (~68 campos: prazo, adminFee, reserveFund, INCC/IPCA, embeddedBid, próxima assembleia…). **É o trilho que alimenta a descoberta real (passos 3-4).** Documentado em `docs/integracoes/bevi-api-requests.md`; mapper de 68 campos já existe (`src/lib/adapters/bevi/offer-mapper.ts`).
- **Restrição estrutural:** o `create-proposal` do Trilho B exige **CPF + celular + aceite LGPD ANTES de simular**. Não existe simulação real anônima em nenhum trilho.

## Decisões decorrentes (a validar em plano de implementação)

- **D1 — CPF antecipado.** Pra jornada servir dados reais nos passos 3-4, a coleta de CPF+celular+LGPD precisa acontecer ao FIM do passo 2 (no gancho do próprio docx: *"Com essas informações, a Aja Agora vai analisar várias administradoras…"*). É como a própria Bevi opera no funil dela. O docx posiciona "dados pessoais" no passo 5 — o passo 5 mantém o restante (documentos, assinatura), mas CPF/celular sobem por exigência técnica da plataforma.
- **D2 — Mock de runtime morre; fixture de teste é outra coisa.** Os `__fixtures__/*.json` da Bevi são **capturas de respostas reais** usadas em teste determinístico (cassettes) — ficam. O que morre é todo dado fictício servível em runtime (`adapters/mock/`). `MockProposalGateway` também sai do runtime; testes usam seam/fixture.
- **D3 — Ambiente.** Sem mock, dev/E2E batem na Bevi de verdade. ⚠️ Risco operacional: `create-proposal` cria proposta REAL (1 ativa por device). Precisamos de hash/loja de homologação da Bevi ou política de CPF de teste antes de E2E automatizado contra o trilho real. **Pendência a resolver com a Bevi.**
- **D4 — Eval Camada 3 com LLM-judge.** Rubric dedicada da jornada (fidelidade por passo + tom do docx + fechamento-em-contrato), via `judgeConversation` existente. Design completo produzido na auditoria.

## Decisões adicionais (2026-06-04, rodada "perfeição do eval")

- **D5 — Resumo da contratação: WhatsApp only.** O docx (linha 52) pede "WhatsApp/e-mail";
  a jornada coleta celular (gate identify, D1) mas NÃO coleta e-mail — o resumo vai por
  WhatsApp (`src/lib/bevi/contract-summary.ts`). Sem canal configurado ou com falha:
  `meta.contractSummaryPending=true` + log (nunca envio fingido). E-mail entra se/quando
  a jornada coletar e-mail.
- **D6 — Limitação de fonte (passo 4, resumo por opção).** A oferta self-contract da Bevi
  NÃO fornece reputação da administradora nem histórico de contemplações por assembleia.
  Exibimos só o que a fonte dá (carta, parcela, prazo, tipo de grupo, lance/embutido,
  contemplados/mês via `monthlyAwardedQuotas`). A rubric do judge declara a limitação:
  não pune ausência, pune invenção.
- **D7 — Copy do fechamento centralizada.** `src/lib/bevi/closing-presentation.ts` e
  `other-options.ts` são módulo único de copy/artifacts dos handlers determinísticos —
  route (produção) e harness do eval consomem o MESMO código (DRY de copy; o eval valida
  produção de verdade).
- **Lição BUG-BEVI-EMPTY-ENV:** docker-compose `${VAR:-}` injeta string VAZIA — loaders de
  env tratam vazio/whitespace como ausente (`(env ?? "").trim() || default`). Erros de
  discovery tools são logados estruturados antes de virar tool-error pro modelo.
- **D8 — Passos 6-7 do docx: fora do escopo desta fase (declarado).** Passo 6 ("Concluir")
  está vazio no docx. Passo 7 (pós-venda: comunicados automáticos, lembretes de assembleia,
  sugestões de lance, celebração pós-contemplação, indicação, dash) depende de
  monitoramento contínuo de assembleias e canal transacional ativo — é fase própria de
  produto, planejada DEPOIS do fechamento (passo 5) estar em produção. O eval da jornada
  cobre passos 1-5; o passo 7 entra no backlog com plano de teste próprio quando for
  construído. (Registrado a pedido da revisão adversarial — buraco reconhecido, não
  silenciado.)

## Decisões da rodada de correções (2026-06-05, testes manuais do Kairo)

- **D9 — "Planeje sua conquista" no passo 2 (FIX-3).** O gate `credit` deixou de ser 2
  sliders e virou o componente dinâmico de 4 indicadores interligados (valor do bem ·
  quando quer usar · parcela · lance) + opt-in de lance embutido, em **modo estimativa de
  mercado** (selo obrigatório — a Bevi não simula sem CPF, D1). Os campos preenchem
  `qualifyAnswers` e o funil PULA os gates já respondidos; o agente confirma como
  **vendedor** (híbrido aprovado pelo Kairo), sem re-perguntar. **Estende o conceito do
  Bernardo** (proposta-simulador) — o aval dele segue pendente. O simulador do passo 4
  PERMANECE, com números 100% da oferta ativa (payload coagido server-side — FIX-6).
- **D10 — Lance embutido educa TODO MUNDO (FIX-4).** O gate `lance-embutido` dispara pra
  qualquer resposta do lance (Sim/Não/Talvez) — o próprio docx diz que ele "ajuda quem
  não possui todo o valor do lance hoje". Interpretação fixada na jornada-canonica.md.
- **D11 — Nenhum número sem fonte real (FIX-8).** `necessaryBidToContemplate` vem da
  oferta ou a linha é OMITIDA (fallback heurístico de 43% removido; 0 explícito não vaza).
- **D12 — Identidade não se pede duas vezes (FIX-9).** `contract_form` vira confirmação
  (CPF mascarado server-side via `loadIdentity`; submit `useStoredIdentity` — o CPF
  completo nunca volta pro browser).
- **D13 — Reveal honesto (FIX-7).** Anúncio com o número REAL de opções; opção única =
  card único (recommendation_card suprimido pelo runner); `insufficientOptions` é
  comunicado com transparência; badge de score vira rótulo qualitativo.
- **Camada 3 (eval LLM real): cota do workspace Anthropic esgotada em 2026-06-05**, volta
  2026-07-01 — evals com LLM real pulam como INCONCLUSIVOS (probe em
  tests/eval/anthropic-availability.ts). Re-rodar a Camada 3 quando a cota voltar.

## Decisão de produto (2026-06-11, Bernardo) — cards DIRETOS, sem composição de custos

- **D14 — Cards não exibem taxa de administração, seguro, fundo de reserva, custo total
  nem taxa efetiva.** Decisão do Bernardo (stakeholder): esses números assustam o leigo, a
  apresentação tem que ser direta. Removidos de `recommendation_card` (tile "Taxa adm" +
  fator de score) e de `simulation_result` (bloco de composição inteiro + taxa efetiva),
  nos dois canais (web em `components/chat/artifacts/`, WhatsApp em `whatsapp/formatter.ts`).
  Os campos seguem no **payload** (o `adminFee` ainda entra no cálculo do score; a oferta
  Bevi ainda traz a composição) — só não são **exibidos**.
- **Disclosure legal preservada (CMN 4.927/2021 + CDC art. 37).** A composição completa de
  custos é exigência regulatória pré-assinatura — mas o binding legal é a **assinatura na
  mesa** (DES-1), não o "Tenho interesse". A composição vive no **PDF da PROPOSTA**
  (`consortiumProposalLink`), aberto pelo `signature_handoff` → "Ver minha proposta", que o
  cliente vê ANTES da assinatura. Logo a disclosure precede o binding → CDC art. 37
  satisfeito sem poluir o card. A regra **Bv2-07** do system-prompt foi reescrita pra
  refletir isso (mantém o encadeamento recommendation→simulation; muda a justificativa de
  "composição vive só no card" para "parcela real + cenário com lance + correção").
- **Não recitar fees proativamente no chat.** O agente não traz taxa adm / seguro / fundo
  de reserva de moto próprio; só responde com valor literal se o usuário perguntar (regra
  de "frases proibidas sobre taxa" segue valendo). Camada 1 cobre: testes de ausência em
  `simulation-result.test.tsx`, `recommendation-card.docx-resumo.test.tsx`,
  `whatsapp/formatter.fees-removal.test.ts`.

## Decisão de produto (2026-06-11, Kairo) — reveal mostra as 3 opções no carrossel

- **D15 — Reveal mostra o recomendado em destaque + o CARROSSEL das opções.** Teste
  manual do Kairo: "ele disse que tinha 3 opções mas mostrou só uma nos cards". O
  reveal anunciava "3 boas opções" mas só destacava a recomendada; as outras 2
  ficavam atrás do botão "Ver outras opções". Agora, com 2+ grupos, o reveal emite
  `present_comparison_table` (carrossel de TODAS as opções, `highlightBestIndex=0`
  destacando a recomendada) junto do `recommendation_card` + `simulation_result`.
  **Mais fiel ao docx** (linha 32 "Encontramos 3 boas opções" + linha 37 "ver
  outras opções pra comparação") — o "sob demanda" era interpretação do comentário
  do código, não do docx. O botão "Ver outras opções" do card de decisão segue
  acessível depois. Mudança no `buildSearchSummaryDirective`
  (`orchestrator/directives.ts`); o runner já libera comparison_table no 1º reveal
  (revealLoopActive=false) e o guard pós-reveal/pós-fechamento segue valendo.
  Camadas 1+2: `jornada-docx-copy.test.ts`, `agent-trajectory.test.ts`
  (REVEAL-ORDER + BUG-REVEAL-3-OPCOES-1-CARD).
- **D15b — `recommendation_card` com `max-w-sm`** (era `w-full` sem cap, "card muito
  grande"). Padroniza com `simulation_result`/`real_offer`. **D15c — `comparison_table`
  perdeu a "Taxa"** (escapou da poda D14; mesma regra Bernardo).
- **D18 — Dial calibrado na OFERTA REAL + card de simulação coagido** (auditoria
  Kairo, 2026-06-11; jornada BB real): o card dizia "lance 49,28% → ~6 meses"
  (dado Bevi) e o dial mostrava "74%" pro MESMO mês — o motor extrapolava por
  cima do dado real (âncora heurística de 25% do prazo em vez do
  `probContemplacaoMeses` da oferta). 5 fixes: **C1** `referenceMonth` calibra
  a curva no par real (lance%, mês) → dial == card; **C2** `coerceDialPayload`
  coage também os números de lance (winningBid/refMonth/maxEmbutido) da oferta
  — extensão do FIX-6; **C3** `coerceSimulationPayload` (novo) coage o payload
  do `simulation_result` contra o retorno REAL do `simulate_quota` (o modelo
  digitava na mão e alucinou receivedCredit = carta cheia); **C4** parcela
  honesta — `paymentAfterContemplation` abate só o lance em DINHEIRO do saldo
  pós-contemplação (embutido reduz crédito, não dívida; morreu a fantasia
  `parcela × (1−lance%)` que mostrava R$ 2.556 onde era R$ 9.829); **C5**
  defaults do PERFIL — dial abre no prazo declarado (27, não 6 hardcoded) e
  confronta o lance declarado ("cobre / não cobre"). Disclaimer corrigido
  ("dados da oferta", não "histórico do grupo" — não temos histórico de
  assembleias; pedido à AGX segue na proposta-simulador.md). Cassette:
  BUG-DIAL-DESCALIBRADO em `tests/regression/agent-trajectory.test.ts`.
  **C6 (confronto de viabilidade quando o orçamento declarado não fecha) →
  FIX-18 no todo-blocks, aguardando conversa.**
- **D17 — Comando oculto `/reset` no chat web** (Kairo, 2026-06-11): reset do
  AGENTE — digitado no input (match exato, espelha o WhatsApp
  `processor.ts`), nunca vira mensagem. Apaga tudo como no WhatsApp ("se o
  dado foi para o funil, pode deletar tbm"): conversa com cascade
  (messages/artifacts/leads/propostas), purga a memória Letta (anon-cookie do
  device + phone da conversa — senão re-identificar com o mesmo celular
  ressuscita o contexto) e regenera o cookie `aja_uid`. Funciona em prod
  (oculto, sem UI); sem auth — dano limitado ao próprio estado (UUID v4).
  Rota `POST /api/chat/reset` + `MemoryAdapter.purgeIdentity` + interceptação
  no `chat-input`. Test plan: `docs/test-plans/reset-web.md`. Limitação
  conhecida (pré-existente): reload da página gera conversationId novo, então
  /reset pós-reload só reseta device/memória — a conversa anterior fica órfã.
- **D16 — ValuePicker (present_value_picker) INTELIGENTE** (Kairo, 2026-06-11):
  os sliders deixam de ser independentes — arrastou **parcela** ou **prazo** → o
  **valor do bem** recalcula ao vivo; arrastou o **bem** → a **parcela** recalcula
  (prazo fixo). Mesma relação do plan-estimate (FIX-3):
  `parcela ≈ bem × (1+taxa_adm_típica[categoria]) / prazo`, premissas
  `TYPICAL_ADMIN_FEE_PCT`/`TYPICAL_TERM_MONTHS`. Engine pura em
  `src/lib/consorcio/value-picker-link.ts` (identifyLinkRoles + recalcLinkedValues);
  papéis identificados por id canônico + heurística (payload é genérico, decidido
  pela LLM) — não identificou com segurança → degrada pro comportamento solto,
  nunca interliga errado. Selo "Estimativa de mercado" quando o link está ativo
  (mesma regra do FIX-3 — nunca apresentar como dado de administradora). Display
  corrigido: abaixo de R$ 10 mil mostra o valor exato ("R$ 1.600", não "R$ 2 mil").
  Camada 1: `value-picker-link.test.ts` + `value-picker.linked.test.tsx`.

## Estado da implementação (2026-06-04, branch `feat/jornada-bevi-lance-embutido`)

| Item | Commit | Estado |
|---|---|---|
| `BeviSelfContractAdapter` + client Trilho B (descoberta real, cache por conversa) | `9992678` | ✅ TDD, fixtures reais |
| Gate `identify` — CPF antecipado, cifrado AES-256-GCM (web form + WhatsApp textual) | `8cd4ed9` | ✅ |
| **Mock de runtime DELETADO** (`adapters/mock/` inteiro; gateway mock fora do runtime; evals com seam de fixtures) | `8495807` | ✅ |
| Gate `lance-value` ("Qual valor aproximado?") — fim da derivação silenciosa de 30% | `82875d8` | ✅ |
| Passo 4 fiel: recomendado PRIMEIRO, oferta determinística do simulador (dial do Bernardo), outras opções determinístico | `6aea8f5` | ✅ |
| LLM-as-judge da jornada (rubric por passo do docx, nightly) | Fase 5 | ✅ |
| Fluxo de caixa mês a mês (docx passo 4) | — | ⏳ aguarda desenho com Bernardo |
| Pré-preencher/pular CPF no `contract_form` do passo 5 (identidade já coletada no passo 2) | — | ⏳ refinamento pendente |
| E2E em tela contra Bevi real | — | 🔒 **BLOQUEADO por D3** |

**Envs novos exigidos em runtime:** `BEVI_SELFCONTRACT_HASH` (descoberta — sem ele falha alto), `IDENTITY_ENC_KEY` (32 bytes base64 — `openssl rand -base64 32`), `BEVI_API_TOKEN` + `PROPOSAL_GATEWAY=bevi` (fechamento). **Não existe mais modo mock.**

## Próxima feature — jornada até o pagamento do boleto (2026-06-05)

Contexto de negócio completo em [`jornada-ate-boleto.md`](./jornada-ate-boleto.md). Resumo:
a jornada hoje termina no "ficha completa" pós-upload, mas entre isso e a administradora
existe a sequência de telas CONEXIA (dados do RG, endereço, comprovante, finalização) que o
usuário preencheria manualmente via `uselink.me` — e o funil de negócio só fecha no **1º
boleto pago** (hipótese: é o evento que destrava a comissão — A CONFIRMAR com a Bevi).
`insert_additional_data` e `consult_proposal_status` já existem no adapter sem call site em
runtime; o que falta mapear é a finalização e tudo após ela (boleto, pagamento) — gaps
G1-G5 listados no doc.

## Pendências externas

- **Bernardo:** validar/ajustar a [`proposta-simulador.md`](./proposta-simulador.md) (o convite + dial já estão no caminho padrão; refinos e fluxo de caixa aguardam o aval).
- **Bevi (D3 — bloqueia E2E real):** o `create-proposal` da descoberta cria proposta REAL com CPF + consulta de bureau (`consultarDados`). Precisamos de **hash/loja de homologação** ou **CPF de teste autorizado** pela Bevi antes de E2E automatizado/manual contra o trilho real. Também pendente: transporte do device fingerprint (mascarado nas capturas) — validar ao vivo se conversas concorrentes colidem no "1 proposta ativa por device".

## Decisões de arquitetura

- **Teto arquitetural — durable workflow (FIX-22, 2026-06-11):** o resume manual via `meta` no Postgres é a ferramenta certa pra conversa síncrona (`< 3s`); durable execution (Vercel WDK + `@platformatic/world` em Docker) entra SÓ na borda assíncrona, quando ela existir (KYC real da Bevi, monitoramento de assembleia). Coexistência, não substituição. Detalhes e gatilhos de adoção: [`../decisions/2026-06-11-durable-workflow-borda-assincrona.md`](../decisions/2026-06-11-durable-workflow-borda-assincrona.md).

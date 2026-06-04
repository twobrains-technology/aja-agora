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
  etapa posterior, conduzida pela equipe (back office), fora do escopo do fechamento via
  API por enquanto. *"A questão da assinatura não faz sentido agora porque é um passo
  posterior."*
- **Decisão de produto:** o card de fechamento (`signature_handoff`) **não promete mais
  "assinatura"** — apresenta a **proposta pronta** ("Sua proposta está pronta" / "Ver
  minha proposta") mantendo a continuidade da Aja Agora ("a gente segue com você até a
  contemplação"). O artifact-type interno segue `signature_handoff` (compat); só a
  semântica/copy mudou. O upload de documentos (`document_upload`, portal
  `conexia.agxsoftware.com`) continua válido e é coisa diferente do PDF de proposta.
- **Pendência com a Bevi:** existe fluxo de assinatura digital via API/embedded/white-label
  + webhook de conclusão? (já estava na lista de perguntas ao parceiro, Q10 da aderência).
  Enquanto não houver, "assinatura sem redirect" não é prometível.

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

## Pendências externas

- **Bernardo:** validar/ajustar a [`proposta-simulador.md`](./proposta-simulador.md) (o convite + dial já estão no caminho padrão; refinos e fluxo de caixa aguardam o aval).
- **Bevi (D3 — bloqueia E2E real):** o `create-proposal` da descoberta cria proposta REAL com CPF + consulta de bureau (`consultarDados`). Precisamos de **hash/loja de homologação** ou **CPF de teste autorizado** pela Bevi antes de E2E automatizado/manual contra o trilho real. Também pendente: transporte do device fingerprint (mascarado nas capturas) — validar ao vivo se conversas concorrentes colidem no "1 proposta ativa por device".

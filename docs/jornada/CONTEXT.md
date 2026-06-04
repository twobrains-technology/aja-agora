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

## Pendências externas

- **Bernardo:** validar/ajustar a [`proposta-simulador.md`](./proposta-simulador.md).
- **Bevi:** ambiente de homologação (ou diretriz de teste) pro Trilho B — ver D3.

# Jornada canônica (`.docx`) × Bevi — Design & Decisões

> **Data:** 2026-05-29
> **Autor:** Claude (sessão autônoma, operador Kairo dormindo)
> **Origem:** `~/Downloads/jornada.docx` (regras do cliente) + `docs/integracoes/` (dossiê Bevi/AGX)
> **Branch:** `feat/jornada-bevi-lance-embutido` · **Saída:** PR aberto (NÃO mergeado)

Este documento registra **todas as decisões** que tomei sozinho (o Kairo delegou explicitamente:
*"Decida aí todas as perguntas do Superpowers com base na sua decisão de código seguro, código bem
resolvido e também com a jornada / teste de eval que vai virar aquela jornada ali do doc"*). Ele é o
artefato de revisão da manhã seguinte.

---

## 1. O que o `.docx` define (jornada canônica do cliente)

7 etapas. Resumo fiel:

1. **Entender a necessidade** — "O que vc deseja conquistar?" (botões Imóvel/carro/moto) → "Como posso te chamar?" → "precisamos fazer mais algumas perguntinhas".
2. **Entender o cliente** — "Já participou de consórcio antes?" (se não → explicação curta + papel da Aja + botão "Entendi, pode continuar"); "Qual o valor aproximado do bem?" (slider); **"Em quanto tempo gostaria de estar com seu bem?"** (mais rápido possível / até 6 meses / 1 ano / 2 anos+ / sem pressa, quero menor parcela); **"Pretende dar um lance pra antecipar?"** (Sim/Não/Talvez). **Se Sim → "Qual valor aproximado?" + explicação de _lance embutido_ + "quer considerar esse tipo de lance nas simulações?"**
3. **Buscar alternativas** — "Encontramos 3 boas opções pro seu perfil. Agora vamos te recomendar a mais adequada."
4. **Avaliar, simular e definir** — "Plano recomendado pela Aja Agora" (destaque) + "Outras opções"; resumo (carta, parcela, prazo, tipo de grupo, lance/lance embutido, benefícios: histórico de contemplações, reputação da admin, contemplados/mês); **simulador de contemplação (3/6/12 meses, com/sem lance e com lance embutido)**; **fluxo de caixa mês a mês** + comparativo com financiamento; **"Esse plano faz sentido?"** (Sim, contratar / ver outras / falar com especialista).
5. **Contratar** — coleta de dados pessoais → **upload/captura de documentos** → encaminhamento p/ assinatura digital; reforços ("Você está contratando da administradora X, escolhida pela Aja Agora"; "A Aja Agora segue com você até a contemplação"); resumo via whats/email; "Parabéns!".
6. **Concluir.**
7. **Pós-venda** — comunicados (assembleia, lance), celebração de contemplação, indicação, dashboard.

Slogan: *"Seu objetivo primeiro. O melhor consórcio depois."*

## 2. Escopo travado pelo Kairo (mensagens da sessão)

- **Limite superior:** *"você vai fazer até a parte dos documentos… é ali que a gente termina essa
  ficha. As outras coisas vão ficar pra outros momentos."* → **Implementar etapas 1–5 até o ponto de
  coleta/envio de documentos.** Etapas 6–7 (pós-venda, dashboard, comunicados automáticos) e a
  finalização da assinatura digital ficam **fora**.
- **Integração Bevi:** *"essa API da BV vai estar disponível assim que eles passarem o API token…
  por hora não está disponível. Mantenha um mock provisório olhando pra aquilo que extraímos via
  Playwright."* → **Mock provisório com o _shape real_ da Bevi** (fixtures `docs/integracoes/assets/segmentos/*/offers.json`). Adapter HTTP real fica **pronto atrás do flag**, sem nenhuma chamada live.
- **Simulador:** *"nem eles sabem por hora, defina o que é melhor… você como especialista de consórcio
  resolve."* → decisão minha (ver §4).

## 3. Gap analysis (implementado hoje × jornada-alvo)

| Etapa doc | Estado atual | Gap → ação |
|---|---|---|
| 1 necessidade | concierge welcome + captura de nome | ✅ alinhado (mantém 4 categorias; doc cita 3 como exemplo) |
| 2 experiência | gate `experience` + `consent` | ✅ alinhado |
| 2 valor | `present_value_picker` (slider) | ✅ alinhado |
| 2 **prazo** | opções `Já / 1-2 anos / 3-5 anos / Sem pressa` | 🔧 **trocar pelas 5 opções do doc + mapear `objetivo`** |
| 2 **lance** | gate `lance` (sim/talvez/não) → vai DIRETO pra busca | 🔧 **NOVO: se "sim", capturar valor + educar lance embutido + opt-in** |
| 3 buscar | search reveal + comparison_table | 🔧 afinar copy "3 opções" |
| 4 recomendar | `recommendation_card` + `comparison_table` | ✅ + surface contemplados/mês |
| 4 simular | `simulate_quota` + `present_simulation_result` | 🔧 **enriquecer com cenário lance embutido (shape Bevi)** |
| 4 decisão | disparo por sinal textual | 🔧 **NOVO: card "Esse plano faz sentido?" (3 ações)** |
| 5 contratar | `lead_form` (nome/tel/email) | 🟡 **staged** (ver §6) |
| 6–7 | — | ⛔ fora de escopo |

## 4. Decisões de design (as "perguntas do Superpowers", respondidas por mim)

**D1 — Categorias.** Manter `imovel/auto/moto/servicos` (4). O doc cita 3 ("Imóvel, carro ou moto")
como exemplo; a Bevi tem 6 segmentos. Remover quebra personas/seed/testes sem ganho. Risco baixo.

**D2 — Prazo → objetivo (eixo Bevi).** Trocar `TIMEFRAME_OPTIONS` pelas 5 do doc e derivar o
`objetivo` da Bevi (`contemplacao_rapida` × `investimento`), que é input nativo da simulação Bevi:
- "O mais rápido possível" → prazo 0, `contemplacao_rapida`
- "Até 6 meses" → prazo 6, `contemplacao_rapida`
- "1 ano" → prazo 12, `contemplacao_rapida`
- "2 anos+" → prazo 24, `contemplacao_rapida`
- "Sem pressa, quero menor parcela" → prazo 120, `investimento`

**D3 — Lance embutido (o diferencial).** Após o gate `lance`:
- `não`/`talvez` → segue direto pra busca (como hoje).
- `sim` → novo gate `lance-embutido`: educa sobre lance embutido (texto do doc, em prosa) e oferece
  opt-in (chips "Sim, considerar" / "Não, lance normal"). O **valor aproximado do lance** é capturado
  de forma conversacional/numérica e gravado em `qualifyAnswers.lanceValue`. Mapeia 1:1 pra Bevi
  (`temLanceParaOfertar`, `valorDoLance`, `lanceEmbutido: "30"|"50"`).
- Default de lance embutido = **30%** (valor mais comum na captura Bevi).

**D4 — Simulador de contemplação.** Decisão de especialista: **não** invento um simulador
probabilístico de 3/6/12 meses sem lastro (seria publicidade enganosa — CDC art. 30/37, e a própria
Bevi não garante mês de contemplação; ela só dá `probContemplacaoMeses` e `lowestContemplationRate`).
Em vez disso, mantenho o cenário **com/sem lance e com lance embutido** sobre a simulação real (o que o
doc também pede em "mostrar variação com/sem lance e com lance embutido"), exibindo: crédito bruto da
carta, **crédito líquido recebido** (carta − lance embutido), lance necessário pra contemplar e prazo
esperado. Isso é factual e vem do shape Bevi (`receivedCredit`, `embeddedBid`, `necessaryBidToContemplate`).
O "3/6/12 meses" do doc é re-enquadrado como **faixa histórica de contemplação** rotulada como
estimativa, não promessa. (Documentado como decisão revisável — o cliente "ainda não sabe".)

**D5 — Bevi mock com shape real.** A `QuotaSimulation` ganha um bloco opcional `embeddedBid`
espelhando os campos reais capturados. O `MockBeviAdapter` calcula esses valores deterministicamente
a partir do crédito + objetivo + lance, batendo com a ordem de grandeza dos `offers.json`. `GroupSummary`
ganha `monthlyAwardedQuotas` (contemplados/mês — benefício do doc). Nenhuma categoria nova.

**D6 — Card de decisão.** Novo artifact `decision_prompt` + tool `present_decision_prompt`, com as 3
ações do doc: "Sim, quero contratar agora" / "Quero ver outras opções" / "Quero falar com um
especialista". Fecha a transição etapa 4 → 5.

**D7 — Adapter real Bevi.** `BeviApiAdapter` (Trilho A — API de Parceiro) é criado como esqueleto
atrás de `ADMINISTRADORA_ADAPTER=bevi`, lendo `BEVI_BASE_URL`/`BEVI_API_TOKEN`/`BEVI_PRODUCT_ID` do
env. **Default continua `mock`.** Testado só contra fixtures (mapeamento offer→domínio), **zero chamada
live** — o token não existe ainda e a base `api.uxvision.tech` pode ser produção (criar proposta real
com CPF real seria irresponsável às cegas).

**D8 — Workflow de QA.** Sigo TDD nas 3 camadas (estrutural + cassette + eval) que o `CLAUDE.md` do
projeto exige pra todo comportamento de agent, e fecho com o subagent **QA crítico (Opus)**. Não
disparo o ciclo completo PO-Lead↔QA multi-iteração (custo de token desproporcional numa rodada
noturna); o plano de teste vive neste doc + no eval.

## 5. Camadas de teste (obrigatório — `CLAUDE.md`)

- **Camada 1 (estrutural):** asserts no prompt/config/tool/adapter (`src/**/*.test.ts`).
- **Camada 2 (cassettes):** `tests/regression/agent-trajectory.test.ts` — 1 `describe` por comportamento novo.
- **Camada 3 (eval):** `tests/eval/` — cenário que percorre a jornada do doc (Helena imóvel, com lance embutido).

## 6. Staged (fora deste PR — com motivo)

| Item | Por quê |
|---|---|
| Contratação Bevi proposta-first (CPF/celular/LGPD → KYC RG+endereço → step de documento) | Depende do **API token** (não disponível). Esqueleto do adapter fica pronto; o fluxo conversacional de coleta entra num PR seguinte sobre o mock, com migração de schema pros IDs Bevi (`proposalId`, `ofertaId`, `offerExpiresAt`…). |
| Fluxo de caixa mês a mês (artifact dedicado) | Grande superfície de UI; `compare_with_financing` já cobre o comparativo. Próximo PR. |
| Pós-venda (etapas 6–7), assinatura digital, dashboard | Explicitamente fora de escopo nesta rodada. |

## 7. Critérios de aceite (o que "feito" significa)

1. Gate de prazo exibe as 5 opções do doc; cada uma grava `prazoMeses` + `objetivo` corretos (web **e** WhatsApp).
2. Lance = "sim" dispara o sub-fluxo de lance embutido (educação + opt-in + valor), grava `lanceValue`/`lanceEmbutido`, e SÓ então segue pra busca.
3. `simulate_quota` com lance embutido retorna o bloco `embeddedBid` coerente (crédito líquido < carta; lance necessário > 0); o card mostra com/sem lance.
4. Card de decisão aparece com as 3 ações e roteia corretamente.
5. Prompt não vaza mecânica ("lance embutido" é explicado em prosa, sem jargão de engine).
6. Eval percorre a jornada do doc sem frases proibidas e com as tools/valores corretos.
7. Suite inteira verde (unit + regression). QA crítico aprovado.

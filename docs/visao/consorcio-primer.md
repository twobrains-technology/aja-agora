# Primer de Consórcio — o domínio explicado pra quem opera a plataforma

> Criado: 2026-06-12 · Público: Kairo (e qualquer dev/agente novo no projeto)
> Regra de leitura: tudo aqui é mecânica geral do mercado brasileiro; o que depende de
> confirmação da Bevi/AGX está marcado ⚠️ A CONFIRMAR e espelhado em
> [`perguntas-abertas.md`](./perguntas-abertas.md).

## 1. O que é consórcio, em uma frase

Autofinanciamento coletivo: um grupo de pessoas paga parcelas mensais para um fundo
comum, e todo mês uma ou mais delas são **contempladas** (por sorteio ou lance) com uma
**carta de crédito** para comprar o bem — sem juros, mediante uma **taxa de
administração** paga à empresa que organiza tudo (a **administradora**).

## 2. As peças do jogo

| Termo | O que é |
|---|---|
| **Administradora** | Empresa autorizada e fiscalizada pelo **Banco Central** (Lei 11.795/2008) que constitui e gere os grupos. Ex. observado no nosso fluxo: CANOPUS. |
| **Grupo** | Conjunto fechado de consorciados com mesmo prazo e categoria de bem. Tem data de início, prazo total (ex.: 80 meses) e assembleia mensal. |
| **Cota** | A "vaga" de um participante no grupo. É o que o cliente compra na adesão. |
| **Fundo comum** | O bolo principal: parte da parcela de todos, usado pra contemplar. |
| **Taxa de administração** | Remuneração da administradora, diluída nas parcelas. É o "preço" do consórcio (no lugar dos juros do financiamento). |
| **Fundo de reserva** | Percentual pequeno pra cobrir inadimplência do grupo; pode ser devolvido no encerramento. |
| **Assembleia** | Encontro mensal (hoje virtual/automático) onde acontecem as contemplações do mês. |
| **Carta de crédito** | O valor que o contemplado recebe pra comprar o bem. É **corrigida** ao longo do tempo (INCC pra imóvel, IPCA/tabela do bem pra veículo) — o poder de compra acompanha. |
| **Contemplação** | O momento em que a cota ganha o direito de usar a carta. Por **sorteio** (aleatório, muitas administradoras usam a Loteria Federal) ou **lance**. |
| **Lance livre** | Oferta de antecipação de parcelas em dinheiro; maior lance do mês leva. |
| **Lance fixo** | Percentual pré-definido pelo grupo; desempate por sorteio. |
| **Lance embutido** | Usa parte da **própria carta** como lance (ex.: carta de R$ 100k, lance embutido de 25% → contempla com R$ 75k líquidos). Ajuda quem não tem dinheiro vivo — por isso o docx manda **educar todo mundo** sobre ele (D10). |
| **Alienação fiduciária** | Depois de comprar o bem com a carta, o bem fica alienado à administradora até quitar as parcelas restantes. |

## 3. Consórcio × financiamento (o pitch honesto)

| | Consórcio | Financiamento |
|---|---|---|
| Recebe o bem | Quando contemplado (sorteio/lance) | Na hora |
| Custo | Taxa de administração (tipicamente 15-25% do crédito, diluída no prazo) | Juros compostos (CET muito maior no prazo longo) |
| Pra quem serve | Quem pode esperar ou planeja (e quer disciplina de poupança) | Quem precisa do bem agora |
| Risco-chave | Ansiedade/frustração com prazo de contemplação | Endividamento caro |

**Regra de ouro regulatória/comercial: NINGUÉM pode prometer contemplação em data
certa.** Promessa de "contemplação garantida em X meses" é prática vedada e motivo
clássico de punição no setor. O agente só pode falar em probabilidade, histórico e
cenários ("se contemplado em 3/6/12 meses…") — exatamente o que o simulador faz, com
selo de estimativa. Isso é um **guard-rail permanente do produto**, não um detalhe.

## 4. O ciclo de vida completo de um consorciado (visão de negócio)

```
ADESÃO                       TRAVESSIA                     VIDA NO GRUPO
1. Proposta de adesão   →    4. Análise ("mesa")      →    7. Assembleias mensais
2. Dados + documentos   →    5. Aceite/efetivação     →    8. Sorteios e lances
3. (KYC)                →    6. 1º boleto PAGO ✱      →    9. CONTEMPLAÇÃO
                                                      →   10. Compra do bem (faturamento)
                                                      →   11. Paga até o fim do prazo
                                                      →   12. Encerramento do grupo
```

✱ **O pulo do gato comercial:** a adesão só vale (e o cliente só vira consorciado ativo
no grupo) quando a primeira parcela é paga — em geral cobrada na assinatura da proposta
e consolidada na primeira assembleia do grupo. É por isso que a hipótese de negócio do
projeto (G3) é que **a comissão do canal é disparada pelo 1º pagamento** — prática comum
do mercado, frequentemente com estorno se o cliente desiste nos primeiros meses.
⚠️ A CONFIRMAR com Bevi/AGX: evento exato + regra de estorno.

### Onde cada peça do NOSSO fluxo se encaixa

| Etapa do ciclo | No Aja Agora hoje |
|---|---|
| 1-2. Proposta + dados | Passos 1-5 da jornada canônica (chat) → `create_proposal`/`choose_offer` (API de Parceiro Bevi) + upload de docs (Conexia) |
| 3. KYC | Documento pessoal enviado no chat; validação é da administradora |
| 4. Mesa | **Caixa-preta**: back office da Bevi, manual (DES-1). Estado fica `waitingForUniqueCode` → inserção assíncrona na administradora. POC mostrou 4-5h+ sem transição |
| 5. Efetivação | `integrationCode`/`approvedAt` na API de status — **nunca observamos** (G1) |
| 6. Boleto/pagamento | **Inexistente na API conhecida** (G2). Gap central do funil |
| 7+. Vida no grupo | Passo 7 do docx — ainda não construído (D8) |

## 5. A cadeia de valor do Aja Agora (quem é quem)

```
Cliente ⇄ AJA AGORA (agente AI, 2 canais) ⇄ BEVI (parceiro/API) ⇄ Administradora (ex.: CANOPUS)
                                              │
                                              ├─ "Mesa" — back office da Bevi que efetiva a proposta
                                              ├─ API de Parceiro (api.uxvision.tech) — Trilho A, fechamento
                                              ├─ Self-contract (Trilho B) — descoberta com ofertas ricas
                                              └─ Portal CONEXIA (conexia.agxsoftware.com) — onboarding de docs
```

- **Aja Agora** = canal de venda AI-first. Não é administradora; não toca dinheiro do
  cliente. Remunerada por comissão (⚠️ modelo exato a confirmar — G3).
- **Bevi** = nosso parceiro de integração: agrega ofertas de administradora(s) e opera a
  mesa. ⚠️ A CONFIRMAR o papel formal (corretora? representante? administradora com
  marketplace?) — nas ofertas reais a administradora observada é CANOPUS, e a infra
  técnica tem nomes de terceiros (UX Vision, Indiky, AGX/Conexia), sugerindo software
  white-label.
- **AGX** = fornecedor do software do portal de onboarding (Conexia). O "pessoal do AGX"
  também aparece como financiador do projeto na transcrição do Kairo (grafado "AGE") —
  ⚠️ A CONFIRMAR quem exatamente é o financiador e qual o vínculo com a comissão.

## 6. Conceitos que o produto já honra (e precisa continuar honrando)

- **Disclosure regulatória** (CMN 4.927/2021 + CDC art. 37): a composição completa de
  custos (taxa adm, fundo de reserva, seguro) precisa chegar ao cliente ANTES da
  assinatura. No nosso fluxo ela vive no **PDF da proposta** — por decisão do Bernardo
  (D14), os cards não exibem a composição, e o binding legal é a assinatura na mesa.
- **Nenhum número sem fonte real** (D11): números exibidos vêm da oferta Bevi ou são
  omitidos. Estimativas de mercado levam selo explícito (D9/FIX-3).
- **Sem promessa de contemplação** (seção 3): probabilidade e cenários, nunca garantia.
- **A primeira parcela NÃO é cobrada no fechamento do chat**: hoje o fluxo Bevi não tem
  pagamento imediato — o boleto vem depois da efetivação (e é onde o funil de verdade
  termina; ver [`roadmap-mvp.md`](./roadmap-mvp.md)).

## 7. Vocabulário que o agente usa com o cliente (resumo de bolso)

- "**Carta de crédito**" = o valor da sua conquista.
- "**Parcela**" = fundo comum + taxa adm (+ fundo de reserva/seguro) — apresentada como
  número único, sem composição (D14).
- "**Lance**" = antecipação pra aumentar a chance; "**lance embutido**" = usar parte da
  própria carta.
- "**Assembleia**" = o sorteio mensal do grupo.
- "**Proposta**" = o pedido de adesão que vai pra administradora analisar (a "mesa").
  Não confundir com contrato assinado — a assinatura/efetivação é etapa posterior (DES-1).

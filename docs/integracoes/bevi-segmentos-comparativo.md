# Bevi — Comparativo por Tipo de Bem (segmento)

> Pergunta de negócio: **muda algo na oferta conforme o tipo de bem?**
> Resposta: **muda muito** — administradora, índice de correção, taxa de adm, prazo e até
> *disponibilidade* variam por segmento. Captura via API self-contract (`update-step/simulation`)
> em **2026-05-27**, mesma proposta, lance embutido 30%, objetivo "contemplação rápida".
> Dados brutos por segmento em [`assets/segmentos/<tipo>/offers.json`](./assets/segmentos/).

## Quadro geral

| Segmento | Valor pedido | Nº ofertas | Administradoras | Índice de correção | Taxa adm | Fundo reserva | Prazo |
|---|---|---|---|---|---|---|---|
| **Imóvel** | R$ 50.000 | **3** | RODOBENS, ÂNCORA | **INCC** | 26%–29% | 0%–2% | 180–216m |
| **Veículo (Autos)** | R$ 30.000 | **7** | **ITAÚ, ÂNCORA, BANCO DO BRASIL** | **IPCA + IGPM** | 14%–27% | 2%–3% | 29–118m |
| **Motocicleta** | R$ 25.000 | **1** | **CANOPUS** | **IPCA** | 21% | — | 96m |
| **Pesados** | R$ 100.000 | **2** | ITAÚ | **IPCA + PRÉ-FIXADO 3%** | 20% | 2% | 53–55m |
| **Serviços** | R$ 20.000 | **1** | ÂNCORA | **IGPM** | **35%** | **5%** | 98m |
| **Outros Bens** | R$ 20.000 | **2** | ÂNCORA | **NÃO POSSUI CORREÇÃO** | 16%–22% | 0% | 34–90m |

## Achados que importam pro Aja Agora

1. **Índice de correção é função do segmento** — INCC (imóvel), IPCA/IGPM (autos), PRÉ-FIXADO 3%
   (pesados Itaú), e **sem correção** (outros bens). O agente **não pode** assumir um índice fixo:
   tem que ler o `adjustmentType` da oferta. (Reforça a regra CDC art. 37 — taxa/índice reais, nunca genéricos.)
2. **O leque de administradoras muda por segmento.** Itaú só aparece em **Autos** e **Pesados**;
   Rodobens só em **Imóvel**; Banco do Brasil só em **Autos**; **Canopus só em Moto**; Âncora é a
   única transversal. A recomendação do agente precisa ser **por segmento**, não um catálogo único.
3. **Piso de valor por segmento é real e silencioso** ⚠️ — Moto a R$ 15k retorna *"Nenhuma oferta
   gerada para a cota selecionada"* (0 ofertas); a partir de **R$ 20k** aparece **CANOPUS** (grupo 4400,
   96m, adm 21%, IPCA). Ou seja: a ausência de oferta pode ser **piso de crédito**, não falta de produto.
   O agente precisa tratar "0 ofertas" como *"aumente o valor"* — e não como *"não temos moto"*. Vale
   mapear o piso de cada segmento com o parceiro pra não frustrar o usuário com valor baixo.
4. **Taxa de administração varia 14%–35%.** Serviços é o mais caro (adm 35% + fundo 5%); Itaú
   Pesados/Autos os mais baratos (14%–20%). Comparabilidade real entre segmentos exige normalizar
   por custo efetivo, não só parcela.
5. **Lance embutido (30%) é aceito em todos os segmentos com oferta** — `bidPaymentMode: EMBEDDED`
   apareceu em 100% das ofertas retornadas. O diferencial do Aja (lance embutido nativo) cobre toda a vitrine.
6. **Quantidade de ofertas varia de 0 a 7** — Autos é o segmento mais líquido (7 grupos). A UX do
   agente precisa lidar com "muitas ofertas" (curar/ranquear) e com "uma só" ou "nenhuma" (fallback honesto).

## Detalhe por segmento

### Imóvel (R$ 50k) — 3 ofertas · INCC
| Admin | Grupo | Carta | Parcela | Prazo | Adm | Fundo | Comissão |
|---|---|---|---|---|---|---|---|
| RODOBENS | 2119 | R$ 80k | R$ 366,51 | 216m | 29% | 0% | 3,5% |
| ÂNCORA | 704 | R$ 80k | R$ 547,89 | 198m | 26% | 2% | 5,0% |
| RODOBENS | 2117 | R$ 80k | R$ 424,71 | 180m | 26% | 0% | 3,5% |

### Veículo / Autos (R$ 30k) — 7 ofertas · IPCA + IGPM
| Admin | Grupo | Carta | Parcela | Prazo | Adm | Índice | Comissão |
|---|---|---|---|---|---|---|---|
| ITAÚ | 50067 | R$ 54.832 | R$ 1.009,36 | 70m | 21% | IPCA | 3,5% |
| ÂNCORA | 540 | R$ 42k | R$ 497,08 | 118m | 27% | IGPM | 5,0% |
| BANCO DO BRASIL | 1749 | R$ 50k | R$ 728,41 | 88m | 25% | IPCA | 3,5% |
| ÂNCORA | 529 | R$ 45k | R$ 532,58 | 118m | 27% | IGPM | 5,0% |
| ÂNCORA | 462 | R$ 54k | R$ 703,64 | 98m | 18% | IGPM | 5,0% |
| ÂNCORA | 575 | R$ 45k | R$ 767,53 | 74m | 18% | IGPM | 5,0% |
| ITAÚ | 50116 | R$ 52.585 | R$ 2.148,08 | 29m | 14% | IPCA | 3,5% |

### Motocicleta — 1 oferta · IPCA (piso ~R$ 20k)
A R$ 15k retorna 0 ofertas ("Nenhuma oferta gerada"); a partir de R$ 20k aparece a CANOPUS. Ver achado #3.
| Admin | Grupo | Carta | Parcela | Prazo | Adm | Índice | Comissão |
|---|---|---|---|---|---|---|---|
| CANOPUS | 4400 | R$ 36k (pedido R$ 25k) | — | 96m | 21% | IPCA | 6,0% |

### Pesados (R$ 100k) — 2 ofertas · IPCA + PRÉ-FIXADO 3%
| Admin | Grupo | Carta | Parcela | Prazo | Adm | Índice |
|---|---|---|---|---|---|---|
| ITAÚ | 20562 | R$ 180.988 | R$ 4.138,26 | 55m | 20% | IPCA |
| ITAÚ | 20533 | R$ 177.152 | R$ 4.198,84 | 53m | 20% | PRÉ-FIXADO 3% |

### Serviços (R$ 20k) — 1 oferta · IGPM
| Admin | Grupo | Carta | Parcela | Prazo | Adm | Fundo |
|---|---|---|---|---|---|---|
| ÂNCORA | 313 | R$ 30k | R$ 457,98 | 98m | **35%** | **5%** |

### Outros Bens (R$ 20k) — 2 ofertas · sem correção
| Admin | Grupo | Carta | Parcela | Prazo | Adm | Índice |
|---|---|---|---|---|---|---|
| ÂNCORA | 256 | R$ 36k | R$ 518,74 | 90m | 22% | NÃO POSSUI CORREÇÃO |
| ÂNCORA | 253 | R$ 36k | R$ 1.257,48 | 34m | 16% | NÃO POSSUI CORREÇÃO |

---

## Nota de método (por que API e não 6 screenshots de UI)

O simulador da Bevi/AGX **resume a proposta ativa por device** (FingerprintJS no browser) e **recusa
proposta paralela** (`create-proposal` → `400 Duplicated Hash`). Com uma proposta presa em
`waitingForUniqueCode` (inserção assíncrona pendente, nº 24165747), a UI não renderiza `/simulation`
de novo até a proposta liberar. Para não fabricar nem travar, capturei os 6 segmentos **direto da API
self-contract** (`PATCH update-step/.../simulation`), que devolve o array `offers[]` completo por
segmento — dado **mais rico** que os cards da UI (taxa, índice, fundo, seguro, assembleia, comissão).
Screenshots de UI reais já existem para **Imóvel** ([`assets/bevi-04-oferta.png`](./assets/bevi-04-oferta.png))
e **Veículo** (sessão anterior). Dados brutos dos 6: [`assets/segmentos/<tipo>/offers.json`](./assets/segmentos/).

*Captura: Playwright + API self-contract, 2026-05-27. CPF de teste do operador; sem PII nos `offers.json`.*

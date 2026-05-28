# Integração Bevi Consórcio (AGX / CONEXIA) — Dossiê

Avaliação da integração do **Aja Agora** com o parceiro **Bevi Consórcio**, exposto pela plataforma
**AGX Software / CONEXIA** (CreditHub). Material para alinhamento técnico e de negócio com o parceiro.

> **Cadeia:** `Aja Agora → API AGX/CreditHub → Bevi → Administradoras (RODOBENS, ÂNCORA, …)`
> **Produto:** Bevi - Consórcio (`productId 6986245b3518ceb00e7844da`)

## Sumário

| Documento | O que é |
|---|---|
| [**bevi-consorcio-aderencia.md**](./bevi-consorcio-aderencia.md) | **Análise de aderência** da API ao modelo do Aja (gaps, riscos, arquitetura recomendada, 14 perguntas ao parceiro). Ponto de partida. |
| [**bevi-api-discovery.md**](./bevi-api-discovery.md) | **Discovery técnico**: os dois trilhos de API (Parceiro vs Self-Contract), endpoints reais e o **shape completo da oferta** capturado ao vivo. |
| [**bevi-simulador-fluxo.md**](./bevi-simulador-fluxo.md) | **Walkthrough** do simulador deles, passo a passo, com screenshots. |
| [**bevi-segmentos-comparativo.md**](./bevi-segmentos-comparativo.md) | **Comparativo por tipo de bem** (6 segmentos): admin, índice, taxa, prazo. Responde "muda algo por segmento?". |
| [**bevi-api-requests.md**](./bevi-api-requests.md) | **Cookbook de requests** reproduzível: endpoints, payloads e respostas reais (CPF mascarado). |
| [collection/](./collection/) | Collection Postman oficial "API de Parceiro". |
| [assets/](./assets/) | Screenshots do simulador (sem PII). |

## TL;DR

A API do parceiro é um **motor de auto-contratação proposta-first** (CPF → simula → oferta → KYC →
proposta). Encaixa **muito bem** no fechamento do Aja e cobre **nativamente** o diferencial (lance
embutido + perfil investidor × contemplação rápida). A captura ao vivo do simulador **derrubou os
gaps que a collection sugeria**: a oferta real entrega taxa de adm, prazo, fundo, seguro, correção
(INCC), assembleia, contemplação e **a comissão do parceiro** — com **múltiplas administradoras**
(leque comparável) e **KYC inline sem redirect**.

### O que a captura confirmou empiricamente
- ✅ **6 segmentos** (inclui Imóvel e Moto) — não só AUTOS/SERVICOS.
- ✅ Simulação retorna **leque de ofertas** (várias admins/grupos) → comparável.
- ✅ Oferta traz **taxa, prazo, fundo, seguro, INCC, assembleia, contemplação** (gaps da análise → resolvidos).
- ✅ **Lance embutido** (30%/50%) e **objetivo** (investimento/contemplação rápida) nativos.
- ✅ **Comissão do parceiro** vem na resposta (3,5%–5%) → modelo de receita visível.
- ✅ **Autofill por CPF** (nome + nascimento) e **KYC inline opcional, sem redirect**.

### O que continua em aberto (gaps reais)
- ❌ **Sem simulação anônima** — exige CPF antes de qualquer cotação (conflita com "sem formulário").
- ⚠️ A "API de Parceiro" (trilho documentado) **redireciona** no `choose_offer` (`consortiumProposalLink`)
  — embora o self-contract prove que **inline é possível**. A negociar.
- ⚠️ Upload de documentos via portal externo (`get_document_upload_links` = 501 na collection).

→ Detalhes, arquitetura recomendada (split Discovery/Fulfillment) e as **14 perguntas ao parceiro**
em [bevi-consorcio-aderencia.md](./bevi-consorcio-aderencia.md).

---
*Captura via Playwright MCP em 2026-05-27. Artefatos brutos com PII (CPF/nome/IP) ficam fora do repo (`/tmp/bevi-capture`).*

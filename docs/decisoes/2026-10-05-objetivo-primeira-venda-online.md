# O norte do Aja Agora: a primeira venda de consórcio fechada online pelo agente — decisão de 05/10/2026

**Quem decidiu:** Kairo, em 05/10/2026, ao ver a leitura de "quem entrou de ontem pra hoje" (10 pessoas em 03–04/10,
**nenhuma** deixou telefone, 8 de 9 pediram imóvel ou moto, 8 de 9 morreram logo depois da primeira pergunta
do agente).
**Onde vale:** todo o produto — leitura de funil, painel, remarketing/régua, teste A/B, comportamento do
agente e investimento em verba. E toda skill que olha esse produto, na frente `avaliar-produto-em-producao`.
**O que NÃO muda:** nenhum código, nenhuma migration. Isto é o **critério** pelo qual todo o resto é lido.

---

## 1 · O objetivo

**Chegar na PRIMEIRA VENDA DE CONSÓRCIO fechada de forma online pelo agente** — contrato fechado sem humano
no meio, começando e terminando na conversa com o agente.

O que **não** é o objetivo, ainda que seja meio ou sinal:
- "conversar bem" — qualidade de diálogo não é a chegada;
- gerar lead, ter visita, ter tráfego;
- **lead qualificado entregue no WhatsApp** (é o caminho que existe hoje, não a chegada);
- volume de conversas.

## 2 · A régua de leitura (toda análise usa esta escada)

A pergunta, em qualquer leitura, é sempre: **isto aproxima ou afasta a primeira venda online?**

| degrau | o que é | como se reconhece no dado |
|---|---|---|
| 1 | **chegou** | conversa criada |
| 2 | **conversou** | a pessoa respondeu ao menos uma vez ao agente |
| 3 | **viu oferta** | apareceu `comparison_table` / `financing_comparison` na conversa |
| 4 | **deixou contato** | telefone em `contacts.phone` — sem isso não há venda online |
| 5 | **avançou no pedido** | simulação escolhida, pré-cadastro, pedido de contratação |
| 6 | **venda** | contrato fechado sem humano |

O degrau **4 é o gargalo declarado hoje** (0 de 10 pessoas em 03–04/10 deixaram telefone) e o **5 é o
primeiro degrau que ninguém alcançou**. Todo cruzamento da skill `avaliar-produto-em-producao` (interesse
declarado × origem, contato × desfecho, ponto de morte × última pergunta do agente) é lido **contra esta
escada** — não contra "quantas conversas tivemos".

## 3 · Consequências

- ✅ Uma pergunta fecha a discussão de prioridade: *"isso aproxima a primeira venda online?"* — e o que não
  aproxima sai da frente.
- ✅ A leitura de funil ganha um critério externo: o sucesso não é o lead no WhatsApp (rota atual), é o
  contrato fechado pelo agente.
- ⚠️ Vai incomodar leitura bonita: conversa longa, boa qualidade de diálogo e muito tráfego podem continuar
  sem valer nada, se ninguém chega no degrau 4.
- 🎲 O caminho real até a venda pode depender de humano em algum ponto (regulatório, contrato, assinatura) —
  se depender, isso é a **decisão seguinte**, não uma exceção a ser escondida.

## 4 · Reversibilidade

**Fácil** — é um documento. Nada no código depende dele.

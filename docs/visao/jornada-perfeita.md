# Jornada Perfeita — north star ponta a ponta (camadas 0-8)

> Criado: 2026-06-12 · Status: visão de assessoria — propõe, não sobrepõe o docx
> Os passos 1-5 e 7 SÃO a [`jornada-canonica.md`](../jornada/jornada-canonica.md) (REGRA
> do cliente) — aqui eles aparecem resumidos e ESTENDIDOS nas pontas que o docx não
> cobre: a aquisição (antes do passo 1) e a travessia até o boleto pago (entre o 5 e o 7).

## O princípio organizador

O docx descreve a **conversa**. A jornada perfeita descreve o **relacionamento**: começa
no anúncio e só "termina" quando o cliente é um consorciado contemplado que indica
amigos. Em todo ponto, a régua é a mesma:

> **O cliente nunca deveria precisar perguntar "e agora?". O agente sempre sabe — e
> conta antes.**

## Visão em camadas

```
0. AQUISIÇÃO      anúncio → landing → chat em 1 toque (atribuição preservada)
1-2. DESCOBERTA   entender necessidade + cliente (docx, passos 1-2)        ✅ canônico
3-4. RECOMENDAÇÃO buscar, recomendar, simular, decidir (docx, passos 3-4)  ✅ canônico
5. CONTRATAÇÃO    dados + docs + proposta pronta (docx, passo 5)           ✅ canônico
6. TRAVESSIA      mesa → efetivação → BOLETO → 1º pagamento  ← funil fecha AQUI
7. ATIVAÇÃO       boas-vindas ao grupo, resumo, expectativas da vida de consorciado
8. VIDA NO GRUPO  assembleias, lances, contemplação, celebração, indicação (docx, passo 7)
```

E **dois princípios transversais** que valem em todas as camadas:

- **Identidade única cross-canal.** Telefone (e CPF, quando coletado) é a chave do
  relacionamento. Web e WhatsApp são portas da MESMA conversa de vida — nunca dois
  "leads" paralelos da mesma pessoa, nunca o agente esquecendo na web o que soube no
  WhatsApp (e vice-versa).
- **O agente nunca sabe menos que o servidor.** Tudo que está registrado (proposta,
  documentos, status na administradora) é verdade que o agente afirma com confiança —
  jamais "não encontrei nada no sistema" pra quem já contratou (princípio já codificado
  no estado terminal FIX-11; a jornada perfeita o estende a TODA porta de entrada).

## Camada 0 — Aquisição (o que a campanha exige)

**Perfeito:** o clique no anúncio cai numa landing que abre o chat em um toque; a origem
(UTM/criativo) fica gravada no lead; nos primeiros 2-3 turnos o agente já capturou o
mínimo pra nunca perder esse contato (nome + intenção; celular assim que natural — o
opt-in WhatsApp é o **seguro de retorno** contra abandono). Quem abandona no meio recebe
UM resgate gentil pelo WhatsApp ("sua simulação ficou pronta, quer ver?") — nunca spam.

**Métricas da camada:** custo por conversa iniciada · % conversas → recomendação vista ·
% com celular capturado (resgatáveis) · origem por criativo.

## Camadas 1-4 — Descoberta e recomendação (canônicas)

São os passos 1-4 do docx, já implementados com dados 100% reais da Bevi. O "perfeito"
aqui é refinamento contínuo, não redesenho: simulador com aval do Bernardo, fluxo de
caixa mês a mês (docx, passo 4), educação de lance embutido pra todos (D10), nenhum
número sem fonte (D11). Detalhes e pendências: [`gap-analysis.md`](./gap-analysis.md).

## Camada 5 — Contratação (canônica, com extensão)

O docx termina o passo 5 em "documentos enviados + proposta pronta". A jornada perfeita
estende: **o cliente nunca sai do chat**. Os dados complementares que hoje vivem nas
telas CONEXIA (RG, endereço, comprovante) são coletados na conversa (ou extraídos por
OCR dos documentos já enviados) e enviados via API (`insert_additional_data`) — e a
finalização (`waitingForUniqueCode`) é disparada pelo sistema, não por um formulário
externo que o cliente nem sabe que existe.

## Camada 6 — Travessia (o elo novo; funil fecha no boleto pago)

A parte hoje obscura ([`jornada-ate-boleto.md`](../jornada/jornada-ate-boleto.md)). No
estado perfeito:

1. **Expectativa explícita no fechamento.** "Sua proposta está com a administradora.
   A análise costuma levar N dias úteis ⚠️(SLA a confirmar — mesa). Te aviso aqui a cada
   passo." — e o sistema CUMPRE a promessa.
2. **Acompanhamento ativo.** O sistema observa cada proposta pendente (polling do
   status; webhook quando a Bevi tiver — G5) e cada transição vira mensagem proativa no
   canal preferido do cliente: "entrou em análise" → "aprovada!" → "seu boleto chegou".
3. **Silêncio nunca passa de 48h.** Mesmo sem transição, o cliente em travessia recebe
   um sinal de vida com prazo atualizado. Proposta parada além do SLA vira alerta
   INTERNO (admin/funil) pra ação humana junto à mesa.
4. **Boleto dentro da experiência.** Quando emitido (G2), o boleto chega pelo chat/
   WhatsApp com código copia-e-cola, vencimento e o que acontece depois do pagamento.
5. **1º pagamento confirmado = sucesso do funil.** Evento registrado, comissão
   disparada (G3), funil admin marca ganho REAL — não no "docs enviados".

## Camada 7 — Ativação (a ponte pro pós-venda)

No pagamento confirmado: celebração ("você agora faz parte do grupo X — bem-vindo!"),
resumo definitivo da contratação (carta, parcela, prazo, próxima assembleia) nos dois
canais, e o "manual do consorciado" em linguagem de gente: quando é a assembleia, como
funciona lance, onde acompanhar. É o momento de maior boa-vontade do cliente — também é
quando se pede permissão explícita pros comunicados recorrentes da camada 8.

## Camada 8 — Vida no grupo (docx, passo 7)

Comunicados automáticos (assembleia chegando, resultado, oportunidade de lance),
inteligência de lance ("você está perto da faixa histórica de contemplação; aumentar 5%
muda suas chances"), celebração da contemplação, convite a avaliar e indicar. Ideia em
aberto do docx: dash do consorciado (posição no grupo, evolução, projeção). Tudo isso
depende de dados de assembleia que a API atual não fornece — pedido à AGX registrado em
[`../jornada/proposta-simulador.md`](../jornada/proposta-simulador.md).

## O contrato de comportamento no RETORNO (resumo; spec completa em [`pos-contratacao-canais.md`](./pos-contratacao-canais.md))

| Quem volta | O agente perfeito faz |
|---|---|
| Lead no meio da descoberta | Retoma EXATAMENTE de onde parou ("paramos na simulação do carro de R$ 80 mil — quer continuar?") |
| Cliente pós-contratação ("oi", "e aí?") | Reconhece, dá o status real sem ser perguntado, diz o próximo passo e o prazo |
| Cliente em travessia, outro canal/dispositivo | Mesma coisa — identidade unificada; re-identificação leve quando necessário (celular/CPF) |
| Contemplado | Celebra, orienta a usar a carta, convida a indicar |

## Anti-visões (o que a jornada perfeita NÃO é)

- ❌ **Não é um app com login e abas.** A tese do produto é conversa + artefatos. Área
  logada/dash é camada 8, e mesmo lá o chat continua sendo a porta principal.
- ❌ **Não é automação de marketing agressiva.** Um resgate por abandono, comunicados
  com permissão, opt-out de 1 toque. O agente é consultor, não cobrador.
- ❌ **Não promete o que a mesa não cumpre.** Sem prazo de contemplação garantido, sem
  "assinatura digital" que não existe (DES-1), sem "te aviso" se o aviso não está
  construído.

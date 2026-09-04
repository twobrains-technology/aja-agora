# PROPOSTA A — Analista de negócio ("Sala de Máquinas")

**Período padrão: 7 dias móveis vs. os 7 anteriores** (não "hoje" — com 0,31 proposta/dia, uma tela de hoje mostra zero quase sempre e vira ruído).

## Pergunta-mãe
"O funil está produzindo proposta em R$ no ritmo necessário — e, se não está, o gargalo é o tráfego, o agente ou a mesa?"
Toda a tela existe para atribuir o gargalo a um dos três donos em 30 segundos.

## 5 KPIs
1. **Propostas na Bevi · R$ em crédito** — 8 · R$ 1.841.314,59 · ticket R$ 230.164. 0 nos últimos 7d (era 1). É o batimento cardíaco.
2. **Conversa por pessoa** — 2,8% (131/4.657). Orgânico 3,1%; as duas maiores campanhas do IG, 0%. 7d: 3,6% vs 2,4%.
3. **Conversa → lead identificado** — 37,4% no total, mas **20,5% nos últimos 7d vs 41,7% nos 7 anteriores**. É o número do agente. Caiu → rodar prompts:check e ler as 10 últimas conversas mortas.
4. **Parado na mesa** — 5 · 514h média. A única decisão que muda dinheiro hoje de manhã.
5. **Fechado ganho · R$** — 0 · R$ 0. Rodapé obrigatório: "2 vendas já foram marcadas como ganhas e 3 saíram de ganho para perdido — o estado de fechamento não é confiável."

KPI que quer e não tem: CAC/custo por conversa. Proxy calculável: custo de LLM por conversa cruzando sessionId↔conversationId.

## 5 blocos, nesta ordem
1. **"Esperando alguém agir"** — fila da mesa item a item (lead, raia, R$, horas, dono). Ação antes de diagnóstico. A mesa hoje não tem métrica nenhuma; este é o primeiro espelho dela.
2. **"Onde o funil vaza"** — 7 etapas com delta por degrau. Cada degrau tem dono diferente. Reaproveita computeFunilMidia.
3. **"Quem traz conversa e quem só traz clique"** — tabela por campanha com coluna de custo **visível e vazia**, rotulada "sem custo integrado". Lacuna escondida vira lacuna eterna.
4. **"Tendência"** — o único gráfico da tela, série de 30 dias com marcadores nos dias com proposta.
5. **"Saúde dos sinais"** — o painel se auto-audita: envio à Meta QUEBRADO, cobertura de avaliação 1,5%, turnos sem resposta, prompt check, Langfuse 403. Painel que não avisa quando está cego mente.

## O que RECUSA (e por quê)
- Visitas brutas (47.294) — 87% é robô. O número mais bonito e mais mentiroso do banco.
- Nota de qualidade como KPI (0,52) — n=2 de 131, e numa delas "conversão" tirou 0,85 sem lead capturado.
- Juízes LLM no topo — judge_avancou deu 0,923 no turno que anunciou "pré-cadastrado no Itaú" com 0 propostas. Juiz é hipótese; topo de painel é prova.
- Média de mensagens (11,4) — usa a distribuição (41% morrem na 1ª msg).
- Mapa de calor, rage clicks, scroll — ferramenta semanal, tela própria. Exceção: os 10 rage clicks no "Fale no WhatsApp" são bug a abrir, não métrica.
- Split mobile/desktop — constante estrutural, não decide nada.
- Pico por hora — decide escala trimestral, não acompanhamento diário.
- Pipeline por administradora — n=8, interessante e não acionável.
- Latência pelo banco — dá 0,0s por artefato de gravação. Métrica errada é pior que ausente.
- "Leads hoje"/"fechados hoje" — já existem no /admin Agora; aqui é ruído com cara de sinal.
- Ranking de vendedor — não é montável; prefiro o vazio declarado.

## 9 alertas (severidade sempre em palavra + forma, nunca só cor)
CRÍTICO ▲ Mesa parada · Campanha queimando (≥200 pessoas, 0 conversas) · Sinal Meta quebrado (>20% falha) · Sem proposta há >72h · Prompt divergente
ATENÇÃO ■ Conversão do agente caindo (<60% da taxa anterior, n≥20) · Turno sem resposta · Venda revertida · Painel parcialmente cego

## 3 lacunas exigidas
1. **Custo de mídia por campanha/dia** — sei que 1.812 pessoas viraram zero, mas não sei se custou R$ 500 ou R$ 50.000, então não sei o tamanho do incêndio. Rota rápida: tabela de spend por upload (~1 dia). Rota completa: Marketing API (3–5 dias, traz o nome legível da campanha).
2. **Valor em R$ antes da proposta + motivo de perda** — os 15 leads em negociação valem R$ 0 no painel, o que é ativamente enganoso. E perda por inatividade é indistinguível de reprovação da Bevi. (~2–3 dias)
3. **Uma verdade só por número** — duas definições de "viu oferta", duas contagens de pessoas, e o estado de "ganho" já foi desfeito mais vezes (3) do que feito (2). (~1 dia)

## Leitura do negócio
26 dias, R$ 1,84 mi ofertado, zero contrato — e os dois que chegaram a ganho foram revertidos. O gargalo caro não é o topo: é depois do agente (5 handoffs parados 21 dias). A mídia paga queima verba de forma verificável enquanto o orgânico carrega o produto (27 dos 49 leads). E piorou onde dói: conversa→lead caiu de 41,7% para 20,5%. **O produto funciona melhor do que a operação em volta dele — e o dinheiro está sendo perdido na operação, não no agente.**

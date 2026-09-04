# PROPOSTA B — SDR / Head de pré-vendas ("Bater meta")

## As 3 perguntas que tiram o sono
1. "Tem venda saindo ou eu olho um pipeline morto?" — 0 fechados em 25 dias, R$ 1,84 mi em propostas, 5 leads parados 21 dias na mesa.
2. "Estou pagando mídia para trazer gente que nem fala comigo?" — sim: 1.812 pessoas em duas campanhas do IG, zero conversas, enquanto o orgânico converte 3,13%.
3. "Onde o lead esfria?" — três mortes empilhadas: 41% morrem na 1ª mensagem; 70,4% de quem viu carta não vira proposta; 100% do que chega à mesa não fecha. A mais cara é a última: é dinheiro já gasto apodrecendo.

## O placar (5)
1. **Vendas fechadas no mês** — 0. Meta: não temos (sem tabela de quota; até existir, campo digitado). Sem alvo, o placar não é placar.
2. **Propostas novas em 7 dias** — 0. Última em 26/08, 8 dias atrás. E 6 das 8 propostas foram entre 10 e 17/08: a operação desacelerou.
3. **Pipeline real na Bevi** — R$ 1.841.314,59 · ticket R$ 230.164. Aviso obrigatório: é o único R$ que existe; não é "quanto vou faturar", é "quanto de carta está em jogo".
4. **Conversa por 100 pessoas** — 2,8 agregado, mas **orgânico 3,13 vs pago 0,74**. O agregado esconde tudo; a tela mostra os dois lado a lado.
5. **Parado na mesa** — 5 · 514h. O único concluído levou 11,6h: quando alguém pega, resolve em meio dia.

## Bloco de campanha — a unidade é CAMPANHA × REDE, não campanha
O mesmo ID 120251066713980104 entrega 2 conversas em 68 pessoas no Audience Network e **8 conversas em 33 pessoas no Instagram (24,2%, 7,7× o orgânico)**. Agregar por campanha apagaria o melhor anúncio da conta.

Três regras para decidir em 10 segundos:
1. **Ordenação padrão = pessoas desperdiçadas** (pessoas menos conversas), não volume nem alfabética.
2. **Rótulo escrito com forma:** ⛔ PARAR · ◐ OBSERVAR · ▣ ESCALAR · ● REFERÊNCIA.
3. **Gate de volume:** só recebe rótulo quem passou de 30 pessoas. Abaixo, "amostra insuficiente" — para não matar anúncio bom por azar de 12 cliques.

Sem custo, troca a moeda: em vez de "quanto custa uma conversa", mede "quantas pessoas essa campanha precisa entregar para produzir uma conversa", contra o orgânico como benchmark grátis.

## Bloco de conversa — funil com o ABSOLUTO perdido em cada degrau
4.657 → 131 (−4.526) → 49 (−82) → 27 (−22) → 8 (−19) → 6 (−2) → 0 (−6)
Três lugares de ação, por retorno:
1. **Oferta → proposta (perde 19 de 27, 70,4%)** — a pessoa viu carta e não avançou. Mídia paga, CPF dado, número mostrado. A tela dá a LISTA dessas 19 com nome e horário, para a mesa ligar hoje — não um percentual.
2. **Morte no 1º turno (53 de 131)** — mas quem fica, fica muito (média 11,4 msgs). A conversa não é ruim; a abertura é. Quer a latência do 1º turno ao lado: existe em `page_events.duracao_ms` (chat_receive) e **nenhuma query a lê**. É a métrica mais barata de ganhar no produto.
3. **Abriu o chat e não falou** — 54 de 84 escreveram (64%).

Dois atritos juntos: 10 rage clicks no "Fale no WhatsApp" — o botão de maior intenção é o que mais irrita e o que menos entrega (WhatsApp = 7 de 131 conversas). E 11 turnos sem resposta do agente.

Horário: pico 11h e 19h, com 11 conversas entre 0h e 6h — o pico das 19h e a cauda noturna caem fora do expediente da mesa. Gerar lead quente quando ninguém pega é desperdício.

## Bloco da mesa
Lista, não gráfico. Uma linha por handoff, do mais velho para o mais novo, com rótulo ◆ ATRASADO / ✓ CONCLUÍDO. Contadores: 6 entregues · 1 concluído (11,6h) · 5 em aberto · 9 perdidos, motivo **não temos**.
Confessa em letra pequena: sem `claimed_at`, o relógio conta desde a entrega, não desde o "assumi".

## O que a tela GRITA (máx. 3 visíveis, resto colapsa)
⛔ PARAR (campanha ≥300 pessoas, 0 conversas) · ⏱ ATRASADO (handoff >48h) · ▽ SEM PIPELINE NOVO (0 propostas ≥3 dias) · △ ERRO DE ENVIO (>20% falha CAPI) · ↺ VENDA REVERTIDA · ✱ ATRITO (≥5 rage clicks) · ⌀ SEM RESPOSTA · ◌ NÃO MEDIDO (<20% avaliadas) · ⚑ PROMPT DEFASADO
Cada um = ícone de forma distinta + palavra em caixa + número + verbo de ação. Se a tela for impressa em preto e branco, nada se perde.

## Leitura de mercado
Não é problema de tráfego: o orgânico converte 3,13% em conversa e 41% das conversas em lead — o funil sabe funcionar. É fecho humano e mídia comprando o público errado. A causa mecânica está diagnosticada e ninguém consertou: 90% dos `chat_iniciado` falham no CAPI e zero e-mails são capturados — o algoritmo da Meta treina em ruído e entrega curioso. A oportunidade escondida no rabo da tabela: existe um anúncio que faz 24,2% e está sendo diluído pelo posicionamento automático; a conta é julgada pela média. O ativo mais caro está parado: R$ 1,84 mi com 5 handoffs sem desfecho há 21 dias — consórcio de R$ 230 mil não espera três semanas, esse lead já comprou em outro lugar. A conta que decide tudo (quanto vale uma venda) é hoje literalmente irrespondível.

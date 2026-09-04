# Briefing factual — dados REAIS de produção do Aja Agora
Extraído do Postgres de produção (`aja-agora` @ db-twobrains-prd) em 2026-09-04 05:06 UTC.
Janela dos dados: 2026-08-10 a 2026-09-04. Nenhum registro simulado (is_simulated = false em 100%).

## 1. Tráfego — e a regra canônica do produto

O produto JÁ tem a definição de "visita que conta" (`src/lib/admin/sinais-do-funil.ts`): `VISITA_CONTAVEL = VISITA_DE_GENTE AND VISITA_NAO_E_ECO`.
- `VISITA_DE_GENTE`: user-agent não bate no `PADRAO_ROBO_SQL`, **ou** a visita produziu conversa (fato do servidor vence heurística).
- `VISITA_NAO_E_ECO`: descarta re-gravação do mesmo visitante em menos de 2 segundos (prefetch do App Router).

Aplicando essa regra no banco de produção agora:
- 47.294 visitas brutas na tabela `visits`.
- **6.157 visitas contáveis / 4.657 pessoas.** O resto (87%) é health check do próprio ALB (33.584), `facebookexternalhit` (4.435), scanners e eco de prefetch.
- Landing: 99,8% cai em `/`; `/autos` (27), `/motos` (24), `/imoveis` (21) quase não recebem tráfego.
- Device (page_events): mobile 7.740 (86,6%), desktop 1.159, tablet 39.

## 2. O funil real, ponta a ponta (regra canônica)
| Etapa | Nº | Conversão da etapa anterior |
|---|---|---|
| Pessoas (visitas contáveis) | 4.657 | — |
| Conversas iniciadas | 131 | 2,8% |
| Leads identificados | 49 | 37,4% |
| Viram oferta real (artifact `real_offer`/`simulation_result`) | 27 | 55,1% |
| Propostas na Bevi | 8 | 29,6% |
| Handoff para a mesa | 6 | 75,0% |
| **Fechado ganho (estado atual)** | **0** | **0%** |

A ordem importa: o gate de identificação vem ANTES da oferta — por isso "viu oferta" (27) é menor que "leads" (49), e não o contrário.

Nota histórica: `lead_events` mostra 2 transições `em_atendimento → fechado_ganho` e 3 `fechado_ganho → perdido`. Houve venda marcada e revertida; hoje nenhum lead está em fechado_ganho.

## 3. Estágios atuais dos 49 leads
em_negociacao 15 · engajado 12 · qualificado 11 · perdido 9 · proposta_enviada 1 · aguardando_pagamento 1

## 4. Pipeline financeiro (o que existe de R$)
- 8 propostas, **R$ 1.841.314,59** em crédito, ticket médio **R$ 230.164**.
- IMÓVEL: 2 propostas, R$ 883.424,83, parcela média R$ 2.724, prazo médio 213 meses.
- AUTOS: 6 propostas, R$ 957.889,76, parcela média R$ 3.533, prazo médio 65 meses.
- Administradoras: Banco do Brasil 4 (R$ 1,21 mi), Itaú 3 (R$ 582 mil), Rodobens 1 (R$ 51 mil).
- **`leads.credit_value` está NULL em 49 de 49 leads.** Valor só existe quando vira proposta Bevi. Não há pipeline em R$ antes da proposta.

## 5. Campanhas — onde o dinheiro está sendo queimado
(pessoas = visitantes distintos com visita contável)

| Campanha (id Meta) | Fonte | Pessoas | Conversas | Leads |
|---|---|---|---|---|
| (orgânico/direto) | — | 2.107 | 66 | 27 |
| 120250998207680104 | ig | 1.273 | **0** | **0** |
| 120250956902860104 | ig | 539 | **0** | **0** |
| 120251242855380104 | an (audience network) | 423 | 14 | 1 |
| 120251066904080104 | an | 84 | 1 | 0 |
| 120251066713980104 | an | 68 | 2 | 0 |
| 120251066904080104 | ig | 46 | 1 | 0 |

**As duas maiores campanhas do Instagram somam 1.812 pessoas e ZERO conversas.** O orgânico converte 3,1% das pessoas em conversa; essas duas convertem 0%.
Campanha é identificada só por ID numérico da Meta — não há nome legível, criativo, nem custo no banco.

## 6. Meta Conversions API — o sinal de otimização está quebrado
| Evento | sent | failed | pending | skipped |
|---|---|---|---|---|
| chat_iniciado | 3 | **28** | 14 | 0 |
| lead_qualificado | 20 | 0 | 0 | 12 |
| proposta_criada | 2 | 0 | 0 | 6 |
| contrato_fechado | 0 | 0 | 0 | 2 |

- Erro literal do `chat_iniciado` (subcode 2804050): *"Você não adicionou dados de parâmetros do cliente suficientes para esse evento"*. O evento dispara na abertura do chat, quando ainda não há telefone nem e-mail.
- Os 2 `contrato_fechado` foram pulados por **"fora da janela de 7 dias aceita pela Meta"** — a venda demorou mais que a janela de atribuição.
- **Zero e-mails capturados**: `leads.email` NULL em 49/49; `contacts.email` NULL em 34/34. Só telefone (38/49) e CPF (27/34). Isso degrada a taxa de correspondência do CAPI.

## 7. Atendimento humano (mesa)
- 6 handoffs no total. 1 concluído em 11,6h. **5 estão "em_andamento" há 514 horas em média (21 dias).**
- Não há registro de motivo de perda: `lead_events.notes` é NULL nas 12 transições para `perdido`.

## 8. Qualidade da conversa — a capacidade existe e está desligada
- Tabela `conversation_evaluations` implementa rubrica de 6 dimensões (conversão, discovery, engajamento, continuidade, naturalidade, assertividade) + flags (hallucination, lowEngagement, missedHandoff, incompleteDiscovery), com juiz `claude-sonnet-4-6`.
- **Só 2 de 131 conversas foram avaliadas (1,5%).** Score médio 0,52.
- Nas 2 avaliadas, ambas com flag `hallucination: true` e `incompleteDiscovery: true`.
- Alerta de leitura: numa delas a dimensão "conversão" recebeu 0,85 numa conversa **sem lead capturado**. A nota não mede conversão.

## 9. Engajamento e atrito
- Conversas por volume de mensagens do usuário: 1 msg → 53 conversas (41%); 2-3 → 25; 4-8 → 30; 9+ → 21.
- Média de 11,4 mensagens por conversa; 606 do usuário, 866 do agente.
- **11 turnos do usuário ficaram sem resposta do agente** (1,8% de 606).
- Chat: 84 visitas abriram, 54 enviaram mensagem (64% de abertura→primeira mensagem).
- 72 rage clicks. O alvo nº 1 é o botão **"Fale no WhatsApp" (10 rage clicks)**.
- Seções mais vistas: kv-menu (1.991), kv-hero (1.868), kv-journey (333), kv-tipos (248).
- Pico de conversas: 11h (13) e 19h (13). Cauda noturna real: 11 conversas entre 0h e 6h.

## 10. Canal
- Web: 124 conversas (119 ativas, 5 handed_off). WhatsApp: 7 conversas.
- 117 de 131 conversas têm `visit_id` — a amarração visita→conversa funciona em 89%.

## 11. Lacunas de dado confirmadas
1. Custo de mídia não existe no banco — **CPL, CAC e ROAS são impossíveis hoje**.
2. Nome de campanha/criativo não existe — só ID numérico da Meta.
3. `leads.credit_value` nunca é preenchido — pipeline em R$ só após proposta.
4. Motivo de perda não é registrado.
5. Não há tabela de meta/objetivo — não dá para dizer "estamos X% da meta".
6. Latência de resposta do agente não é confiável pelo banco (mediana calculada dá 0,0s pelo modo de gravação do timestamp); latência real vive no Langfuse.
7. As credenciais Langfuse do secret de produção retornam **HTTP 403** em toda a API pública (uma chave falsa retorna 200 no /health) — a observabilidade de prod não é consultável por API hoje.

## 14. Teste: a campanha com zero conversa é fraude de tráfego? (verificado, 04/09)

Hipótese levantada: zero conversa em 1.273 pessoas seria estatisticamente impossível com gente real, logo seria bot com navegador real.

**A hipótese NÃO se confirma.** Cruzando as visitas com a telemetria de UI (janela desde 18/08, quando o coletor existe):

| Campanha × rede | Visitas | Seções vistas por visita | Rolagem média | Abriram chat | Escreveram |
|---|---|---|---|---|---|
| 120250998207680104 · ig | 2.473 | **0,8** | **24%** | 3 | **0** |
| (orgânico) | 1.346 | 5,1 | 39% | 23 | 20 |
| 120251242855380104 · an | 1.156 | 4,7 | 35% | 36 | 17 |
| 120251066713980104 · an | 134 | 4,6 | 37% | 4 | 2 |

O tráfego da campanha zerada **interage** (23,5% das visitas geram evento, praticamente igual aos 23,8% do orgânico) — ou seja, há um navegador real renderizando a página. Não é robô.

**O que é, então:** rejeição imediata. Vê 0,8 seção contra 5,1 do orgânico, rola 24% contra 39%, e de 2.473 visitas **nenhuma escreveu uma única mensagem**. Chega, olha o topo, não se reconhece, sai.

E a prova de que não é "tráfego pago é sempre pior": a campanha `120251242855380104` no Audience Network, na mesma conta, tem comportamento **igual ao orgânico** (4,7 seções, 35% de rolagem, 17 escreveram). O problema é daquele anúncio/público, não da mídia paga.

**Consequência para o painel:** "seções vistas por visita" é um **indicador antecedente** — separa tráfego bom de ruim antes de existir conversa, com dias de antecedência sobre o funil. Merece estar na tabela de campanha.

## 15. Contaminação por teste interno (verificado por identidade, 04/09)

A flag `is_simulated` é `false` em 100% dos registros — mas isso **não significa** que todos sejam clientes. Testes feitos em produção com o documento real do operador entram como venda de verdade.

Cruzando os contatos com o CPF e o telefone configurados em `VITRINE_CPF` / `VITRINE_CELULAR` (identidade da casa, prova determinística — não heurística de nome):

| | Do operador | Total | Peso |
|---|---|---|---|
| Conversas | 6 | 131 | 4,6% |
| Leads | 6 | 49 | **12,2%** |
| Propostas | 2 | 8 | **25,0%** |
| Pipeline em R$ | R$ 371.258,00 | R$ 1.841.314,59 | **20,2%** |
| Handoffs na mesa | 2 | 6 | **33,3%** |

**Os números de cliente, limpos:** 6 propostas, **R$ 1.470.056,59** de pipeline, 4 handoffs.

**Consequência para o painel:** sem excluir a identidade da casa, a tela superestima o pipeline em 20% e a fila da mesa em 33%. É uma lacuna de dado, não de código de negócio — `is_simulated` cobre o simulador, não o teste em produção. Precisa de uma marcação de contato interno.

## 16. A fila da mesa não é o que parece (verificado, 04/09)

Os 5 handoffs "em andamento" sugerem 5 clientes esperando. Não é isso:

| Status do handoff | Estágio do lead | Qtd | Horas médias |
|---|---|---|---|
| em_andamento | **perdido** | 4 | 521 |
| em_andamento | aguardando_pagamento | 1 | 487 |
| concluido | perdido | 1 | 592 |

**Quatro dos cinco "em andamento" têm o lead já em `perdido`** — alguém encerrou o lead e o handoff ficou aberto para sempre. E das transições para `perdido` nesses casos, 3 vieram de `fechado_ganho` (marcado por `admin`).

**Só existe 1 caso vivo de verdade:** um lead em `aguardando_pagamento`, R$ 211.258, Itaú, há 487 horas (20 dias). Esse sim é dinheiro esperando.

**Consequência para o painel:** um alerta de "5 parados na mesa" seria falso alarme em 4 dos 5 casos. A condição correta é `handoff em aberto E lead em raia viva` — senão a tela grita todo dia sobre um caso morto e a equipe aprende a ignorá-la.

## 17. O ativo esquecido: 28 leads quentes parados (verificado, 04/09)

Muito maior que a fila da mesa, e ninguém olha:

| Raia | Leads | Dias parados (média) | Pior caso |
|---|---|---|---|
| em_negociacao | 15 | 11 | 24 dias |
| qualificado | 11 | 15 | 24 dias |
| aguardando_pagamento | 1 | 10 | 10 |
| proposta_enviada | 1 | 9 | 9 |
| **Total** | **28** | — | — |

**E o sistema já avisou.** Os 28 têm `sla_alertado_em` preenchido; o último disparo foi em 02/09 às 9h de Brasília. O worker de SLA funciona, o e-mail sai, e os leads continuam parados.

**Consequência:** o problema não é falta de alerta — é falta de uma tela que cobre e permita agir. Um e-mail diário vira ruído em uma semana; uma lista nominal com botão de ação, não. Este é o argumento mais forte a favor da one-page.

## 18. Os leads mais quentes da base (verificado, 04/09)

Das 19 conversas que viram carta real na tela e não viraram proposta, as mais engajadas de cliente (excluindo teste do operador):

| Nome | Raia | Mensagens na conversa | Dias sem toque |
|---|---|---|---|
| Cliente B | em_negociacao | **33** | 6 |
| Cliente C | em_negociacao | 26 | 9 |
| (sem nome) | qualificado | 13 | 9 |

Cliente B trocou 33 mensagens, viu preço, está em negociação e ninguém fala com ele há 6 dias. Este é o tipo de linha que uma one-page precisa colocar na frente do gestor — não como percentual, como nome.

## 19. DEFEITO ENCONTRADO: o filtro anti-eco esconde a melhor campanha (verificado, 04/09)

Este achado nasceu de uma discordância entre dois analistas e se resolveu no banco.

`sinais-do-funil.ts` define `VISITA_CONTAVEL = VISITA_DE_GENTE AND VISITA_NAO_E_ECO`.

- `VISITA_DE_GENTE` **tem** a âncora certa: *"visita que produziu conversa nunca é robô, qualquer que seja o user-agent — fato do servidor vence heurística."*
- `VISITA_NAO_E_ECO` **não tem a âncora equivalente.** Ela descarta qualquer visita gravada menos de 2 segundos depois de outra do mesmo visitante — **inclusive quando essa visita gerou uma conversa**.

**O que isso custa hoje, medido:**
- 19 visitas que produziram conversa são descartadas como eco.
- Com elas somem **22 conversas e 8 leads** da atribuição por campanha.

**Onde dói mais:**

| Campanha × rede | Como a regra atual mostra | Com a âncora corrigida |
|---|---|---|
| 120251066713980104 · ig | 33 pessoas, **0 conversas**, 0 leads | 33 pessoas, **8 conversas (24,2%)**, 4 leads |
| 120251066713980104 · fb | 7 pessoas, 1 conversa | 7 pessoas, 3 conversas |
| (orgânico) · ig | 32 pessoas, 6 conversas | 33 pessoas, 13 conversas |

**A campanha com a melhor conversão da conta inteira — 24,2%, contra 3,18% do orgânico — aparece hoje com zero.** Um gestor olhando a tela atual pausaria justamente o anúncio que funciona.

**A correção é de uma linha de conceito:** a mesma âncora que já protege contra a heurística de robô precisa proteger contra a heurística de eco. Conversa é fato do servidor; prefetch não conversa.

**Números após a correção:** 6.179 visitas contáveis, 4.660 pessoas (contra 6.157 e 4.657). O topo do funil quase não muda — o que muda é **para quem o crédito da conversa vai**, que é exatamente a decisão de verba.

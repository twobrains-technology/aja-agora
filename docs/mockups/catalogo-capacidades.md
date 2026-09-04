# Catálogo de capacidades de métrica — Aja Agora (levantado no código, 04/09/2026)

## A. O que JÁ EXISTE de painel (não estamos partindo do zero)

Quatro telas com número, todas sob `/admin`, protegidas por `requireRole("admin","viewer","attendant")`:

| Tela | O que mostra | Endpoint |
|---|---|---|
| `/admin` ("Agora") | 6 KPIs de tempo real: visitas na última hora, conversas ao vivo, esperando resposta, sem dono na mesa, leads hoje, fechados hoje. Auto-refresh 15s | `GET /api/admin/agora` |
| `/admin/performance` | Porta do funil, funil de mídia (7 etapas), funil de handoff (p50/p90 por raia), série de aquisição (único gráfico Recharts em uso), tabela por origem com drill-down de campanha | `GET /api/admin/performance?from&to` |
| `/admin/percurso` | Escada de 8 degraus + tabela pessoa a pessoa | `GET /api/admin/percurso` |
| `/admin/mapa-de-calor` | Visitantes, cliques, rage-clicks, % de rolagem, canvas de calor, ranking de alvos | `GET /api/admin/heatmap` |

**`GET /api/admin/dashboard` está pronto e ÓRFÃO** — devolve `totalLeads`, `leadsToday`, `avgFunnelDays`, `conversionRate` **com `trends` contra o período anterior**, funil de 9 estágios, volume diário e split por canal. Nenhuma tela consome. O componente `LeadVolumeChart` (AreaChart) também está órfão.

**Zero consolidação:** cinco fontes agregadas e nenhuma tela que as cruze. Uma one-page seria a primeira.

**A mesa não tem métrica nenhuma.** O papel `mesa_externa` só abre `/admin/pipeline` e `/admin/profile`. Toda instrumentação da mesa (fila sem dono, SLA, p50/p90) é consumida por admin em telas que a mesa não abre.

**Nada exporta.** Não existe CSV/XLSX em nenhum lugar do repositório. `@react-pdf/renderer` já está no projeto (usado na proposta comercial) e é caminho provado.

## B. Definições canônicas já resolvidas em código (usar, não reinventar)

`src/lib/admin/sinais-do-funil.ts`:
- `VISITA_CONTAVEL = VISITA_DE_GENTE AND VISITA_NAO_E_ECO` — o denominador de toda taxa.
- `chaveDaPessoa()` — `COALESCE(contact_id resolvido na janela, visitor_id)`. As três telas contam pessoas pela mesma chave. Trabalho deliberado de 24/08.
- `ARTIFACTS_DE_OFERTA = ['real_offer','simulation_result']` — a prova de que o cliente viu número na tela.

`computeFunilMidia` (`performance-queries.ts:86`) — 7 etapas: visitas → conversas → engajadas → identificados → viram_oferta → propostas → fechados. Toda etapa após "visitas" exige `conversations.visit_id IS NOT NULL` (senão o funil crescia e mostrava 328%).

Período padrão da aplicação inteira = **HOJE** (`periodo.ts:134`, desde 24/08).

## C. Funil comercial (10 raias, `leads.stage`)
novo → engajado → qualificado → em_negociacao → proposta_enviada → na_administradora → em_atendimento → aguardando_pagamento → fechado_ganho | perdido (terminal)
Forward-only: raia pulada não gera linha em `lead_events`.

## D. Aquisição e atribuição — o que temos
- Captura **server-side no proxy** (sobrevive a adblock): UTM completo (source/medium/campaign/content/term), `gclid`, `fbclid`, `fbp`, e os 5 campos de Click-to-WhatsApp.
- Cookies `aja_uid` (90d), `aja_visit` (90d), `aja_ref` (legível por JS).
- **Código de origem** (30/08): carimba `(ref 8hex)` no link `wa.me` — é o único bit que atravessa a fronteira do WhatsApp orgânico.
- Filtros já implementados: robô declarado, eco de prefetch (2s), preview de heatmap.
- **Meta CAPI**: 4 eventos (`lead_qualificado`→Lead, `proposta_criada`→InitiateCheckout, `contrato_fechado`→Purchase, `chat_iniciado`→custom). Dedup por `event_id` = `event_key`, com índice único.
- **GTM + GA4 instalados** (GTM-KZXWKBZ3, G-SD0XH0VHED) mas **nenhum evento custom vai ao dataLayer**.

## E. Telemetria de UI (mapa de calor) — nosso, desde 18/08/2026
10 tipos de evento: click, rage_click, section_view, scroll_depth, chat_open, chat_typing, chat_send, chat_receive, chat_card_click, chat_close.
Campos: device, path, section, selector, label (higienizado de PII), coordenadas, scroll_pct, viewport, `duracao_ms`.
**`duracao_ms` é a latência percebida pelo cliente (chat_receive = espera até a 1ª palavra do agente) e NENHUMA query o lê hoje.**

## F. Qualidade do agente
- `conversation_evaluations`: rubrica de 6 dimensões (engajamento, discovery, continuidade, naturalidade, assertividade, conversão) + 4 flags (hallucination, missedHandoff, incompleteDiscovery, lowEngagement), juiz `claude-sonnet-4-6`. Já exibida como "score de qualidade %" em `/admin/conversations`.
- Langfuse emite scores por turno (`funil-scores.ts`): `funil_passo`, `gate`, `carta_na_tela`, `primeira_resposta_com_numero`, `turno_mudo`, `card_sem_fala`, `artefato_suprimido`, `handoff`, `tools_chamadas`, `finish_reason`, `lead_stage`, `gate_entregue`, `gate_afundado`, `tool_falhou`, `fala_podada`.
- Um ciclo de reconciliação publica score por conversa no Langfuse a cada 30s.

## G. Workers (BullMQ + Redis, serviço ECS separado, só em prod)
- `proposal-status-poll` a cada 15 min — puxa status da Bevi e move raia.
- `gate-reengage-poll` a cada 30s — reengajamento, retomada (máx 2, backoff 30 min), acolhida N1, reconciliação.
- `sla-da-mesa` 1×/dia às 9h de Brasília — **e-mail de SLA, o único relatório que sai sozinho hoje**.

## H. As lacunas — o que um gestor pede no primeiro dia e o dado NÃO responde
1. **Pipeline em R$ por raia.** `leads.credit_value` é escrito por nenhum caminho de produção (NULL em 49/49). Valor só existe após a proposta Bevi. Não há receita, comissão nem margem em lugar nenhum.
2. **CPA, CPL, CAC, ROAS.** Não existe tabela de investimento e não há integração com a Marketing API da Meta nem Google Ads. Medimos só o numerador.
3. **Por que perdemos.** Não existe `lost_reason`; `lead_events.notes` é texto livre e está NULL nas 12 transições para `perdido`. Pior: perda por inatividade (14 dias) é indistinguível de reprovação da Bevi.
4. **Meta/objetivo.** Não existe tabela de quota. "Estamos X% da meta" não tem fonte.
5. **Dono do lead.** Vendedor só aparece após o transbordo. Ranking de vendedor no funil inteiro não é montável.
6. **Em que gate a conversa morreu.** Vive em `conversations.metadata` (jsonb, ~60 campos, sem índice GIN) e nenhuma query o lê.
7. **`gclid` é capturado e nunca usado** — nenhuma conversão volta para o Google Ads (`conversionDestination` só tem `'meta'`).
8. **Saúde do envio à Meta é invisível.** Nenhuma tela lê `conversion_events`; `attempts` nunca é incrementado; `failed` só vai para `console.error`.
9. **O Pixel dispara dentro do `/admin`** — navegação da equipe contamina remarketing e denominador.
10. **A fila do CAPI só é esvaziada quando um lead muda de raia.** Dia sem transição = fila parada; 7 dias = `skipped`.
11. **Custo/latência/tokens do agente não estão no banco** — só no Langfuse.
12. **Sem `claimed_at` na mesa** — "tempo até alguém assumir" não é medível com precisão.

## I. Observabilidade do agente (Langfuse) — o tesouro subutilizado

**~41 scores são emitidos hoje.** Por turno e determinísticos: `gate`, `funil_passo` (2–15, profundidade), `carta_na_tela`, `primeira_resposta_com_numero`, `turno_mudo`, `card_sem_fala`, `artefato_suprimido`, `handoff`, `tools_chamadas`, `finish_reason`, `lead_stage`, `persona`, `gate_entregue`/`gate_afundado`, `tool_falhou`/`tool_falha_nome`/`tool_falha_tipo`, `tool_recusou`, `conducao_entregue`/`conducao_ausente_gate`, `fala_podada`, `valor_revertido`, `escolha_nao_ancorou`, `botao_fantasma`, `busca_alvo`/`busca_abaixo_do_piso`/`busca_vazia`/`busca_esgotada`, `estado_incoerente`, `oferta_contradiz_parcela`, `parcela_fora_do_catalogo`, `prompt_desync`.

Por sessão e de negócio: `lead_estagio`, `conversao`, `valor_contrato`, `carta_vista`, `turnos_ate_carta`, e os 4 de reconciliação fala×estado — `funil_travado_no_fecho`, `funil_parado_pre_decisao`, `escolha_falada_nao_ancorada`, `venda_prometida_sem_proposta`.

Juízes LLM por turno (rodam na UI do Langfuse): `judge_tone`, `judge_resolved`, `judge_hallucination`, `judge_avancou`.

**A lacuna mais barata de fechar: 25 dos ~41 scores não têm widget nenhum.** O dado já está sendo produzido e ninguém olha. Entre os invisíveis estão justamente os de venda: `carta_vista`, `turnos_ate_carta`, `primeira_resposta_com_numero`, `conducao_entregue`, `tool_falhou`, e os 4 de reconciliação.

**A doutrina da casa, medida em produção:** no turno que anunciou "pré-cadastrado no Itaú", `turno_mudo` = 0, `finish_reason` ok em 65/65 e o juiz LLM `judge_avancou` deu **0,923** — e `bevi_proposals = 0`. *Juiz LLM é hipótese; sinal determinístico é prova.* Um painel executivo deve privilegiar o determinístico.

**Custo/latência:** custo de LLM existe só no Langfuse (por canal/modelo/dia). Não existe "custo por conversa" nem "custo por venda", **embora o cruzamento seja trivial** — `sessionId` do Langfuse = `conversationId` do Postgres.

**Duas verdades para "viu oferta" (defeito a corrigir):** `sinais-do-funil.ts` define `['real_offer','simulation_result']`; `funil-scores.ts` define `['comparison_table','recommendation_card','real_offer']`. Painel e score contam coisas diferentes.

**Eval automático de conversa só dispara no handoff do WhatsApp.** A web — maioria do tráfego — nunca é avaliada sem clique manual. Daí os 2 de 131.

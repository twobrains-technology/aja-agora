---
data: 2026-09-28
titulo: "O custo de IA sai do Langfuse, não de tabela de preço (rota B) — e o dólar precisa de cotação cadastrada"
status: aceita
decisor: executor do bloco-custo (`feat/custo-de-ia-e-mensagem`) — executa decisão fechada com o dono em 28/09
contexto: bloco-custo, FIX-391 / FIX-392 / FIX-393 — "levantar todos os custos para a gente calcular o CPC"
---

# ADR — bloco-custo: de onde cada custo sai, e o que a tela diz quando não sai

Bruna, 22/09: *"E uma coisa só que uma hora que der, você checar e ver o custo de IA e das mensagens
de remarketing, tá? Porque eu tô tentando levantar todos os custos para a gente calcular o CPC
depois."* Este bloco entrega as duas metades e o CPC, na **rota B** — a decidida com a Nebulosa em
28/09 e já escrita no spec
(`docs/design/specs/2026-09-28-goal-aja-agora-pessoa-como-unidade.md`, "Fora de escopo (YAGNI)").

## A decisão (não reaberta): rota B

**O custo de IA é lido da fonte atual — o Langfuse — e cruzado com o Postgres pelo `sessionId`, que
é o mesmo `conversationId`.** Nada de tabela de preço versionada em código, nada de gravar tokens do
turno no banco. O que existe:

| Número | Fonte (endpoint / tabela) | Módulo |
|---|---|---|
| Custo de IA | `GET {LANGFUSE_BASE_URL}/api/public/metrics` (Metrics API **v1**), `view=observations`, dimensões `sessionId` + `providedModelName`, `timeDimension.granularity=day`, métrica `totalCost` | `src/lib/admin/custo-de-ia.ts` |
| Vínculo do custo de IA | `conversations.created_at` no período + `is_simulated = false` (`sessionId` do Langfuse = `conversationId`) | idem (`conversasDoPeriodo`) |
| Investimento Meta (o oficial) | `meta_insights_diarios.spend_cents`, **nível `campaign`** | `performance-queries.ts` (`computeCustosDoCpc`) |
| Custo de mensagem — volume | `whatsapp_outbound_queue` (`status='sent'`, `sent_at` no período, chave `usage_key`) + `messages.template_name` (`role='assistant'`, conversa não simulada) | `src/lib/admin/custo-de-mensagem.ts` |
| Custo de mensagem — preço | cadastro `custos_config.preco_mensagem_cents` | idem |
| Cotação do dólar | cadastro `custos_config.cotacao_usd_brl` | `custos-do-cadastro.ts` |

### Por que a v1 do Metrics API, e não a v2

O servidor é self-hosted **v3.225.1**, e a matriz de compatibilidade do Langfuse diz que a Metrics
API v2 (e a Observations API v2) só existe em OSS v4
(`https://langfuse.com/self-hosting/upgrade/versioning`). A v1 é a que roda aqui, e é a que **permite
agrupar por `sessionId`** — a v2 proíbe justamente essa dimensão por cardinalidade ("Use them in
filters instead"). Como o cruzamento é *por sessão*, a v1 é a fonte certa. Confirmado na doc de
migração (`https://langfuse.com/faq/all/deprecated-api-migration#metrics-v1`): a view `observations`
da v1 tem `sessionId` e `providedModelName` como dimensões e `totalCost` como métrica.

### Por que um cadastro de cotação (não estava no pedido, e é necessário)

O Langfuse reporta custo em **USD**; o investimento da Meta e o preço da mensagem são em **BRL**, e o
CPC é um número em real. Sem uma cotação, o dólar não vira real. Criamos a tabela `custos_config`
(chave-valor de texto, mesmo desenho do `remarketing_config`, migration `0061`) com duas chaves:

- `cotacao_usd_brl` — quantos reais vale 1 dólar;
- `preco_mensagem_cents` — centavos de real por mensagem de template.

Isso **não** fere o YAGNI do spec: o que está fora de escopo é *tabela de preço de modelo versionada
em código* e *gravação de tokens por turno*. A cotação e o preço da mensagem são cadastro vivo —
trocam sem deploy, que é o oposto de constante em código. É a mesma decisão que o próprio card do
FIX-392 pede para o preço da mensagem ("mesmo desenho de `remarketing_config`").

## A lei que atravessa os três itens

**Ausência de preço significa "não calculável", nunca "R$ 0,00"** — e a tela diz **qual** dos
motivos. Cada motivo pede uma ação diferente de quem opera:

| Motivo | Quando | O que fazer |
|---|---|---|
| `sem_dado` | a fonte não devolveu nada no período | olhar a fonte (Langfuse) |
| `sem_vinculo` | há custo, mas nenhuma conversa do período casa por `sessionId` | olhar a atribuição |
| `modelo_sem_preco` | a fonte registrou uso de um modelo sem preço nela | cadastrar o preço no Langfuse |
| `sem_cotacao` | há custo em dólar e não há cotação cadastrada | cadastrar a cotação |
| `fonte_indisponivel` | a leitura da fonte falhou | olhar a fonte (não é "sem dado") |
| `sem_preco` (mensagem) | o volume saiu, o preço não está no cadastro | cadastrar o preço da mensagem |

No componente, `calcularCpc` herda a lei: faltando qualquer um dos três custos, o CPC é "não
calculável" com o motivo, e o rótulo sai como texto, não como número. Um CPC somado por cima de um
custo ausente seria **menor que a verdade** — a cliente decidiria verba sobre um número que mente
para baixo.

## Dúvidas registradas (não escondidas)

1. **Divergência de moeda é item de operação, não ajuste silencioso.** A cotação é cadastro manual.
   Se o dono não cadastrar, o custo de IA fica em dólar e o CPC não é calculável (`sem_cotacao`) — a
   tela diz isso. É exatamente a mitigação do risco do spec: o Gustavo aponta a divergência entre a
   fonte e a tela.
2. **A Metrics API devolve `0`, não `null`, para modelo sem preço.** A doc do Langfuse só diz "no
   cost is calculated"; não diz se a observação sem preço entra como `0` ou fica fora da soma. Na
   prática o adaptador recebe `0` e **não consegue distinguir** de um custo zero legítimo — por isso
   o guarda `modelo_sem_preco` só dispara quando a borda devolve `null` explícito. **Gap nomeado:**
   um modelo sem preço no Langfuse pode aparecer como custo zero na tela. Fica para o Gustavo achar
   e virar item de operação.
3. **A contagem de mensagem está incompleta por um caminho conhecido.** O envio direto de template
   já `APPROVED` (fora da janela de 24 h) `sendTemplate` **não deixa rastro em banco** — nem fila,
   nem `messages` (lacuna já documentada no ADR de `2026-09-28-bloco-toques`, "A lacuna, nomeada e
   tratada como tal"). O FIX-392 pede a contagem exatamente nas duas fontes que deixam rastro
   (`whatsapp_outbound_queue` + `messages.template_name`), e é o que este bloco conta. Quando os
   templates de remarketing entrarem em produção por esse caminho, o volume estará **subcontado** —
   por isso a completude da contagem depende de dar rastro àquele envio (fora deste bloco).
4. **`usage_key` (fila) e `template_name` (mensagens) não são a mesma chave.** A contagem por
   template soma os dois espaços de nome; onde eles divergem, o mesmo template pode aparecer em duas
   linhas. Não afeta o TOTAL (o fato é a soma), mas afeta a leitura por template.
5. **O dia do custo de IA é o da fonte (UTC), não o dia do negócio.** A granularidade `day` do
   Langfuse corta em UTC; o resto da tela corta em `America/Sao_Paulo`. Um turno das 21 h BRT pode
   cair no dia seguinte. Não muda o total do período fechado; muda a linha do gráfico por dia.
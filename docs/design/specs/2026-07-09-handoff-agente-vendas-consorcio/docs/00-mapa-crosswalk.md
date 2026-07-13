# 00 — Mapa: comportamento → código existente

Cada linha do comportamento validado, cruzada com a arquitetura real.
Legenda: **REAPROVEITA** (já existe) · **ESTENDE** (existe, muda) · **NASCE** (não existe)

---

## Convergências (o código já está certo — não mexer)

| Comportamento | Onde já vive | Status |
|---|---|---|
| Lance total (embutido + bolso) amortiza o saldo | `consorcio/contemplation-dial.ts:116-122` (FIX-221 "AMORTIZA") | REAPROVEITA — bate com o protótipo |
| Faixa `<8% → sorteio` (a regra, não a curva) | `contemplation-dial.ts` | REAPROVEITA |
| Embutido = `min(requiredLancePct, maxEmbutido)`; crédito líquido cai | `contemplation-dial.ts:100-106` | REAPROVEITA |
| LLM não inventa número de card (payload coagido server-side) | `orchestrator/runner.ts:427-458` | REAPROVEITA |
| Tool só age sobre grupo já exibido | `orchestrator/action-policy.ts` | REAPROVEITA |
| Nunca garantir contemplação | `system-prompt.ts:64,:453` | REAPROVEITA |
| Nunca arredondar valor monetário (CDC art. 30) | `system-prompt.ts:546` | REAPROVEITA |
| `disclaimer` obrigatório no retorno de cada motor | `pmt.ts:93`, `scenarios.ts:35`, `contemplation-dial.ts` | REAPROVEITA |
| Busca filtrada por valor do bem | `recommendation.ts:232` (`creditMin/creditMax`) | REAPROVEITA |
| Sweep de embutido sempre-ligado (Bevi 2x: sem embutido + ~30%) | `bevi-self-contract-adapter.ts` | REAPROVEITA — **base da "jogada inteligente"** |
| `taxaContemplacao` deliberadamente NÃO usada como % | decisão já existente; contemplação vem de `monthlyAwardedQuotas` | REAPROVEITA — ver `05` |

> **Correção de rumo registrada:** no protótipo eu cheguei a exibir `taxaContemplacao` como "% de contemplação". Foi **inferência errada minha** — o campo não tem semântica documentada. O código de vocês já estava certo em não usar. O protótipo final removeu. Se um dia quiserem sinal de contemplação no card, a fonte correta é **`monthlyAwardedQuotas`** (contagem real de contemplados/mês), não `taxaContemplacao`.

---

## Divergências (precisam de mudança)

### D0 — Curva do lance necessário está ERRADA (prioridade máxima)
- **Hoje:** `contemplation-dial.ts:89-96` usa `raw = winningBid * anchorMonth / targetMonth` (hiperbólica).
- **Problema 1 — achatamento:** meses 1 a 6 saem todos em **90% (clamp)**. A agulha perde resolução justamente onde o cliente arrasta e decide.
- **Problema 2 — não converge:** no último mês do prazo ainda exige **11%** de lance. O modo `sorteio` (`<8%`) nunca dispara sozinho.
- **Alvo:** curva de potência calibrada no ponto real da Bevi, que tende a zero no fim do prazo. Fórmula completa + tabela comparativa em `03-regras-calculo.md`.
- **Mantém-se:** o modelo **AMORTIZA** (FIX-221) e as faixas `<8% → sorteio`. Só a curva muda.
- **Tipo:** ESTENDE (substituição de fórmula) — **fazer antes de tudo, é a base da agulha**

### D1 — Ordem dos gates: `experience` está cedo demais
- **Hoje:** `qualify-state.ts:51` (`nextGate`) coloca `experience` antes de `credit`/`search`.
- **Alvo:** `experience` ("já fez consórcio?") vem **depois** de `search`, com os grupos já na tela.
- **Por quê:** quem não entende consórcio não sabe ler 15 grupos; mas perguntar antes atrasa quem já está quente. Depois da busca, o lead vê valor primeiro e a explicação só dispara pra novato.
- **Impacto:** reordenar a cadeia de ifs em `nextGate`. Ver `01-gates-e-ordem.md`.
- **Tipo:** ESTENDE

### D2 — Falta captura do desejo (o "por que agora")
- **Hoje:** gates coletam fatos (`name`, `credit`, `timeframe`). Não há gancho emocional.
- **Alvo:** depois do `name`, duas perguntas curtas: *qual bem específico* + *por que agora*. A resposta é reaproveitada no resto da conversa.
- **Onde:** novos slots em `conversations.metadata.qualifyAnswers` (`desiredItem`, `motivation`) + gate leve `desire` (sem card, não bloqueante).
- **Tipo:** NASCE (barato — slot + prompt, não card)

### D3 — Card de lance embutido não existe
- **Hoje:** só chip/gate `lance-embutido` + seção dentro de `simulation_result` / `contemplation_dial`.
- **Alvo:** card dedicado, curto, explicando o conceito **antes** da agulha.
- **Tipo:** NASCE. Spec em `02-cards-novos.md`

### D4 — Card de escassez não existe
- **Hoje:** `availableSlots` é campo dentro de outros cards + diretiva de narração (`orchestrator/directives.ts:262`).
- **Alvo:** card visual dedicado ("grupo quase cheio", barra, **"restam apenas N"** — sem cravar o total, que não temos).
- **Tipo:** NASCE. Spec em `02-cards-novos.md`

### D5 — Card de "dois caminhos" não existe
- **Hoje:** o mais próximo é `decision-prompt.tsx` (3 opções) ou `scenarios.tsx`.
- **Alvo:** card A/B pra quem **não vai dar lance**: (A) esperar sorteio, (B) lance pequeno opcional. Devolve a decisão ao cliente.
- **Tipo:** NASCE (ou ESTENDE `decision-prompt` com um variant). Spec em `02-cards-novos.md`

### D6 — Recomendação sem guardrail de crédito líquido
- **Hoje:** `recommendation.ts` faz scoring (`monthlyFit .4 / contemplation .25 / adminFee .2 / termMatch .15`).
- **Alvo:** invariante duro — se a estratégia usa embutido, `creditoLiquido >= valorDoBem`. Se violar, subir a faixa de carta (o sweep `[0.7, 1.0, 1.3]x` já existe: usar a faixa superior).
- **Tipo:** ESTENDE. Detalhe em `03-regras-calculo.md`

### D7 — "Reduzir prazo" fica fora
- **Decisão de produto:** não tratamos redução de prazo. O abatimento vira **parcela menor**, só.
- **Onde:** nenhum card/copy/prompt oferece a opção. `contemplation-dial.ts` já é AMORTIZA→parcela; só não expor prazo.
- **Tipo:** ESTENDE (guarda no `sanitizer.ts` + copy)

### D8 — Fecho: WhatsApp com "oi" + especialista de cadastros
- **Hoje:** `suggest_handoff` → `handoffToAgents` (proxy) e `createMesaHandoff` (mesa). WhatsApp Cloud API ativa.
- **Alvo:** ao aceitar, o agente **não** diz "reservado". Diz que enviou mensagem no WhatsApp, pede um **"oi"** e avisa que a **especialista em cadastros chama em alguns minutos** pra pedir dados e documentos.
- **Nota técnica:** o "oi" do cliente é o que **abre a janela de 24h** (`whatsapp/window.ts`). A copy tem função técnica, não é só simpatia. Se ele não responder, o envio cai na fila de template (`whatsapp_outbound_queue`).
- **Tipo:** ESTENDE (copy + orquestração do handoff existente)

### D9 — Cadência de mensagens (balões)
- **Alvo:** balões curtos **agrupados por ideia** — nem paredão, nem 4 mensagens picadas.
- **Regra:** 1 balão = 1 ideia completa (2–3 linhas). Quebra só ao mudar de assunto ou pra respiro antes da pergunta-chave.
- **Onde:** `system-prompt.ts` seção `<voice>` + `<examples>`.
- **Tipo:** ESTENDE (prompt)

---

## Resumo do esforço

| Tipo | Itens |
|---|---|
| REAPROVEITA (zero esforço) | modelo AMORTIZA, coerção de payload, action-policy, compliance base, sweep de embutido |
| **ESTENDE (crítico)** | **D0 curva do lance (fórmula errada)** · D6 guardrail |
| ESTENDE (baixo/médio) | D1 ordem dos gates · D7 sem prazo · D8 fecho · D9 cadência |
| NASCE (médio) | D2 slots de desejo · D3/D4/D5 três cards |

# Proposta — Dashboard de Performance: o funil, o comportamento do cliente e os 28.621 "Direto"

> 2026-08-14 · Kairo (via Claude) · Escopo: `/admin/performance`.
> **Status: onda 1 implementada em 2026-08-15.** O que entrou e o que ficou está logo abaixo.

## Estado (2026-08-15)

**Entrou na onda 1:**

| O quê | Onde ficou |
|---|---|
| Parte 1 inteira — o funil partido em "A porta" e "A conversa" | `porta-do-funil.tsx`, `funil-midia-chart.tsx`, `computePorta` |
| Perda em absoluto, dividida em morto × vivo (janela de 7 dias) | `performance-queries.ts` — CTE de profundidade |
| Cobertura de atribuição vira nota de rodapé da porta, e a faixa some | `porta-do-funil.tsx` |
| Parte 3 — saem o funil comercial de 9 estágios, os KPIs e o split por canal; **o segundo `fetch` foi junto** | `page.tsx` |
| O split web × WhatsApp não morre com o gráfico: vira uma frase na porta | `PortaDoFunil.web` / `.whatsapp` |
| Tabela por origem agrupada por canal, campanhas a um clique | `agrupar-origens.ts` + `tabela-origens.tsx` |
| Parte 7.1 — `identificados` uniformizado em conversas (contava leads) | `computeOrigens` |
| Série com eixo secundário | `serie-aquisicao-chart.tsx` |

**Ficou para a onda 2** (nada disto existe ainda): os quatro componentes novos da Parte 2
(qualidade do tráfego, depois da proposta, onde o agente empaca, a demanda que chegou); a
classificação da Parte 5 e o conserto do proxy; as seções nomeadas e o selo de marco zero da
Parte 4; a Parte 7.3 (visita de Click-to-WhatsApp ainda entra no mesmo topo da visita web); e a
troca da coluna "Visita → contrato %" por "conversas por 1.000 visitas".

## Sumário da recomendação

1. **O funil vira dois componentes**, porque hoje ele responde duas perguntas de naturezas
   diferentes com um desenho só: `visita → conversa` (3 ordens de grandeza, dominado por uma
   dúvida de medição) e `conversa → contrato` (19 → 0, legível em números absolutos). Barra
   proporcional a visitas está errada nos dois casos.
2. **Quatro componentes novos entram**; dois ficam para a segunda onda. Todos com lastro em coluna
   que existe no `src/db/schema.ts`.
3. **Três componentes saem** (funil comercial de 9 estágios, split por canal, setas de tendência
   dos KPIs) — e sair deles elimina o segundo `fetch` da página.
4. **Os 28.621 "Direto" não são somados como gente.** O painel classifica a chegada por sinal
   determinístico já gravado (`user_agent`, `visitor_id`, hora, `landing_path`) e publica a base
   plausível como denominador de toda taxa da tela — com a regra escrita na própria tela.

---

## Parte 0 — O que eu li, e o que o código me disse antes de eu propor

| Achado | Onde | Por que importa para o desenho |
|---|---|---|
| A visita é gravada no proxy, server-side, em `/`, `/autos`, `/imoveis`, `/motos` | `src/proxy.ts:82-121` | Não há **nenhum** filtro de robô. Só `prefetch`/`rsc` são descartados. Todo scanner, health-check e crawler que toca a landing vira linha em `visits`. |
| Cliente sem cookie gera `visitorId` **novo a cada requisição** | `src/proxy.ts:100-107` + `src/lib/attribution/visit-cookie.ts:79-97` | É o sinal determinístico mais forte que temos: população de navegador real tem `visitas ÷ visitantes > 1`. Robô fica cravado em 1,00. |
| `visits.userAgent` é gravado | `src/lib/attribution/visit-store.ts:60` | Dá para classificar por header **declarado pelo cliente** — fato, não adivinhação. |
| O funil de mídia conta só conversa **com** `visit_id` | `src/lib/admin/performance-queries.ts:83-85` | Com 19 conversas, jogar fora as 4 sem origem descarta 21% da evidência de produto. Ver Parte 1.3. |
| A tabela de origens conta `identificados` como `count(DISTINCT l.id)` (leads) e o funil conta `count(DISTINCT c.id)` (conversas) | `performance-queries.ts:164` vs `:101-105` | Os dois números têm o mesmo nome na mesma tela e podem divergir. O próprio comentário do funil explica por que conversa é o certo. **Defeito a corrigir junto.** |
| `agrupar-origens.ts` já existe, com testes, e a `TabelaOrigens` **não o usa** | `src/lib/admin/agrupar-origens.ts` vs `tabela-origens.tsx:50` | O agrupamento por canal já decidido está escrito e desligado. É plugar. |
| `conversations.metadata` guarda `gateStuckTurns`, `gateDefaultsAssumed`, `qualifyAnswers`, `escolha`, `retomada`, `discoveryEmptyStreak` | `src/lib/agent/personas.ts:102-445` | É o dado mais rico e mais desperdiçado do banco. Três das quatro propostas saem daqui. |
| `conversationEvaluations` só é escrito em marco (lead capturado / handoff) | `src/lib/eval/trigger.ts` | ~10 linhas em 30 dias. **Não dá gráfico.** Rejeitado, ver Parte 6. |
| `leadInsights` só é escrito por clique no painel | `src/app/api/admin/{leads,conversations}/[id]/insights/route.ts` | Cobertura enviesada pelo que alguém abriu. **Rejeitado**, ver Parte 6. |
| `/admin` (raiz) virou a sala de guerra "Agora", com pulso ao vivo | `src/app/admin/(dashboard)/page.tsx` + `agora-types.ts` | A divisão de trabalho já existe: **Agora = presente, Performance = período**. O topo da Performance não pode repetir o pulso. |
| O código da atribuição entrou em `a161c0c6` (03/08) e as landings de vertical em `9643507a` (11/08) | `git log -- src/lib/attribution src/proxy.ts` | A série que "começa em 09/08" quase certamente marca o **deploy da medição**, não o nascimento do tráfego. **Hipótese não confirmada** — falta cruzar com a data do deploy. O painel precisa marcar o início da medição de qualquer jeito. |

### A conta que ninguém está vendo hoje

Com os números que já estão na tela, e só com aritmética:

| Recorte | Visitas | Conversas | Conversa por 1.000 visitas |
|---|---:|---:|---:|
| Direto | 28.621 | 15 | **0,52** |
| Campanhas + resto | 1.526 | 4 | **2,62** |

**A mídia paga converte ~5× melhor que o "Direto", e o painel atual não consegue mostrar isso**
porque o Direto afoga tudo no mesmo eixo. Esse é o número que decide verba, e ele está escondido
atrás de um problema de medição.

---

## Parte 1 — O funil: qual é o desenho certo

### 1.1 Por que dois componentes, e não um

O funil de hoje é um único desenho respondendo a duas perguntas que **não compartilham nem
denominador, nem população, nem decisão**:

- **"O tráfego chega no produto?"** — 30.147 → 19. Não é um degrau de funil; é um limiar. A razão
  é 0,06% e está dominada por uma dúvida de instrumentação, não por comportamento de cliente. A
  decisão que ela destrava é *"dá para confiar no denominador?"*.
- **"De quem falou, quem morre onde?"** — 19 → 18 → 10 → 9 → 5 → 0. Legível em absoluto, cada
  degrau importa, e a decisão é *"o que consertar no agente"*.

Espremer as duas no mesmo eixo produz o defeito de hoje: 19 vira uma lasca de 0,06% e as seis
etapas de baixo ficam visualmente idênticas — justamente as seis que carregam a informação.

**Dois componentes, com uma emenda obrigatória: a base do primeiro é o topo do segundo.** É isso
que os mantém uma história só em vez de dois gráficos soltos.

### 1.2 O que eu rejeitei, e por quê

| Alternativa | Por que não |
|---|---|
| **Escala logarítmica** | Faz 19 parecer ~60% de 30.147. Troca uma mentira por outra, e ainda exige que o leitor saiba ler log para desfazê-la. Quem decide verba olha o tamanho da barra. |
| **Normalizar cada etapa em 100% da anterior** | Todo funil fica com cara de saudável, e some o número absoluto — que, com N=19, é a única coisa que importa. "55% de conversão" e "5 propostas" não são a mesma informação. |
| **Funil horizontal clássico (trapézio)** | Mesmo problema da proporcionalidade, com menos espaço para rótulo. A escada vertical de hoje já é a escolha certa de forma; o erro está no **denominador**, não no formato. |
| **Quebrar o eixo (axis break)** | Convenção que quase ninguém lê corretamente, e mascara exatamente a magnitude que precisa doer. |

### 1.3 Uma decisão de população que precisa mudar junto

Hoje **todas** as etapas depois de `visitas` contam só conversa com `visit_id` (`performance-queries.ts:83`).
Isso está certo para a pergunta de mídia e **errado** para a pergunta de produto: onde a conversa
morre não depende de saber qual anúncio a trouxe.

> **Regra nova:** pergunta de mídia (qual campanha paga) → só atribuída. Pergunta de produto (onde
> morre, o que pediu, onde o agente empaca) → **todas** as conversas reais. Cada card diz na
> legenda qual população está usando.

### 1.4 Componente A — "A porta"

Não é gráfico de barra. São três números e uma razão. Um gráfico aqui seria decoração de uma
divisão.

```
┌─ A porta ─────────────────────────────────────────────────────────────────┐
│                                                                            │
│   1.526                       19                        1,2 %             │
│   visitas plausíveis   ───▶   conversas abertas         abrem o chat      │
│                                                                            │
│   de 30.147 chegadas brutas · 28.621 classificadas como não-humanas       │
│   [ ver como classificamos ]                                              │
│                                                                            │
│   ⓘ 15 das 19 conversas têm origem conhecida (79%) — as outras 4 contam    │
│     aqui e no funil abaixo, mas não na tabela por origem.                  │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Números ilustrativos** — quem calcula é a query.
- A faixa de cobertura de atribuição (hoje um banner solto no topo da página) **vira esta linha
  `ⓘ`**. Ela merece existir; não merece uma faixa amarela própria concorrendo com o título.
- Dado: `visits` (com a classificação da Parte 5), `conversations.visitId`, `conversations.isSimulated`.

### 1.5 Componente B — "A conversa"

Topo = conversas (100%). Todas as barras voltam a ser legíveis. É HTML puro (as `div`s que já
existem em `funil-midia-chart.tsx`), não recharts — funil de 6 linhas não é trabalho para
biblioteca de gráfico.

```
┌─ A conversa ──────────────────────────────────────────────────────────────┐
│ Das 19 que abriram o chat, onde cada uma parou            todas as conversas│
│                                                                            │
│ Abriram o chat        ██████████████████████████████████   19    100%     │
│                                                                            │
│ Escreveram algo       ████████████████████████████████▏    18     95%     │
│   └ 1 parou aqui  ·  0 ainda viva                                         │
│                                                                            │
│ Se identificaram      ██████████████████▎                  10     53%     │
│   └ ▼ 8 pararam aqui  ·  2 ainda vivas          ← MAIOR PERDA DO FUNIL    │
│                                                                            │
│ Viram oferta real     ████████████████▍                     9     47%     │
│   └ 1 parou aqui  ·  1 ainda viva                                         │
│                                                                            │
│ Proposta na Bevi      █████████▏                            5     26%     │
│   └ 4 pararam aqui  ·  1 ainda viva                                       │
│                                                                            │
│ Contrato fechado      ▏                                     0      0%     │
│   └ 5 pararam aqui  ·  3 ainda vivas   → ver "Depois da proposta"         │
│                                                                            │
│ "ainda viva" = cliente escreveu nos últimos 7 dias e a conversa não está   │
│ encerrada. Contagem de conversas, nunca de leads.                          │
└────────────────────────────────────────────────────────────────────────────┘
```

Quatro mudanças de conteúdo, todas motivadas:

1. **A queda vira número absoluto.** "44,4% saíram aqui" com N=18 é precisão falsa; "8 pararam
   aqui" é o que se conserta. O percentual do topo fica na direita, onde já está.
2. **A queda se divide em morto × vivo.** É a diferença entre duas decisões opostas: *conserte o
   agente* (morreu) e *puxe de volta* (viva — o watchdog de `dcdad19e` existe exatamente para
   isso). Sem essa divisão o painel manda consertar o que talvez só precise de um empurrão.
   Dado: `max(messages.createdAt WHERE role='user')` por conversa + `conversations.status`.
   `lastInboundAt` não serve sozinho — é específico do WhatsApp (`schema.ts:352-355`).
3. **"Maior perda" com rótulo textual**, não só a cor âmbar de hoje (`funil-midia-chart.tsx:67`).
   Cor sozinha não carrega estado nesta casa.
4. **A última linha aponta para o card de baixo.** "0 contratos" não é fim de história; é uma
   pergunta que o próximo componente responde.

Barra: preenchimento `--chart-1` em **todas** as etapas (é a mesma grandeza em profundidades
diferentes — cores distintas insinuariam categorias distintas), trilho `--muted`. Ícone `lucide`
`TrendingDown` na linha de perda, `Clock` no contador de vivas.

---

## Parte 2 — Componentes novos, por ordem de impacto

Corte proposto: **1 a 4 entram agora**. 5 e 6 são bons e baratos, mas esperam volume ou espaço.

---

### 1. Qualidade do tráfego — "Isso é gente?"

> **Pergunta de negócio:** das 30 mil chegadas do mês, quantas são pessoas — e qual é a taxa de
> conversão de verdade?

Primeiro da fila porque **é o denominador de todo o resto da tela**. Enquanto ele não existir,
"0,06% de conversão" é um número sobre o qual não se pode decidir nada.

**De onde sai:** `visits.userAgent`, `visits.visitorId`, `visits.createdAt`, `visits.landingPath`,
`visits.referrer`, `visits.utmSource`, e `conversations.visitId` (a âncora que vence qualquer
heurística).

**Visualização:** uma barra 100% empilhada de três segmentos com **rótulo direto dentro do
segmento** (a cor é decoração; o rótulo é a informação), seguida das quatro evidências que
sustentam a classificação. Barra empilhada e não pizza porque a leitura é "que fração do todo", e
porque três rótulos cabem inline.

```
┌─ Qualidade do tráfego ────────────────────────────────────────────────────┐
│ 30.147 chegadas registradas — quantas parecem gente?                      │
│                                                                            │
│ ▨▨▨▨▨▨▨▨▨▨▨▨▨▨▨▨▨▨▨▨▨▨▨▨▨▨▨▨▨▨▨▨▨▨▨▨▨▨░░░░░░░░████                       │
│ └ 24.902 robô declarado (83%) ──────────┘└ 3.719 └ 1.526                  │
│                                            sem      plausível             │
│                                            cookie   (5%)                  │
│                                            (12%)                          │
│                                                                            │
│ Por que classificamos assim                                                │
│  🤖 user-agent   24.902 chegadas com UA de robô conhecido ou vazio        │
│  🍪 cookie       1,00 visita por visitante — navegador real repete (1,3+) │
│  🕐 ritmo        ▁▂▁▂▁▂▁▂▁▂▁▂▁▂▁▂▁▂▁▂▁▂  plano nas 24 h                  │
│                  ▁▁▁▂▄▆██▇▆▅▄▅▆▇█▇▅▃▂▁▁  ← como a curva de gente é        │
│  🎯 destino      28.104 nunca abriram o chat                              │
│                                                                            │
│ ⓘ Visita que virou conversa NUNCA é classificada como robô, qualquer que   │
│   seja o user-agent. Fato do servidor vence heurística.                    │
│ Base de todas as taxas desta tela: 1.526 visitas plausíveis   [ver bruto] │
└────────────────────────────────────────────────────────────────────────────┘
```

**Decisão que destrava:** se o plausível for menos de ~10% do bruto, **pare de olhar taxa de
conversão global e conserte a instrumentação antes de mexer em criativo** — e o conserto real é no
`registrarVisita` (`src/proxy.ts:87-93`), no mesmo `if` que já descarta prefetch, não no painel. O
painel é o diagnóstico; o proxy é a cura. Mas o histórico continua sujo, então a classificação
precisa existir na leitura de qualquer jeito.

**Cor/acessibilidade:** segmento "robô declarado" com hachura diagonal (`<pattern>` no `defs` do
recharts) além do matiz; os três com rótulo direto e ícone `lucide` próprio (`Bot`, `CookieIcon`,
`Clock`, `Target`).

---

### 2. Depois da proposta — "onde os R$ pararam"

> **Pergunta de negócio:** cinco propostas viraram zero contrato. Travou na Bevi, na mesa, no
> documento ou no cliente?

Segundo porque é o dinheiro que **já está na porta**. Consertar o topo com 5 propostas paradas é
encher um balde furado.

**De onde sai:** `beviProposals` (`creditValue`, `monthlyPayment`, `administradora`, `segmento`,
`grupo`, `termMonths`, `proposalStatus`, `createdAt`, `updatedAt`) · `leads` (`name`, `stage`) ·
`leadEvents` (`fromStage`, `toStage`, `createdAt` → tempo entre estágios) · `mesaHandoffs`
(`status`, `createdAt`, `closedAt`, `mesaAttendantId`). Extra disponível e não listado no briefing,
mas presente no schema e verificado: `clientDocuments` (`slot`, `dispatchStatus`, `dispatchedAt`)
— é o que separa "sem documento" de "documento enviado e parado lá".

**Visualização:** uma faixa de 5 marcos com contagem, e **abaixo dela a lista das 5 propostas, uma
por linha**. Com N=5, enumerar é mais informativo do que agregar — e a linha é clicável para a
conversa. Gráfico de 5 pontos seria cerimônia.

```
┌─ Depois da proposta ──────────────────────────────────────────────────────┐
│ 5 propostas criadas · 0 contratos · R$ 612 mil parados                    │
│                                                                            │
│  criada ──▶ documentos ──▶ mesa assumiu ──▶ pagamento ──▶ contrato        │
│    5            2               1               0             0           │
│  ▔▔▔▔▔        ▔▔▔▔▔           ▔▔▔▔▔           ▔▔▔▔▔         ▔▔▔▔▔         │
│                                                                            │
│ Cliente      Crédito     Parcela   Adm.       Status Bevi    Parada há    │
│ ───────────────────────────────────────────────────────────────────────── │
│ Marcos S.    R$ 180.000  R$ 1.480  Rodobens   documentos      6 dias  ⚠   │
│ Juliana P.   R$  90.000  R$   790  Âncora     simulacao       4 dias      │
│ Rafael T.    R$ 250.000  R$ 1.960  Rodobens   documentos      3 dias      │
│ …                                                                          │
│                                                                            │
│ ⚠ parada há mais tempo que a mediana · linha clica para a conversa        │
└────────────────────────────────────────────────────────────────────────────┘
```

**Decisão que destrava:** se as cinco estiverem paradas em `documentos`, **o gargalo é KYC e o
conserto é o fluxo de documento — não o anúncio**. Se estiverem paradas antes da mesa assumir, o
gargalo é operacional (ninguém pegou o caso) e resolve com gente, não com produto.

---

### 3. Onde o agente empaca

> **Pergunta de negócio:** o agente está travando na mesma pergunta com todo mundo?

**De onde sai:** `conversations.metadata` — `gateStuckTurns` (contador por gate,
`personas.ts:189-197`), `gateDefaultsAssumed` (o sistema desistiu e assumiu um padrão, `:198-201`),
`gateAttempts` (escada de cobrança, `:182-188`), `pendingGate`, `discoveryEmptyStreak`,
`retomada.attempts`. Cruzado com "morreu neste gate" (nenhuma mensagem de usuário depois).

> **Isto não é medir a fala do modelo.** São contadores que o próprio runner escreve no estado da
> conversa — fato do servidor, não paráfrase. É exatamente a categoria que o `CLAUDE.md` manda
> tratar como código: dado estrutural, sinal determinístico, sem juiz e sem regex.

**Visualização:** barras horizontais por gate (ordenadas pela ordem real do funil em `nextGate`,
não pelo volume — a sequência é a informação), com dois marcadores textuais por linha.

```
┌─ Onde o agente empaca ────────────────────────────────────────────────────┐
│ Em que pergunta o funil parou de andar          18 conversas com resposta │
│                                                                            │
│ name        ▏                     0    –          –                       │
│ desire      ██▏                   1    padrão 0   morreu 0                │
│ credit      ████████▏             4    padrão 1   morreu 2                │
│ timeframe   ██████▏               3    padrão 3   morreu 0                │
│ identify    ██████████████▏       7    padrão 0   morreu 4  ◀ pior        │
│ lance       ██▏                   1    padrão 0   morreu 1                │
│ reco-consent ██▏                  1    padrão 1   morreu 0                │
│ decision    ████▏                 2    padrão –   morreu 2                │
│             └ conversas em que o gate repetiu sem avançar                 │
│                                                                            │
│ "padrão" = o sistema assumiu um valor por conta própria após 3 tentativas │
│ "morreu" = a conversa acabou nesse gate                                   │
└────────────────────────────────────────────────────────────────────────────┘
```

**Decisão que destrava:** gate com muita trava **e** muita morte = a pergunta está errada ou chega
cedo demais → mexe no prompt e na ordem do funil (`nextGate`). Gate com muita trava e **zero**
morte = o escape de default está funcionando, deixa quieto. Gate com muito "padrão assumido" é
alerta silencioso: o funil está andando com **dado inventado pelo sistema**, e isso vai parar na
proposta.

---

### 4. A demanda que chegou

> **Pergunta de negócio:** o que essas pessoas querem comprar, de que tamanho — e o que a gente
> não consegue atender?

**De onde sai:** `conversations.metadata.currentCategory` e `metadata.qualifyAnswers`:
`creditMax`/`creditMin`, `creditClampedFrom` (**pediu fora da faixa e foi cortado** —
`personas.ts:27-30`), `creditoMinimoInformado`, `parcelaAlvo`, `monthlyBudget`, `prazoMeses`,
`hasLance`, `objetivo`, `desiredItem`, `motivation`.

**Visualização:** um card em dois registros. Em cima, agregado (4 barras de categoria + um **strip
plot**: um ponto por conversa num eixo de R$). Embaixo, o **literal**: o que a pessoa escreveu.
Strip plot em vez de histograma porque com 19 pontos um histograma inventa distribuição; strip
mostra cada caso, o vazio entre eles e os fora-de-faixa.

```
┌─ A demanda que chegou ────────────────────────────────────────────────────┐
│ O que as 19 pessoas pediram — e de que tamanho                            │
│                                                                            │
│ Imóvel ███████ 7   Auto ██████ 6   Moto ██ 2   Sem categoria ████ 4      │
│                                                                            │
│ Valor do bem pedido — cada marca é uma conversa                            │
│   30k    60k   100k      200k         300k          500k        800k      │
│   ├───────●──●──┼───●─────┼───●●───●──┼──────●──────┤▲───────────▲──┤     │
│                                        faixa atendida            │        │
│   ● dentro da faixa    ▲ pediu fora (creditClampedFrom)          │        │
│   mediana R$ 145.000 · piso Bevi R$ 30.000                                │
│                                                                            │
│ Lance:  quer 8  ·  talvez 3  ·  não 5  ·  só parcela 3                   │
│                                                                            │
│ Por que agora — o que a pessoa escreveu                                    │
│  · "carro vive na oficina, já gastei 4 mil esse ano"      auto    R$ 90k  │
│  · "aluguel subiu de novo"                                imóvel  R$ 250k │
│  · "quero sair do financiamento"                          auto    R$ 70k  │
│  …                                                                         │
└────────────────────────────────────────────────────────────────────────────┘
```

**Decisão que destrava:** três, todas de verba. (a) Categoria dominante ≠ categoria anunciada →
realoca. (b) Muitos `▲` fora da faixa → **o criativo atrai quem não podemos atender**; ou muda o
público, ou entra administradora nova. (c) `hasLance = no` dominando → o gancho de lance no anúncio
está falando com quem não tem reserva; a copy tem que virar parcela. E a lista de `motivation` é,
literalmente, o gerador de copy do próximo anúncio — 19 frases de gente real valem mais que
qualquer barra.

---

### — corte aqui —

### 5. Fôlego da conversa *(segunda onda)*

> **Pergunta:** quantas mensagens até virar proposta — e as que morrem, morrem em qual mensagem?

**De onde sai:** `messages` (`role`, `createdAt`, `conversationId`) → nº de turnos do cliente,
mediana, tempo entre a mensagem do cliente e a resposta do agente. Desfecho vem de
`beviProposals`/`leads`.

**Visualização:** strip plot por desfecho, marcador **de forma diferente** por linha (não só cor).

```
┌─ Fôlego da conversa ──────────────────────────────────────────────────────┐
│ turnos do cliente   1   3   5   7   9   11  13  15  17  20+               │
│                     ├───┼───┼───┼───┼───┼───┼───┼───┼───┤                 │
│ virou proposta                      ●     ●●        ●                     │
│ se identificou            ○   ○ ○      ○                                  │
│ só engajou          ×  × ××   ×                                           │
│ nunca respondeu     ·                                                     │
│                                                                            │
│ mediana até a proposta: 12 turnos · resposta do agente 4,2 s (p95 11 s)  │
└────────────────────────────────────────────────────────────────────────────┘
```

**Decisão:** morte concentrada nos 3 primeiros turnos = a abertura afasta. Conversa de 20 turnos
sem proposta = o agente conversa e não fecha. São dois consertos opostos, e hoje não há como
distinguir.

Fica de fora agora porque **o componente 3 já aponta o gate** onde a morte acontece, que é a versão
acionável da mesma informação. Este entra quando houver volume para a distribuição significar algo.

### 6. Sinal devolvido à Meta *(segunda onda — o mais barato de todos)*

> **Pergunta:** o algoritmo do anúncio está recebendo de volta o sinal do que é um bom lead?

**De onde sai:** `conversionEvents` (`eventName`, `status`, `destination`, `occurredAt`, `sentAt`,
`lastError`, `attempts`). Uma query, uma faixa.

```
┌─ Sinal devolvido à Meta ──────────────────────────────────────────────────┐
│ lead_qualificado    10 registrados  ·  10 enviados          ✓ ok          │
│ proposta_criada      5 registrados  ·   0 enviados          ⨯ pendentes   │
│ contrato_fechado     0 registrados                            –           │
│                                                                            │
│ ⓘ Sem sinal de volta, a campanha otimiza por visita — e visita é          │
│   exatamente o que ela está entregando.                                    │
└────────────────────────────────────────────────────────────────────────────┘
```

**Decisão:** `pending`/`failed` > 0 → **não escale verba**. A campanha está aprendendo com o sinal
errado, e escalar multiplica o público errado. É o único item da lista que não é comportamento de
cliente; ganha o espaço porque é a explicação causal mais provável do 0,06% e cabe em 4 linhas. Se
o espaço apertar, vira uma linha dentro do card 1.

---

## Parte 3 — O que sai da tela

| O que sai | Onde está | Por que não paga aluguel |
|---|---|---|
| **Funil comercial de 9 estágios** (`FunnelChart`) | `page.tsx:138` | É o mesmo funil, medido de outra tabela, com 9 barras das quais 5 são estruturalmente zero (`na_administradora`, `em_atendimento`, `aguardando_pagamento`, `fechado_ganho`, `perdido`). Duas escadas na mesma página, com números que podem divergir, e o leitor sem saber qual acreditar. Quem responde essa pergunta bem é o card **"Depois da proposta"**. |
| **Split por canal** (`ChannelBreakdownChart`) | `page.tsx:144` | Duas categorias. Isso é uma frase, não um gráfico. Vira uma coluna na tabela por origem e uma linha de texto no funil ("14 web · 5 WhatsApp"). |
| **Setas de tendência dos KPIs** (`KpiData.trends`) | `dashboard-types.ts:29-34` | Comparam com os 30 dias anteriores. A medição tem **5 dias**. Toda seta hoje é `+100%` contra zero — ruído com aparência de informação. Some até existir período comparável; o painel diz "sem base de comparação ainda". |
| **`avgFunnelDays` e `conversionRate` dos KPIs** | `dashboard-queries.ts:60-80` | Média de dias até fechar, com zero fechamentos, é 0,0 — precisão falsa. Taxa de conversão de lead duplica a última linha do funil. |
| **Coluna "Visita → contrato %" da tabela de origens** | `tabela-origens.tsx:46` | Quinze linhas de "0,0%". Uma coluna inteira de tinta sem variância. **Troque por "conversas por 1.000 visitas"** — é a única taxa com sinal hoje, e é ela que mostra o 5× da mídia paga sobre o Direto. Devolva a coluna de contrato quando houver contrato. |
| **Faixa de cobertura de atribuição como banner** | `cobertura-atribuicao.tsx` | O conteúdo fica; o formato sai. Vira a linha `ⓘ` do card "A porta". Faixa amarela no topo da página compete com o título e vira paisagem em duas semanas. |

**Efeito colateral bom:** cortando `KpiCards` + `FunnelChart` + `ChannelBreakdownChart` a página
**deixa de precisar do `fetch` de `/api/admin/dashboard`** (`page.tsx:79-88`) — um request a menos,
e some a divergência de números entre duas APIs que medem o mesmo funil. Os três componentes só são
usados aqui; nada mais no `/admin` os importa (a raiz virou a sala de guerra "Agora").

---

## Parte 4 — A ordem de leitura da página

Quatro seções nomeadas. A regra de ordenação é **"quanto antes na página, mais cedo na decisão"**,
não "quanto mais bonito".

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Performance                              [ 15/07 – 14/08 ▾ ]           │
│  De onde vem o tráfego, onde ele vaza e o que vira contrato             │
│  ⚑ medição começou em 09/08 — não há período anterior comparável        │
└──────────────────────────────────────────────────────────────────────────┘

  ── 1. O QUE ACONTECEU ─────────────────────────── o resumo do período
     [ A porta ]                      visita → conversa, base plausível
     [ Qualidade do tráfego ]         a classificação e a evidência

  ── 2. ONDE TRAVOU ─────────────────────────────── o que consertar
     [ A conversa ]                   funil de 6 etapas, morto × vivo
     [ Depois da proposta ]           os 5 casos, um por linha
     [ Onde o agente empaca ]         o gate que mata a venda

  ── 3. QUEM CHEGOU, E DE ONDE ──────────────────── onde colocar verba
     [ A demanda que chegou ]         categoria, valor, motivo literal
     [ Aquisição no tempo ]           série com eixo secundário (decidido)
     [ Desempenho por origem ]        canais expansíveis (decidido)

  ── 4. CONFIANÇA DO PAINEL ─────────────────────── o rodapé honesto
     [ Sinal devolvido à Meta ]  ·  [ Fôlego da conversa ]  ·  notas de método
```

**Por que a série temporal não está no topo**, contrariando o costume: com 5 dias de dados e um
início que provavelmente marca o deploy da medição, a linha responde "está crescendo?" com
"não sei". Ela é detalhe de tendência, não manchete — e sobe de posição sozinha quando houver 6
semanas de história. Quando subir, ela deve plotar **visitas plausíveis** (com o bruto como faixa
fraca atrás), senão herda o mesmo problema do funil.

**O selo de marco zero no cabeçalho é obrigatório.** Sem ele, todo mundo que abrir o painel vai ler
"tráfego explodiu em 09/08" — e isso é, muito provavelmente, o dia em que ligamos a régua.

---

## Parte 5 — Os 28.621 "Direto": como um painel honesto trata

### O princípio

**Nunca somar máquina e gente no mesmo número.** Não é sobre "limpar dado": é que a razão
`conversas ÷ visitas` só significa alguma coisa se o denominador for gente que podia ter conversado.

### A classificação — quatro sinais, todos já gravados

| Sinal | Coluna | O que prova | Força |
|---|---|---|---|
| **S1 — declarado** | `visits.userAgent` nulo ou com token de robô (`bot`, `crawler`, `spider`, `HeadlessChrome`, `python-requests`, `curl`, `ELB-HealthChecker`, `facebookexternalhit`) | O próprio cliente se identifica. É leitura de um **header**, um fato — não adivinhação sobre texto livre. | Alta |
| **S2 — cookie** | `count(visits) ÷ count(distinct visitor_id)` | O `proxy.ts:100` cria `visitorId` novo **toda vez** que o cliente ignora o `Set-Cookie`. Navegador real repete visitante; a razão fica > 1. Cravada em 1,000 sobre milhares de linhas = ninguém aceitou cookie = não é população de navegador. | Alta (agregada) |
| **S3 — ritmo** | `visits.createdAt` por hora | Gente tem curva diurna. Máquina é plana. Um mês de dados torna isso inequívoco. | Média |
| **S4 — destino** | `visits.landingPath`, ausência de `conversations.visitId` | Sempre `/`, nunca abre nada. Sozinho não prova (visitante real também sai), mas soma. | Baixa isolada |

### A âncora que impede o erro caro

> **Visita que produziu conversa NUNCA é classificada como robô, qualquer que seja o `user-agent`.**

Fato do servidor vence heurística. É a mesma regra que o `CLAUDE.md` aplica ao guard de fala: só
existe classificação **ancorada em estado**, nunca lista solta. E é o que protege as **15 conversas
que vieram do "Direto"** — que, aliás, são a maioria das conversas do mês.

### O que aparece na tela

- Barra de três buckets com rótulo direto (card 1 da Parte 2), **nunca** um número sumindo em
  silêncio. O bruto continua a um clique.
- **A regra escrita na tela**, em português, para alguém poder discordar dela. Classificação sem
  método publicado é opinião com cara de dado.
- Toda taxa da página passa a usar a base plausível, e diz isso na legenda.

### Os dois consertos que isso destrava (o painel é diagnóstico, não cura)

1. **No proxy.** `registrarVisita` (`src/proxy.ts:87-93`) já descarta prefetch e RSC no mesmo `if`.
   Robô declarado e health-check entram ali — e a sujeira para de nascer. Do lado do painel, o
   histórico de agosto continua precisando da classificação para ser lido.
2. **A hipótese que falta testar antes de cravar qualquer causa:** não há rota `/api/health` neste
   repositório, e o `matcher` do proxy (`proxy.ts:150`) inclui `/`. Se o health-check do ALB/ECS
   aponta para `/`, **cada checagem vira uma visita** — o que explicaria volume alto, constante,
   sem cookie e sem conversa. Não confirmei (a config de infra não vive neste repo). A query que
   decide em um minuto:

   ```sql
   SELECT coalesce(user_agent,'(nulo)') AS ua,
          count(*) AS visitas,
          count(DISTINCT visitor_id) AS visitantes,
          round(count(*)::numeric / nullif(count(DISTINCT visitor_id),0), 2) AS por_visitante,
          count(DISTINCT c.id) AS conversas
     FROM visits v
     LEFT JOIN conversations c ON c.visit_id = v.id
    WHERE v.created_at > now() - interval '30 days'
    GROUP BY 1 ORDER BY visitas DESC LIMIT 20;
   ```

   Se o topo dessa lista for `ELB-HealthChecker/2.0` ou UA nulo com `por_visitante = 1.00` e zero
   conversas, o mistério acabou e o conserto é uma linha no proxy.

---

## Parte 6 — Fontes que eu deliberadamente NÃO usei

Registrado para ninguém propor de novo daqui a duas semanas.

| Fonte | Por que fora |
|---|---|
| `conversationEvaluations` (juiz LLM) | Só é escrito em marco de conversa (`src/lib/eval/trigger.ts`) — no ritmo atual, ~10 linhas em 30 dias. Distribuição de nota sobre 10 amostras é ruído com casa decimal. E, pelo `CLAUDE.md`, qualidade de fala se mede **no Langfuse, sobre volume**, não num card do admin. Quando houver volume, o lugar é lá. |
| `leadInsights` | Gerado **sob demanda por clique** no painel. A amostra é "o que alguém abriu", não "o que aconteceu" — um gráfico em cima disso mede o comportamento do operador, não o do cliente. |
| Qualquer contagem de frase do agente | Regra da casa, e ela está certa: espaço de paráfrase é infinito, o teste vira circular, e amordaçar a frase esconde o sintoma. O que este painel mede do agente é **estado** (`gateStuckTurns`, `gateDefaultsAssumed`), não texto. |
| `memoryEvents`, `whatsappOnceKeys` | Telemetria de infraestrutura. Não decide verba nem conserto de produto. |

---

## Parte 7 — Notas de implementação

**Consertos que vão junto (defeitos, não escopo novo):**

1. `computeOrigens` conta `identificados` como `count(DISTINCT l.id)` (leads) enquanto
   `computeFunilMidia` conta `count(DISTINCT c.id)` (conversas) — mesmo rótulo, mesma tela,
   números que podem divergir. O comentário do próprio funil (`performance-queries.ts:99-100`)
   explica por que conversa é o certo. Uniformizar em conversas.
2. `agrupar-origens.ts` está escrito e testado, e a `TabelaOrigens` não o importa. Plugar.
3. `computeFunilMidia` conta `visitas` sem separar canal: visita de Click-to-WhatsApp entra no
   mesmo topo da visita web. Com CTWA ligado isso mistura duas portas diferentes.

**Restrições respeitadas em todo o desenho:**

- **Cor nunca sozinha.** Toda série tem rótulo direto, forma ou traço próprio; a barra empilhada de
  tráfego tem hachura no bucket de robô; o "maior perda" do funil tem texto, não só âmbar; os
  strip plots usam `●` / `○` / `×` / `▲` como marcadores distintos. Se a página for lida em escala
  de cinza, nada se perde.
- **Só token:** `--chart-1..5`, `--muted`, `--aja-sand`, `--aja-ink`, escala `--blue-*`. Zero hex.
- **shadcn `base-nova` + recharts** via `ChartContainer` (`src/components/ui/chart.tsx`). Funil e
  faixa de marcos são HTML/CSS — não vale acender recharts para desenhar 6 `div`s.
- **Ícones `lucide`.** Números com `tabular-nums`, como já é o padrão do arquivo.
- **Nada de dado inventado:** todo número acima é ilustrativo e sai de coluna citada. Card sem
  dado no período mostra estado vazio com a razão, nunca zero disfarçado de fato.

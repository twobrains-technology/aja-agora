# Dossiê — a conversa da moto de R$ 20 mil que virou R$ 201 mil (fa0533a0, 2026-08-13 23:28–23:35)

> **Autor:** Super Especialista de IA (revisor de arquitetura e avaliação de agente).
> **Escopo:** os 8 pontos de defeito da última conversa real de produção no WhatsApp
> (conv `fa0533a0-6179-46ec-8abe-fea74a559afc`, o próprio Kairo do outro lado) + o 9º ponto
> (por que nenhum incidente automático abriu), cada um com causa-raiz, camada, veredito de
> classificação e conserto.
> **Fontes:** banco de produção (túnel SSM 25432, leitura), CloudWatch `/ecs/tb/prod`
> (prefixo `aja-agora`, janela 02:27–02:37 UTC), Langfuse de produção (scores reais da
> janela via `/api/public/v3/scores`), código da `develop` em `246fe1b9`.
> **Rótulos:** **PROVADO** (log com conv id / arquivo:linha / estado no banco) ·
> **INFERÊNCIA** (mecanismo com as duas metades provadas) · **HIPÓTESE** (aberta, com o
> teste que a fecha).
> **Armadilha evitada:** `[analyzer]`/`[analyze]`/`[route]` não trazem conv id. Toda linha
> dessas citada aqui foi amarrada por timestamp (±5 s de um `[turn-trace]` com conv id) numa
> janela de madrugada em que esta era a única conversa ativa — e está rotulada INFERÊNCIA
> quando a amarração é só temporal.

---

## Veredito em uma frase

O modelo entendeu certo em todos os turnos — quem transformou "parcela de R$ 200" em
"crédito de R$ 200 mil" foi o **servidor**, numa cadeia de cinco decisões determinísticas
(analyzer sem campo para parcela → gate errado legitimando escala de milhar → derivação
proporcional parcela→crédito abaixo do piso → busca re-disparada para sempre numa faixa
impossível → guard anti-drift vetando a própria cura), e a conversa morreu com o agente
lendo um contexto que afirmava, em letras garrafais, que "as ofertas JÁ FORAM BUSCADAS e os
cards estão na tela" — enquanto quatro buscas seguidas tinham voltado vazias e ninguém
contou isso nem ao modelo, nem a um Monitor, nem ao Cortex.

O precedente do dossiê de 13/08 se repete com precisão: **não houve alucinação; houve
tradução honesta de estado quebrado.** No único momento em que uma camada LLM "inventou"
("Achei grupos com parcela de R$ 200"), ela estava parafraseando o retorno da própria tool
("Busca reposicionada") — e no turno final ela citou literalmente o que o system dizia.

---

## A linha do tempo real (com o que o transcript não mostra)

O transcript do banco tem 45 mensagens. A conversa real teve pelo menos **48** — três
mensagens entregues ao cliente não existem em `messages`, e duas delas mudam a leitura do
incidente inteiro:

| Hora (BRT) | O que aconteceu | Prova |
|---|---|---|
| 23:28:05–23:28:34 | "oi" → "uma casa" → "1.5m" → agente pede CPF. `creditMentionedAtDesire=1500000`, `desiredItem="uma casa"` gravados | turn-traces 23:28:07/22/34 |
| **~23:29:0x** | **Kairo envia o CPF** — mensagem capturada por `captureIdentifyText`, **nunca persistida** (`processor.ts:127-156` não tem `saveMessage`; contraste com o ramo de contrato, linha 179). "Perfeito, recebido! Já vou buscar…" enviado e também não persistido | INFERÊNCIA por eliminação: `identityEnc` só nasce de `storeIdentity`; no WhatsApp o único chamador é a captura textual de CPF válido; não existe conversa anterior deste wa_id para copiar (query no banco: 1 conversa) |
| 23:29:09–23:29:23 | Turno de servidor pós-CPF: busca imóvel R$ 1,5M, cards + simulação do BB **sem ninguém pedir** (modelo chamou `simulate_quota`+`present_simulation_result` por conta) | turn-trace 23:29:23, hero suprimido às 23:29:09 |
| 23:30:07–23:30:50 | Troca para moto. "20k" → busca certa (TRADIÇÃO 22.077/484) ✅. **Nada da casa é invalidado** | turn-traces; metadata final |
| 23:31:17 | "200" respondendo à pergunta de parcela → Haiku devolve `creditMax=200000` ("interpretado como creditMax conforme padrão de respostas curtas" — **o schema não tem campo para parcela**); guard FIX-378 reverte (gate ≠ credit). Modelo chama `ajustar_por_parcela(200)` → faixa derivada **R$ 9.120** (22.077×200/484), abaixo do piso de R$ 15 mil | `[analyzer]` 23:31:12 (INFERÊNCIA temporal); `[discovery-empty] creditMax=9120` 23:31:49 (PROVADO, conv id) |
| 23:31:51 | "sim quero ver" → busca com 9.120 → **BeviApiError** → vazio, streak=1 → `nextGate=credit` (piso). Modelo re-mostra o card antigo de 20 mil | logs 23:31:49-53 (PROVADO) |
| 23:32:35 | "mas eu falei 200" com o funil no gate `credit` → **escala implícita legitima 200→200.000** → busca real → cards de **R$ 201 mil** | `[analyzer]` 23:32:14 `credit=null-200000` (INFERÊNCIA temporal); cards no banco (PROVADO) |
| 23:33:12 | "200 reais a parcela nao 200 mill" → **Haiku entende perfeitamente** ("clarifica que 200 reais é PARCELA mensal, não crédito"; `credit=null-null`) → modelo chama `ajustar_por_parcela(200)` sobre a oferta ERRADA (201.393/6.270) → faixa derivada **R$ 6.424**, abaixo do piso de novo. Fala "Achei grupos com parcela de R$ 200" — nada foi buscado neste turno | `[analyzer]` 23:33:09; turn-trace 23:33:15 |
| 23:33:35–43 | Clique "Sem pressa, quero menor" (turno de servidor) → `prazoMeses=120`, `objetivo="investimento"` (derivação canônica `objetivoForPrazo`). Busca 6.424 → vazia, streak=1. `nextGate=credit` → **o canal entrega em texto a pergunta enlatada "Uns R$ 1.500.000 então, é isso? Pode ajustar se quiser."** (`creditMentionedAtDesire` da CASA) — **enviada ao cliente e não persistida** | `[gate-delivery] via=text` 23:33:43 (PROVADO, conv id) + `gate-questions.ts:144-156` |
| 23:34:39 | "ta maluco 1.5m numa moto?" — **resposta direta à pergunta enlatada que o modelo nunca viu** (ela não está no histórico). Busca 6.424 de novo → vazia, streak=2. Gate credit **afunda** (modelo perguntou outra coisa) | `[analyzer]` 23:34:29; `[gate-undelivered]` 23:34:41 (PROVADO) |
| 23:35:06 | "pqp" → **escape do gate preso promove R$ 1.500.000 (da casa!) para a moto** → guard pós-reveal reverte o `creditMax` para 6.424 e **deixa `creditMin=1.350.000` órfão**. Busca vazia, streak=3 | `[analyze] creditMax R$ 1500000 … mantido R$ 6424` 23:34:58 (INFERÊNCIA temporal) + `gateDefaultsAssumed:{credit:true}` no metadata (PROVADO) |
| 23:35:26 | "sim isso mesmo" → **Haiku extrai `creditMax=20000` CORRETO da recapitulação confirmada** → o mesmo guard veta ("fala sem número") e **mata a autocura**; `creditMin=18000` fica órfão (par final invertido 18000>6424). Busca 6.424 → vazia, streak=4. O system diz ao modelo "as ofertas JÁ FORAM BUSCADAS… a que melhor atende: BB, carta de R$ 201.393" → modelo: "essas são as opções que encontrei" | `[analyzer]` 23:35:22 `credit=null-20000` + `[analyze] … mantido R$ 6424` 23:35:22 (INFERÊNCIA temporal); `converse.ts:504-528, 601-609` (PROVADO) |

**Quatro chamadas reais à Bevi em quatro turnos seguidos, todas com a mesma faixa impossível
(6.424), todas com o mesmo erro** — porque busca vazia não atualiza `discoveredCreditTarget`
e a divergência com o alvo (200.000) re-dispara a descoberta a cada turno
(`route.ts:37-40` + `discovery.ts:154-176`). PROVADO.

---

## Ponto 1 · "200" virou R$ 200.000 de crédito

**Causa-raiz (três defeitos empilhados, todos servidor):**

1. **O analyzer não tem onde pôr uma parcela.** `turnAnalysisSchema`
   (`turn-analyzer.ts:29-128`) tem `creditMin/creditMax/prazoMeses/hasLance/monthlySavings/
   fgtsValue` — **nenhum campo para "parcela mensal que cabe no bolso"**. As instruções até
   citam "monthlyBudget" para dizer o que NÃO confundir (`turn-analyzer.ts:161`), mas o campo
   não existe. Resultado literal no log: *"respondeu '200' em contexto de pergunta sobre
   parcela mensal — interpretado como creditMax conforme padrão de respostas curtas"*
   ([analyzer] 23:31:12). O Haiku foi forçado pelo schema. E `parcelaAlvo` do estado só tem
   um escritor: a tool `ajustar_por_parcela` — o dado de qualificação mais importante do
   perfil de menor renda não é capturável por conversa. **PROVADO**.
2. **A escala implícita ancora no gate do FUNIL, não na pergunta que o cliente respondia.**
   `langgraph/analyze.ts:93` liga `escalaImplicita` quando `state.gate === "credit"`;
   `valor-declarado.ts:58` então aceita `200×1000`. O funil estava em `credit` porque a
   faixa DERIVADA (9.120) quebrou o piso — mas a conversa estava em "qual parcela cabe?". O
   cliente respondeu à pergunta do modelo; o guard validou contra a pergunta do funil.
   Trilhos paralelos. **PROVADO** (cadeia: `creditoBuscavel(9120)=false` → `nextGate=credit`
   em `qualify-state.ts:365`; aceitação de 200.000 no turno seguinte exige a escala).
3. **A derivação proporcional parcela→crédito, sem piso, no lugar da busca por parcela que
   já existe.** `converse.ts:948-956` computa `alvo = crédito×(parcela/parcelaAtual)` sem
   checar `creditoBuscavel`; produziu 9.120 e depois 6.424 — ambos garantidamente vazios. E
   `discovery.ts:143-145` só busca por `parcelaAlvo` (INSTALLMENT_VALUE, caminho real da
   Bevi — `bevi-self-contract-adapter.ts:173-177`) **quando `creditMax` é undefined** — que
   nunca acontece, porque a derivação acabou de defini-lo. O FIX-382 existe e é inalcançável
   por construção. **PROVADO**.

**O que NÃO é a causa:** o Haiku (entendeu "parcela, não crédito" às 23:33:09); o modelo de
conversa (chamou a tool certa com o argumento certo); a Bevi (respondeu corretamente que a
faixa não tem oferta).

**Camadas:** 1 (estado/fluxo) e 2 (contexto). **Classificação:** código determinístico — o
alvo de busca é dado que vai para a Bevi, invariante puro.

**Conserto (raiz):** o alvo de busca vira **um tipo só**, discriminado:
`alvoDeBusca: { tipo:"valor"; creditMax; creditMin } | { tipo:"parcela"; parcelaAlvo }` no
`FunnelState`. `readyForDiscovery`, o dispatch do `discovery` e o adapter Bevi leem o MESMO
discriminante (hoje o predicado aceita por parcela e a chamada sai por valor —
dessincronizados por construção). `ajustar_por_parcela` passa a **escrever o alvo por
parcela** (a Bevi busca por INSTALLMENT_VALUE) e a derivação proporcional vira só narração
("com R$ 200 a carta fica em torno de R$ X"), nunca estado. O analyzer ganha o campo
`parcelaMensal` (com exemplo "só consigo 200 por mês" → parcelaMensal=200, creditMax=null).

## Ponto 2 · `qualifyAnswers` incoerente e sem invalidação na troca de bem

**Causa-raiz (dois defeitos):**

1. **Troca de categoria não invalida nada.** A transition em `langgraph/analyze.ts:202-226`
   escreve só `currentCategory`/`currentPersona`; `routing.ts` não toca `qualifyAnswers`
   (zero referências). `desiredItem="uma casa"` e `creditMentionedAtDesire=1500000`
   sobreviveram à troca casa→moto — e **não são lixo inerte**: o 1,5M voltou DUAS vezes como
   ação (a pergunta enlatada "Uns R$ 1.500.000 então, é isso?" às 23:33:43, via
   `gate-questions.ts:148-156`, e a promoção do escape de gate preso às 23:35:06, via
   `qualify-state.ts:112-119`). **PROVADO**.
2. **Reverts parciais deixam o par min/max órfão.** O guard pós-reveal
   (`langgraph/analyze.ts:131-167`) reverte **só `creditMax`**; `analyzeAndMerge` já tinha
   escrito `creditMin = round(creditMax×0.9)` (`orchestrator/analyze.ts:241-245`). Na
   conversa, `creditMin` valeu 18000 → 8208 → 180000 → 5782 → 1.350.000 → 18000, e o par
   final ficou **18000 > 6424**. Não existe invariante `creditMin ≤ creditMax` em nenhum
   write-site. **PROVADO** (logs 23:34:58/23:35:22 + metadata final).

**O que NÃO é defeito:** `objetivo:"investimento"` — deriva do clique "Sem pressa, quero
menor parcela" (`objetivoForPrazo(120)`, chamado em `orchestrator/analyze.ts:274` e no
handler do clique). É decisão de design com rótulo interno infeliz, não extração fantasma.

**Camada:** 1. **Classificação:** código — é exatamente o caso "o dado vai para a Bevi".

**Conserto:** um **reducer único de `qualifyAnswers`** com os invariantes dentro:
(a) troca de categoria invalida `desiredItem`, `creditMentionedAtDesire`, a faixa e
`creditClampedFrom` (mantém identidade, prazo e lance — são da pessoa, não do bem);
(b) toda escrita de `creditMax` recalcula/valida o par (min ≤ max ou min é dropado);
(c) todo revert reverte o PAR. Hoje há **cinco escritores** de faixa (analyzeAndMerge,
guard-1, guard-2, escape de gate preso, novaFaixa do converse) espalhados em três arquivos —
a classe do defeito é a dispersão, não cada escrita.

## Ponto 3 · CPF pedido e a busca acontecendo "sem resposta"

**Veredito: a invariante NÃO foi furada.** O cliente **enviou o CPF** (~23:29), a captura
determinística validou o DV e gravou cifrado, e a busca rodou depois — na ordem correta.
O que existe é um defeito de **camada 4 (entrega ≠ persistido)**: o ramo de identidade do
processor **não persiste** nem a mensagem do cliente nem as respostas enlatadas
(`processor.ts:127-156`, sem `saveMessage`; o ramo de contrato logo abaixo, linha 179,
persiste — a assimetria é a prova de que não é política deliberada de PII, é lacuna).

Consequências reais: (a) o transcript mente por omissão — foi o que fez este ponto parecer
furo de invariante; (b) a mesa/atendente lê uma conversa sem o consentimento registrado;
(c) **o modelo também não vê** — o histórico dele vem do checkpointer, e as mensagens
enlatadas do adapter nunca entram (nenhum write em `state.messages` fora do converse).

**Classificação:** código. **Conserto:** persistir o turno de CPF com placeholder mascarado
(`"[CPF recebido — •••.•••.•••-••]"`, role user) + persistir as confirmações
(`IDENTIFY_CONFIRMED_REPLY` etc.) como assistant — e o mesmo para TODA mensagem enlatada
enviada pelo adapter (ver ponto 5, que é a mesma classe com dano maior).

## Ponto 4 · Fala sem artefato ("achei grupos" / "essas são as opções")

Dois mecanismos diferentes, nenhum é "o modelo inventou do nada":

1. **23:33:12 — efeito de tool atrasado em um turno.** `ajustar_por_parcela` só reposiciona
   a faixa; a busca nova é do turno SEGUINTE (discovery roda antes do converse —
   `graph.ts:115-117`). O aviso da tool ("Busca reposicionada… as cartas reais vêm no
   próximo passo — não antecipe valores", `ai-sdk.ts:1757-1758`) foi parafraseado pelo
   modelo como "Achei grupos com parcela de R$ 200". Camada 3 com raiz estrutural na
   camada 1. **PROVADO** (turn-trace 23:33:15: tools=[ajustar_por_parcela], artifacts=[]).
2. **23:35:26 — o contexto AFIRMAVA a mentira.** `blocoOfertas` (`converse.ts:504-528`)
   injetou *"As ofertas REAIS JÁ FORAM BUSCADAS e os cards estão na tela… A que melhor
   atende: BANCO DO BRASIL — carta de R$ 201.393, parcela de R$ 6.270"* — a oferta STALE de
   três faixas atrás. O `blocoBuscaVazia` (`converse.ts:601-609`), que existe exatamente
   para este caso e diz "É PROIBIDO dizer que encontrou opções", estava **desarmado**: a
   condição é `buscaJaTentada && !oferta`, e `recommendedOffer` nunca é invalidada quando a
   faixa muda ou a busca volta vazia. A rede existia e foi desligada pela âncora podre.
   Camada 2. **PROVADO**.

**Classificação:** o conserto é **código/estado** (invalidação da âncora), não mordaça na
fala — dropar a frase deixaria o cliente sem explicação com o mesmo estado podre por baixo
(o anti-padrão que o CLAUDE.md descreve). O sinal que pega a classe está no ponto 9.

**Conserto:** (a) busca vazia e troca de faixa marcam/limpam `recommendedOffer` (mesma
lógica do FIX-415 para `contractOffer` — a assimetria entre os dois é o buraco);
(b) `blocoBuscaVazia` arma por fato de turno (`discoveryEmptyStreak > 0` OU
`discoveredCreditTarget ≠ alvo corrente`), não por ausência de âncora; (c) o retorno de
`ajustar_por_parcela` passa a dizer explicitamente "NADA foi buscado ainda".

## Ponto 5 · O "turno morto" (23:33:40) — que não era morto

**O cliente recebeu DUAS mensagens nesse turno**, e a segunda é a chave do colapso:
`[gate-delivery] conv=fa0533a0 gate=credit via=text` às 23:33:43 (PROVADO) significa que o
adapter enviou a pergunta enlatada do gate credit — que, com `creditMentionedAtDesire=
1500000`, é *"Uns R$ 1.500.000 então, é isso? Pode ajustar se quiser."*
(`gate-questions.ts:148-156`). Ela não está em `messages` (o `sendText` do ramo de gate,
`adapter.ts:593-604`, não persiste) e **não está no histórico do modelo**. O "ta maluco 1.5m
numa moto?" do turno seguinte é resposta direta a ela — e o modelo, cego à pergunta, reagiu
como se a confusão fosse dele ("Ahahah, verdade! Confundi aqui").

Sobre o contador: `discoveryEmptyStreak` **tem** um leitor determinístico (`nextGate` volta
a `credit` pelo piso, `qualify-state.ts:365`; a linha 371 do streak≥2 é código morto aqui
porque `searchDispatched=true`), mas **nenhum leitor no contexto do modelo** e **nenhum
freio na re-busca**: o `route` re-despachou a MESMA faixa vazia 4 turnos seguidos
(`route.ts:37-40` — divergência `creditMax ≠ discoveredCreditTarget` nunca cicatriza porque
o ramo vazio não atualiza o snapshot).

**Camadas:** 4 (entregue ≠ persistido ≠ visto pelo modelo) + 1 (re-busca sem freio).
**Classificação:** código.

**Conserto:** (a) toda mensagem enlatada enviada pelo canal **entra em `messages` e no
histórico do modelo** (é a fala do sistema na conversa — o modelo precisa relê-la como
qualquer outra); (b) busca vazia atualiza `discoveredCreditTarget` para a faixa tentada
(re-busca só quando o alvo MUDAR de novo); (c) a pergunta enlatada do credit não usa
`creditMentionedAtDesire` de categoria diferente da atual (cai no conserto do ponto 2a).

## Ponto 6 · Fragmentação em 2–4 mensagens por turno

**Veredito: o formato é design intencional, não defeito de canal** — beats separados por
`text-boundary`, âncora "em mensagem separada e curta" (`converse.ts:1320-1322`), pausas de
digitação no adapter. É a cadência de vendedor que o produto quer.

O que incomodou na conversa é **conteúdo, não forma**: o balão de anúncio saiu quase
idêntico 3× ("Encontrei ótimas opções na sua faixa! Repara na parcela e no prazo de cada
uma.") porque a directive do reveal traz essa frase como EXEMPLO literal
(`directives.ts:376,380`) e o modelo a ecoa — exemplo em directive vira template. E o beat
de âncora degenera no genérico "O que você achou dessa opção?".

**Classificação:** qualidade de fala → **Langfuse** (é exatamente o caso 3 do teste de
decisão do CLAUDE.md). **Conserto:** [prompt] rotacionar/remover o exemplo literal da
directive (dizer a INTENÇÃO, não a frase); [eval] medir variância dos balões de reveal com
`pnpm sonda:variancia` antes/depois + juiz de repetição sobre volume. Nada de regex, nada
de guard.

## Ponto 7 · Contato duplicado

**Causa-raiz:** duas normalizações canônicas concorrentes para o MESMO telefone.
`normalizePhoneBR` (`leads/phone.ts:8-16`) aceita 10 dígitos sem reinserir o 9º dígito
(waId `556292496793` → `6292496793`); `waIdToCelular` (`identify-capture.ts:56-66`)
reinsere (→ `62992496793`). `resolveContact` casa por igualdade exata → dois contatos:
`eda5569c` (10 díg., linkado ao LEAD, **sem** CPF) e `ad4d6fc7` (11 díg., linkado à
conversa, **com** identidade). A mesa enxerga o lead ligado ao contato errado. **PROVADO**
(banco + código). Varredura: **1 par** na base hoje (o do próprio Kairo) — contido, mas
estrutural: todo lead de WhatsApp nasce com `phone` sem o 9.

**Classificação:** código (invariante de identidade). **Conserto:** forma canônica única
para móvel (waId sempre é móvel → 11 dígitos via `waIdToCelular` na ORIGEM do lead), e
`resolveContact` casa também a variante com/sem 9 durante a transição; migração de merge
para o par existente.

## Ponto 8 · Desculpa em loop com o estado intacto — o livelock de guards

O modelo reconheceu o erro 3× em texto e **não tem nenhuma ação estruturada de correção**:
a única tool que mexe na faixa é `ajustar_por_parcela`, que re-deriva do
`recommendedOffer` errado. "Deixa eu começar de novo" não tem tool correspondente.

E quando o caminho determinístico tentou se curar sozinho, **um guard correto matou a cura
de outro caminho correto**: às 23:35:22 o Haiku extraiu `creditMax=20000` da recapitulação
que o cliente confirmou ("Você quer uma moto de R$ 20 mil… — sim isso mesmo") e o guard
pós-reveal vetou porque "sim isso mesmo" não contém número (`langgraph/analyze.ts:129-144`).
O guard não tem exceção para **valor ancorado na última fala do próprio agente e
confirmado pelo cliente** — a mesma classe do ciclo escape×guard que o comentário de
`analyze.ts:95-103` descreve como já resolvida para `creditMentionedAtDesire`. É o padrão
**livelock de guards** do catálogo: cinco escritores, dois vetos, nenhum ciente da
composição. **PROVADO** ([analyzer] + [analyze] 23:35:22, INFERÊNCIA temporal na amarração;
mecanismo fechado no código).

**Classificação:** código (composição de guards) + uma tool nova (camada 3 ganhando um
caminho estruturado). **Conserto:** (a) `valorAncoradoNoTexto` ganha uma fonte extra de
ancoragem: número presente na última fala do assistente quando `detectYesNoText(texto)
=== true` — confirmação explícita ancora; (b) tool `corrigir_valor_do_bem(valor)` validada
contra o piso — o caminho estruturado para "confundi, era X"; (c) todo veto de guard emite
o score `valor_revertido` **com a origem** (já emite o booleano — faltam as dimensões).

## Ponto 9 · Por que nenhum incidente abriu — e o que teria pego

### 9.1 O que os sinais REAIS da sessão dizem (Langfuse de produção, medido)

A afirmação de partida ("nenhum dos 4 Monitors pegaria") está **meio certa e meio errada**,
e a metade errada importa mais:

| Claim | Medição real (v3/scores, janela 02:28–02:36 UTC) | Veredito |
|---|---|---|
| `tool_falhou` = 0 | **Confirmado — e é DEFEITO do sinal**: 4 `BeviApiError` do nó discovery não pontuam (o score só cobre tool chamada pelo MODELO no converse, `tool-falha.ts`; o erro do nó morre num JSON de log) | CONFIRMADO |
| `turno_mudo` / `card_sem_fala` = 0 | Confirmado (o agente escreveu em todos os turnos) | CONFIRMADO |
| `gate_entregue` = 1 | **REFUTADO: `gate_entregue=0` em TRÊS turnos** (02:34:41, 02:35:08, 02:35:29) com `gate_afundado=credit`; e mais `valor_revertido=True` 2× (02:34:58, 02:35:22), `judge_resolved=0` nos dois últimos turnos, `judge_avancou=0` no turno "morto" | REFUTADO |

Ou seja: **o sinal existiu — faltou o leitor.** Nenhum Monitor foi criado na UI (nem os 3
pendentes da skill, e `gate_entregue` não está entre eles), a ponte
`/api/observability/alerta-langfuse` responde 503 (`LANGFUSE_WEBHOOK_SECRET` ausente,
`route.ts:46-53`) e o Cortex é no-op (`cortex.ts:106`, envs ausentes). Sinal que ninguém lê
não é sinal.

E o registro para a posteridade: **o juiz aprovou o pior turno da conversa** —
`judge_avancou=1` e `judge_hallucination=0` às 02:35:32-33, no turno que apresentou opções
inexistentes após 4 buscas vazias. Consistente com a literatura (falso sucesso passa por
juiz de LLM; o juiz ancora em linguagem confiante — arXiv 2606.09863). Juiz nunca é gate.

### 9.2 Os sinais novos (desenho concreto, implementável)

Ordem da doutrina: determinístico → sessão → reconciliação → juiz.

| Sinal | Tipo | Onde emite | Predicado exato | Monitor (UI) | Teria disparado hoje |
|---|---|---|---|---|---|
| `busca_abaixo_do_piso` | BOOLEAN | `discovery.ts`, antes da chamada | `alvo por valor && !creditoBuscavel(creditMax, creditoMinimoInformado)` — por design é sempre 0 (o route não deveria despachar) | **ALERT média > 0**, janela 1h, NO_DATA ok | **4×** |
| `busca_vazia` | BOOLEAN + comment `streak/faixa/categoria` | `discovery.ts`, ramo vazio (junto do streak) | resultado utilizável = 0 | WARNING média > 0,15 / 1h | 4× |
| `busca_esgotada` | BOOLEAN | idem | `streak ≥ 2` (o mesmo limiar que `nextGate` já usa) | **ALERT média > 0** / 1h | **3×** |
| `tool_falhou` (extensão) | já existe | `discovery.ts` catch → mesma família de `registrarFalhasDeTool`, `tipo:"erro"`, tool `recommend_groups` | erro na fronteira Bevi do NÓ (hoje só cobre tools do modelo) | o Monitor já desenhado na skill | 4× |
| `estado_incoerente` | BOOLEAN + comment | `persist.ts`, após o merge, antes de gravar | `creditMin > creditMax` ∥ (alvo por parcela && busca despachada por valor) | **ALERT média > 0** / 1h | 1× (18000>6424) |
| `oferta_contradiz_parcela` | BOOLEAN + comment `parcela/oferta/fator` | emissão de card de oferta (`discovery.ts` e `converse.ts`, junto do `artifactAllowed`) | `alvo por parcela && payload.monthlyPayment > 2×parcelaAlvo` (aritmética de servidor: R$ 200/mês não paga R$ 201 mil em 44 meses) | WARNING média > 0 / 1h; ALERT fator > 3× | **1×** (23:32:35, fator 31×) |
| `valor_revertido` (dimensões) | já existe | `funil-scores` | acrescentar categórico `valor_revertido_origem` (`escape`/`analyzer`/`pos_reveal`) e, no 2º revert da MESMA conversa, score de **sessão** `livelock_de_valor=1` via `sessionId` | WARNING média > 0 / 1h; ALERT no de sessão | 2× + sessão |
| `oferta_ancorada_stale` | BOOLEAN | `converse.ts`, ao montar `blocoOfertas` | `recommendedOffer` presente && `discoveredCreditTarget ≠ alvo corrente` (o system vai afirmar oferta de outra faixa) | ALERT média > 0 / 1d | **1×** (o turno final) |
| `judge_promessa_entregue` | juiz (observation `turn`) | evaluator v4 | rubrica: “a fala afirma que resultados/opções estão sendo mostrados ou foram encontrados AGORA?”; o evaluator recebe em metadata os FATOS (`artifactCount`, `buscaVaziaNesteTurno`) e só pontua violação quando fala-diz-sim × fato-diz-não | WARNING média > 0 / 1d | 2× (23:33:12, 23:35:26) |

O par `busca_abaixo_do_piso` + `estado_incoerente` cobre a classe "busca com input que
contradiz o pedido" **por fato de servidor** (sem ler fala); `judge_promessa_entregue`
cobre "prometeu artefato e não entregou" com o juiz decidindo só a parte genuinamente
linguística (o que é promessa), ancorado em booleano determinístico (havia artefato?) —
nunca regex sobre fala.

**Nota de latência:** o SDK `@langfuse/*` 4.6.1 deprecado atrasa ingestão em até 10 min —
o alerta chega, mas atrasado. Upgrade para ≥ 5.4.0 é P2 conhecido.

### 9.3 Pendências que só o Kairo pode executar (prod / UI) — PENDENTE-KAIRO

1. **Secret `tb/prod/aja-agora/env`**: criar `LANGFUSE_WEBHOOK_SECRET`,
   `ALERTA_OBSERVABILIDADE_TO`, `CORTEX_MCP_URL`, `CORTEX_MCP_TOKEN`, `CORTEX_PROJETO`
   **e mapeá-las na taskdef** (secret sem entrada na taskdef não chega ao container).
2. **UI do Langfuse (Monitors não têm API)**: criar os Monitors da tabela acima + os 3 já
   pendentes da skill (`conducao_entregue`, `tool_recusou`, `judge_avancou`) + um sobre
   `gate_entregue` (WARNING < 0,92 / ALERT < 0,85, 1h) — todos com **NO_DATA notificando**
   — e a Automation webhook apontando para `/api/observability/alerta-langfuse`.
3. Calibrar limiares com 1 semana de baseline antes de travar (volume baixo: uma conversa
   move a média).

---

## O desenho que permitiu tudo isso (as leis violadas)

1. **Duas fontes de verdade para o alvo de busca** (`creditMax` derivado × `parcelaAlvo`) —
   ponto 1. O predicado aceita por um critério e a chamada busca por outro.
2. **Estado sem invariante de coerência e sem invalidação em transição** (Lei 4 aplicada ao
   lugar certo: o dado que vai à Bevi) — ponto 2.
3. **Entregue ≠ persistido ≠ visto pelo modelo** (camada 4) — pontos 3 e 5. O modelo
   "conversa" numa janela que não contém tudo o que o cliente leu.
4. **Guard novo sem verificar composição** (Lei 2 + catálogo "livelock de guards") — ponto
   8. Cinco escritores e dois vetos de `creditMax`, nenhum ciente dos outros.
5. **Falha de nó silenciosa vira contexto NENHUM** (Lei 5) — a busca vazia não vira nem
   fato para o modelo, nem score, nem freio de re-execução.
6. **Sinal sem leitor** — ponto 9. `gate_entregue`, `valor_revertido` e os juízes
   dispararam; nenhum Monitor, webhook 503, Cortex no-op.

## Plano priorizado

Cada P0 cabe numa sessão. TDD strict (regressão primeiro) em todos os de [código].

**P0 — para a sangria da classe que matou esta venda**
1. **[código] Alvo de busca único (discriminated union) + busca por parcela de verdade** —
   `langgraph/state.ts`, `nodes/route.ts` (`readyForDiscovery`), `nodes/discovery.ts`,
   `converse.ts:938-957` (derivação vira narração), `tools/ai-sdk.ts:1720-1761`. Mata os
   pontos 1 e metade do 5.
2. **[código] Busca vazia é um FATO com consequências** — `nodes/discovery.ts:154-176`:
   atualiza `discoveredCreditTarget` da tentativa (freia a re-busca), invalida/flaga
   `recommendedOffer`; **[contexto]** `converse.ts:601-609` arma `blocoBuscaVazia` pelo
   fato do turno, não por `!oferta`. Mata o ponto 4b e o loop de 4 chamadas Bevi.
3. **[código] Reducer de `qualifyAnswers` com invariantes** (invalidação na troca de
   categoria; par min≤max; revert em par) — novo módulo consumido por
   `orchestrator/analyze.ts`, `langgraph/analyze.ts`, `qualify-state.ts:110-119`,
   `converse.ts:1435-1440`. Mata o ponto 2 e a pergunta enlatada de R$ 1,5M.
4. **[eval] Os quatro sinais determinísticos novos** (`busca_abaixo_do_piso`,
   `busca_esgotada`, `estado_incoerente`, extensão do `tool_falhou`) — emissão no código
   (§9.2); Monitors ficam com o Kairo (§9.3).

**P1 — a janela do modelo e a autocura**
5. **[código] Mensagem enlatada do canal entra em `messages` e no histórico do modelo**
   (CPF mascarado incluso) — `whatsapp/processor.ts:127-156`, `whatsapp/adapter.ts`
   (ramo gate, 593-604) + hidratação do histórico. Mata os pontos 3 e 5 (camada 4).
6. **[código] Confirmação explícita ancora** — `valor-declarado.ts` ganha a última fala do
   assistente como fonte quando `detectYesNoText===true`; **[código]** tool
   `corrigir_valor_do_bem` validada contra o piso. Mata o ponto 8.
7. **[código] Telefone canônico único + merge do par duplicado** — `leads/phone.ts`,
   origem do lead WhatsApp, migração one-shot. Mata o ponto 7.
8. **[eval] `judge_promessa_entregue` + `oferta_ancorada_stale`** (§9.2).

**P2 — qualidade e dívidas**
9. **[prompt] Directive do reveal sem frase-exemplo literal** (`directives.ts:376,380`) +
   **[eval]** `pnpm sonda:variancia` antes/depois — ponto 6.
10. **[código] Upgrade SDK Langfuse ≥ 5.4.0** (latência de ingestão).
11. **[contexto] Revisitar a escala implícita**: ancorar na pergunta REALMENTE feita
    (última fala do assistente contém pergunta de valor?) em vez de `state.gate` — depois
    do P0.1, o caso que a motivou muda de natureza.

## O que medir depois (prova de conserto)

- `busca_abaixo_do_piso` e `estado_incoerente`: **0 ocorrências** em regime (qualquer >0 é
  regressão — Monitors em ALERT>0).
- `busca_esgotada`: taxa < 2%/dia, e **nunca** 2+ na mesma conversa com o mesmo alvo (o
  freio do P0.2 torna isso impossível por construção — teste de integração prova).
- Cenário de regressão no harness (conversa desta sessão como golden): "moto 20k → parcela
  200" termina com busca por INSTALLMENT_VALUE e cards de parcela ≤ R$ 300 — hoje termina
  com 4 erros Bevi.
- `gate_entregue` com Monitor ativo: WARNING < 0,92/1h chegando por e-mail + Cortex (testar
  a ponte com um webhook sintético após as envs).
- Reconciliação de contatos: query D da varredura (par com/sem 9) devolve **0 linhas**.

## Sondas e varredura (reproduzível)

- **CloudWatch** (a espinha do diagnóstico): `filter-log-events` em `/ecs/tb/prod`,
  prefixo `aja-agora`, 02:27–02:37 UTC, pattern `"fa0533a0"` → 40 eventos (turn-traces,
  gate-delivery/undelivered, 4× BeviApiError com conv id, discovery-empty streaks 1-4);
  segunda passada 02:33:30–02:36:00 sem pattern → `[analyzer]`/`[analyze]`/`[route]` dos
  turnos finais (amarração temporal).
- **Banco (túnel 25432)**: metadata final; `bevi_proposals=0`; contatos duplicados;
  1 conversa única do wa_id (mata a hipótese "identidade herdada de conversa antiga").
- **Langfuse prod** (`/api/public/v3/scores`, janela 02:28–02:36): 100 scores — os valores
  citados em §9.1.
- **Varredura (estado atual da base)**: `discoveryEmptyStreak≥2` → **1 conversa** (esta);
  `creditMin>creditMax` → **1**; lead×conversa com contatos divergentes → **1**; par de
  telefone com/sem 9 → **1**. As classes são estruturais mas o dano corrente está contido
  nesta conversa — a varredura é por estado, não por histórico: casos que se curaram não
  aparecem (limitação registrada).


---

## Adendo — sonda local da sessão principal (mesma data) e as três perguntas que ela abriu

A sessão principal reproduziu a conversa na stack local (mesmo `claude-haiku-4-5` de
produção) e mediu o analyzer devolvendo `credit=null-200000` para o "200". Confirma o
ponto 1 — com uma correção de nuance que muda onde o conserto pertence:

**O analyzer NÃO decide às cegas.** Ele já recebe a pergunta pendente: `analyzeAndMerge`
monta o `turnAnchor` com `activeGate` + a última fala do assistente
(`orchestrator/analyze.ts:87-91` → `turn-analyzer.ts:263-289`), e o reasoning de produção
prova que ele a leu — *"respondeu '200' em contexto de pergunta sobre **parcela mensal** —
interpretado como creditMax conforme padrão de respostas curtas"* ([analyzer] 23:31:12).
O modelo entendeu a pergunta e ERROU O ARQUIVO porque **o schema não tem gaveta para
parcela**: forçado a escolher entre `creditMax`/`prazoMeses`/`lanceValue`, escolheu a menos
errada e aplicou a convenção de milhar que os exemplos do próprio prompt ensinam
("no mínimo 100" → 100000). É a memória da casa ao pé da letra: o modelo entende certo, o
sistema (aqui, o SCHEMA) re-deriva e erra.

### Resposta à pergunta 1 — onde o conserto pertence (UMA recomendação)

**Schema de saída com a gaveta que falta** — campo `parcelaMensal` nullable no
`turnAnalysisSchema`, com descrição e exemplos espelhando os de `creditMax` ("só consigo
200 por mês" → `parcelaMensal: 200, creditMax: null`) — **acoplado ao reducer de alvo
exclusivo do P0.1** (parcela e crédito são alvos mutuamente exclusivos; quem escreve um
limpa o outro, com a proveniência registrada).

Por que esta e não as outras duas:

- **"Passar a pergunta pendente no contexto"** já existe e já foi lida — o defeito
  sobreviveu a ela. Mais contexto não cria a gaveta que falta; só melhora o palpite sobre
  qual gaveta errada usar.
- **"Validação determinística pós-analyzer"** já existe em dobro (FIX-378 + FIX-431) e este
  incidente prova que a família de vetos **compõe em livelock** (ponto 8: o guard matou a
  autocura às 23:35:22). Um quarto veto é mais blocklist (Lei 2) num sistema que já se
  auto-anula. Os guards ficam como backstop — revertendo o PAR, nunca meio par — mas não
  são o conserto.
- E não engessa nada: campo novo de NLU é **capacidade** (o modelo passa a poder dizer o
  que entendeu), não restrição de fala. A escala implícita do gate `credit` deixa de ser
  necessária para este caso por construção — "200" respondendo pergunta de parcela vira
  `parcelaMensal=200`, e milhar nunca é aplicado a parcela.

Isto entra no **P0.1** do plano (é a metade "analyzer" do alvo discriminado; a metade
"discovery/Bevi" já estava lá).

### Resposta à pergunta 2 — o predicado do sinal

Dos dois candidatos, **a aritmética parcela×oferta é o certo** e entrou na tabela do §9.2
como `oferta_contradiz_parcela`: `parcelaAlvo > 0 && monthlyPayment_do_card > 2×parcelaAlvo`
(WARNING; ALERT acima de 3×). É reconciliação por fato de servidor (estado declarado ×
payload emitido), custa zero, e pega exatamente o turno que TODOS os outros sinais
perderam — 23:32:35, busca "bem-sucedida" com input corrompido (fator 31×), acima do piso
(logo invisível a `busca_abaixo_do_piso`) e com min<max (invisível a `estado_incoerente`).
O limiar 2× existe porque mostrar opção um pouco acima do orçamento explicando o trade-off
é venda legítima; 31× nunca é.

O salto de ~1000× entre turnos **não** vira sinal próprio: é heurística com falso positivo
em correção legítima de valor e cobre um subconjunto do que `valor_revertido` (que já
existe e disparou 2×) mais a aritmética acima já cobrem. No máximo, vira o `comment` do
`valor_revertido` (valor anterior → novo) para diagnóstico.

### Resposta à pergunta 3 — o timeout do analyzer (confirmado no log local)

**O fallback `NEUTRAL_FALLBACK` não apaga ancoragem** — todo merge do `analyzeAndMerge` é
null-guarded (`creditMax` exige `sourceCreditMax !== null`, `prazoMeses`/`hasLance`/
`experiencePrev` idem — `orchestrator/analyze.ts:107,227-231,268-273,300-307`), e o
fallback é todo-nulls. PROVADO. Mas ele tem DOIS efeitos colaterais reais:

1. **Conta como "turno sem progresso" no `gateStuckTurns`** (`orchestrator/analyze.ts:
   379-390`): o gate não muda porque a extração não rodou, não porque o cliente enrolou.
   Três timeouts seguidos no gate `credit` com `creditMentionedAtDesire` presente disparam
   o escape que promove valor possivelmente stale — o mecanismo exato que promoveu o
   R$ 1,5M da casa às 23:35:06. O conserto é uma linha: turno com `analysis.reasoning ===
   "fallback"` não incrementa o contador (o analyzer é quem travou, não o cliente).
   **[código, P1]**
2. **`intent=neutral` rebaixado** suprime gates pós-reveal em `decideShowGate` e enfraquece
   os aceites estruturados que dependem do rótulo. Inevitável no fallback; o que falta é
   ENXERGAR a frequência: score determinístico `analyzer_timeout=1` no catch do
   `analyzeTurn` (`turn-analyzer.ts:331-336`), Monitor WARNING média > 0,05/1d. **[eval, P1]**

## O que este dossiê NÃO fechou

- **HIPÓTESE:** a atribuição exata dos logs `[analyzer]`/`[analyze]` aos turnos (amarração
  temporal numa janela de conversa única — risco baixo, não zero). Fecha com conv id nesses
  logs (uma linha em cada, vale fazer junto do P0).
- **HIPÓTESE:** o cliente ter recebido a pergunta de R$ 1,5M às 23:33:43 depende de
  `sendText` ter retornado sucesso (o log `[gate-delivery]` só sai após envio OK —
  `adapter.ts:598-604` — então a confiança é alta; a prova definitiva seria o print do
  celular do Kairo).
- O turno de 23:31:19 com `gate=experience via=interactive` (um card de experiência no meio
  da conversa de parcela — o transcript não o mostra, mesma classe do ponto 3/5 de
  persistência). Não altera as causas acima; fica anotado.

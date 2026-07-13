# Critérios de aceite — experiência de conversa do agente Aja Agora (web)

> Rubrica verificável pro coletor Haiku validar no browser a fidelidade da conversa ao
> comportamento do handoff (`scratchpad/handoff/handoff/`) + mockup (`aja-dois-cenarios.html`)
> + regras novas do Kairo (2026-07-11, FIX-274). Cada critério tem: esperado, estado do
> código (`arquivo:linha`, caminhos relativos a `/Users/kairo/code/aja-agora/`), como
> verificar no browser e severidade.
>
> **Ordem SOBERANA dos gates (FIX-274, confirmada em `src/lib/agent/qualify-state.ts:51-181`):**
> `name → desire[pergunta 1] → desire[pergunta 2: motivo, turno próprio] → identify →
> credit → search/reveal → experience → timeframe → lance → [lance-value se tem como dar]
> → lance-embutido → contemplation_dial → scarcity → decision → proposal (contract →
> real_offer) → whatsapp-handoff`.
> ⚠️ Nota: o handoff/mockup pedia valor ANTES do CPF e proposta ANTES da decisão — a ordem
> acima (a do código E a declarada pelo Kairo hoje) VENCE. Ver seção de divergências.
>
> **Regras duras de 1ª classe (Kairo, 2026-07-11):** (a) NUNCA 2 perguntas na mesma
> mensagem/balão; (b) explicação/dúvidas de consórcio SÓ no gate `experience`, pós-busca;
> (c) motivo ("por que agora") em turno próprio, espelhado UMA vez.
>
> **Coletor ≠ juiz:** todo FALHA abaixo é hipótese até prova (turn-trace/logs/DB). Ação que
> nem chegou ao backend = pilotagem, não bug.

---

## Passo 0 — Abertura (web)

- **CA-1 — Boas-vindas + 3 categorias** | Passo/gate: abertura
  - Esperado (handoff/mockup): abertura acolhedora com a promessa ("te ajuda a conquistar
    carro, imóvel ou moto... sem os juros do banco") e convite ("O que você tem em mente?").
    SÓ 3 categorias clicáveis: Imóvel / Automóvel / Moto (sem "Outros").
  - Código hoje: honra parcialmente — copy fixa do EmptyState é mais seca: "Olá! Sou seu
    consultor de consórcio.\n\nMe conta: o que você quer conquistar?" +
    3 chips (`src/components/chat/message-list.tsx:211-231`,
    `src/lib/chat/welcome-options.ts:20-24`). A promessa "sem juros" do mockup não está na
    abertura determinística.
  - Como o Haiku verifica: abrir o chat sem digitar nada; capturar o texto literal do 1º
    balão e screenshot dos chips; contar chips (esperado: exatamente 3, rótulos "Imóvel",
    "Automóvel", "Moto"; nenhum "Outros").
  - Severidade se falhar: chips errados/4º chip = alto; copy diferente do mockup = cosmético
    (é divergência documentada, não defeito).

## Passo 1 — Nome (`name`)

- **CA-2 — Transição de persona + pergunta do nome (1 pergunta só)** | Passo/gate: name
  - Esperado: ao dizer o objetivo ("Quero trocar de carro"), aparece a transição do
    especialista (divider "Rafael entrou na conversa" no mockup), o agente reage curto ao
    objetivo, se apresenta UMA vez e pergunta como pode chamar — **uma única pergunta no
    balão**, sem falar de experiência/valor.
  - Código hoje: honra — `buildTransitionFirstContactDirective`
    (`src/lib/agent/orchestrator/directives.ts:7-22`) obriga "reaja + peça o nome, NÃO
    pergunte sobre experiência". Card de nome focado complementa (FIX-17,
    `src/lib/web/adapter.ts:56-58`; `gateQuestion('name')=null` em
    `src/lib/agent/orchestrator/gate-questions.ts:64-69` evita pergunta duplicada).
  - Como o Haiku verifica: digitar "Quero trocar de carro"; capturar o balão de transição +
    o texto do agente; contar "?" no balão (esperado: 1); confirmar que existe input de nome
    (testids `name-input`/`name-submit`) e que NÃO apareceu pergunta de experiência/valor.
  - Severidade se falhar: 2 perguntas no balão = bloqueante (regra dura); sem card de nome =
    médio.

- **CA-3 — Pós-nome: saudação + gate desire, sem pergunta extra do LLM** | Passo/gate: name→desire
  - Esperado: informado o nome, o agente saúda curto ("Prazer, Madalena!") e PARA; o
    SISTEMA emite em seguida a pergunta do desire. Nunca "vou te fazer umas perguntinhas"
    sem ação, nunca turno morto.
  - Código hoje: honra — `buildNameCapturedDirective`
    (`src/lib/agent/orchestrator/directives.ts:43-45`): "NÃO faça pergunta... PARE após a
    saudação — o sistema pergunta o próximo passo (gate 'desire')". `nextGate` retorna
    `desire` quando `!meta.desireAsked` (`src/lib/agent/qualify-state.ts:59-64`).
  - Como o Haiku verifica: enviar o nome ("Madalena"); capturar os balões seguintes —
    esperado saudação com o nome + balão separado com a pergunta do desire (CA-4). FALHA se
    o turno morrer sem a pergunta ou se a saudação já vier com pergunta colada no mesmo balão.
  - Severidade se falhar: turno morto = bloqueante; pergunta colada na saudação = alto.

## Passo 2 — Desire, pergunta 1 (bem específico)

- **CA-4 — "Qual carro você tem em mente?"** | Passo/gate: desire
  - Esperado (mockup F1): pergunta literal por categoria — auto: "Qual carro você tem em
    mente?" (imóvel: "Qual imóvel..."; moto: "Qual moto..."). Sem card, conversa livre.
    NUNCA a gíria "qual carro tá na sua cabeça".
  - Código hoje: honra — `DESIRE_QUESTIONS`
    (`src/lib/agent/orchestrator/gate-questions.ts:47-52`, emitida em
    `src/lib/web/adapter.ts:59-62` + `pipeGatePrompt`); léxico banido dropado pelo sanitizer
    (`src/lib/agent/orchestrator/sanitizer.ts:132-145`).
  - Como o Haiku verifica: capturar o texto literal do balão pós-saudação (esperado
    exatamente "Qual carro você tem em mente?"); confirmar ausência de card/chips nesse turno.
  - Severidade se falhar: pergunta ausente (funil pula pro CPF) = alto; copy divergente mas
    equivalente = cosmético.

## Passo 3 — Desire, pergunta 2 (motivo — turno próprio)

- **CA-5 — Motivo em turno PRÓPRIO, sem card junto** | Passo/gate: desire (motivo)
  - Esperado (regra dura Kairo + mockup): o usuário diz o bem ("Um Corolla, sempre quis") →
    o agente elogia e pergunta SÓ o motivo ("E me conta: o que fez você decidir trocar
    agora?") — nenhum card estruturado (identity/slider) no mesmo turno, nenhuma segunda
    pergunta.
  - Código hoje: honra — `shouldAskMotive` (`src/lib/agent/qualify-state.ts:191-194`) +
    supressão de gate no turno (`decideShowGate`, `qualify-state.ts:244-247`) +
    `desireFollowUpSection` instruindo a pergunta (`src/lib/agent/system-prompt.ts:1019-1027`).
    `motivationAsked` marcado no runner (`src/lib/agent/orchestrator/runner.ts:1113-1118`)
    garante não-bloqueio.
  - Como o Haiku verifica: responder "Um Corolla, sempre quis"; capturar o turno seguinte —
    deve conter UMA pergunta de motivo e ZERO cards (nenhum form de CPF, nenhum slider);
    contar "?" (esperado: 1).
  - Severidade se falhar: card de CPF/slider junto da pergunta do motivo = bloqueante
    (é o CK-1 que o FIX-274 matou); pergunta de motivo nunca feita = alto.

- **CA-6 — Espelhamento do motivo UMA vez** | Passo/gate: desire (motivo)
  - Esperado (mockup): respondido o motivo ("Meu carro vive na oficina, cansei"), o agente
    espelha com empatia UMA vez ("Ah, entendo bem — quando o carro dá trabalho, atrapalha
    tudo...") e NUNCA repete o espelhamento em turnos posteriores. Proibido "Saco, né?"/
    "carro-problema".
  - Código hoje: honra — `motivationMirrorSection`
    (`src/lib/agent/system-prompt.ts:1004-1008`, "UMA ÚNICA VEZ... confira o histórico");
    exemplo few-shot FIX-234 (`system-prompt.ts:800-805`); gíria dropada pelo sanitizer
    (`sanitizer.ts:132-145`). Observação: unicidade depende de instrução no prompt (o modelo
    confere o histórico), não de flag em código — vigiar.
  - Como o Haiku verifica: responder o motivo; capturar o balão de espelhamento; depois,
    ao fim da jornada, buscar no transcript quantas vezes o motivo foi ecoado (esperado: 1);
    grep por "saco"/"carro-problema" (esperado: 0).
  - Severidade se falhar: espelhamento repetido ≥3x = médio; gíria banida na tela = alto.

- **CA-7 — Pular o motivo não trava o funil** | Passo/gate: desire (motivo)
  - Esperado: se o usuário ignora a pergunta do motivo (responde outra coisa/valor), o funil
    segue normal pro identify — sem re-perguntar o motivo em loop.
  - Código hoje: honra — `motivationAsked` libera o funil no turno seguinte
    (`qualify-state.ts:191-194` + `runner.ts:1113-1118`); `desireAsked` marcado na emissão
    (`src/lib/agent/orchestrator/index.ts:657-662`) impede re-emissão.
  - Como o Haiku verifica (cenário alternativo): em vez de dar o motivo, responder "quero
    ver as opções logo" — o próximo turno deve avançar (pedido de CPF), sem repetir "o que
    fez você decidir agora?".
  - Severidade se falhar: loop na pergunta do motivo = alto.

## Passo 4 — Identidade (`identify` — CPF + celular + LGPD)

- **CA-8 — Identify vem ANTES do valor, com justificativa e LGPD** | Passo/gate: identify
  - Esperado (ordem Kairo/FIX-53): depois do desire, o funil vai DIRETO pro pedido de
    CPF+celular. Pedido curto ("Me manda seu CPF e celular, só os números.") + card com
    campos CPF/Celular, texto LGPD "Autorizo a consulta dos meus dados nas administradoras
    parceiras (LGPD)..." e o rótulo obrigatório **"Não é compromisso de contratação."**
    (⚠️ diverge do mockup, que pedia o valor primeiro — ordem nova vence.)
  - Código hoje: honra — `nextGate` retorna `identify` antes de `credit`
    (`qualify-state.ts:85-88`); copy web do pedido (`gate-questions.ts:113-115`, canal
    "web": "Me manda seu CPF e celular, só os números."); card
    (`src/lib/web/adapter.ts:135-137` + `src/components/chat/artifacts/gate-identity-form.tsx:109-124`
    com "Não é compromisso de contratação.").
  - Como o Haiku verifica: após o motivo, capturar o turno — deve conter o pedido de CPF +
    card com testids `identify-cpf`, `identify-phone`, `identify-lgpd`, `identify-submit`;
    screenshot provando o texto "Não é compromisso de contratação."; confirmar que NENHUM
    slider de valor apareceu antes desse card.
  - Severidade se falhar: sem o rótulo LGPD/"não é compromisso" = bloqueante (compliance);
    valor pedido antes da identidade = alto (ordem declarada).

- **CA-9 — Sem consent: nenhum "Posso te fazer 3 perguntinhas?" / "Entender mais antes"** | Passo/gate: (consent REMOVIDO)
  - Esperado (FIX-274): o passo de consent com botões "Bora!"/"Entender mais antes" NÃO
    existe mais em lugar nenhum do funil.
  - Código hoje: honra — `nextGate` sem consent (`qualify-state.ts:68-75`, comentário
    FIX-274). ⚠️ Resíduo: o texto do prompt ainda DESCREVE a ordem antiga com consent
    (`system-prompt.ts:314-330,360`) — não muda o funil (o servidor dirige), mas pode
    induzir narração inconsistente. Ver divergência DV-5.
  - Como o Haiku verifica: no transcript completo, grep por "perguntinhas", "Bora!",
    "Entender mais antes" (esperado: 0 ocorrências).
  - Severidade se falhar: consent aparecendo = bloqueante (regressão do FIX-274).

## Passo 5 — Valor do bem (`credit`)

- **CA-10 — Valor por conversa + agulha simples** | Passo/gate: credit
  - Esperado: pergunta "Qual valor do bem faz mais sentido pra você?" + agulha simples
    (slider único "Valor do bem") com botão "Buscar opções". Usuário pode digitar o valor
    livre ("uns R$ 120.000") — os dois caminhos valem; valor digitado não é capado à faixa.
  - Código hoje: honra — `gateQuestion('credit')` (`gate-questions.ts:74-76`), slider
    (`web/adapter.ts:73-89`, FIX-115), CTA "Buscar opções"
    (`src/components/chat/artifacts/value-picker.tsx:140`), valor livre FIX-218.
  - Como o Haiku verifica: capturar a pergunta + screenshot do slider; digitar "uns R$
    120.000" por texto; confirmar que o agente confirma em 1 frase e avança pra busca sem
    re-perguntar o valor.
  - Severidade se falhar: re-pedir valor já dado = alto; slider ausente = médio (o caminho
    conversa basta).

- **CA-11 — Slot já respondido não re-pergunta (regra de interrupção)** | Passo/gate: credit/desire
  - Esperado (handoff 01 §decideShowGate): se o usuário disser numa frase só "quero um
    Corolla de uns 120 mil", `desiredItem` e valor já contam como preenchidos — sem
    re-mostrar picker nem re-perguntar.
  - Código hoje: honra — analyzer extrai valor voluntário (`system-prompt.ts:332`,
    exceção única) + guard server-side de gate respondido (`system-prompt.ts:338`).
  - Como o Haiku verifica (cenário alternativo): abrir jornada nova respondendo o nome +
    "quero um Corolla de uns 120 mil" — verificar que o funil NÃO pergunta o carro de novo
    (só o motivo) e não re-pede o valor depois.
  - Severidade se falhar: re-pergunta do que já foi dito = médio.

## Passo 6 — Busca + reveal (`search`)

- **CA-12 — Transição honesta pré-busca (sem "encontrei" antes, sem meta-narrativa)** | Passo/gate: search
  - Esperado: antes do retorno da busca, só transição honesta ("Bora ver o que encaixa na
    sua faixa:") — nunca "Encontrei/achei" antes do resultado, nunca "deixa eu buscar"/"vou
    usar a ferramenta"/"um segundo", nunca "atualiza a página".
  - Código hoje: honra — regra FIX-36 (`system-prompt.ts:499`), sanitizer dropa preâmbulo
    de processo e refresh (`sanitizer.ts:24-70`).
  - Como o Haiku verifica: capturar todos os balões entre o envio da identidade/valor e os
    cards; grep por "deixa eu buscar", "vou buscar", "um segundo", "atualiza a página"
    (esperado: 0).
  - Severidade se falhar: meta-narrativa visível = médio; "atualiza a página" = alto.

- **CA-13 — Anúncio com o número REAL de opções** | Passo/gate: search (reveal)
  - Esperado: o anúncio do achado usa a contagem real ("Encontramos N boas opções..."),
    nunca um número fixo inventado; com 1 grupo, sem plural.
  - Código hoje: honra — `buildSearchSummaryDirective` passo 2
    (`src/lib/agent/orchestrator/directives.ts:318-324`).
  - Como o Haiku verifica: capturar o balão de anúncio + contar as cotas no seletor do
    reveal; conferir coerência (N anunciado ≤ opções reais exibidas).
  - Severidade se falhar: número anunciado ≠ realidade = alto (honestidade).

- **CA-14 — Reveal: carta em destaque, parcela abaixo, lance médio discreto, sem taxaContemplacao** | Passo/gate: search (cards)
  - Esperado (handoff 02 + mockup): hierarquia do card — carta de crédito ("Valor do bem")
    em fonte grande é o herói; parcela logo abaixo; "Lance médio R$ X" como linha de
    detalhe discreta e SÓ com dado real (ausente → some); NENHUMA "taxa de contemplação"
    (nem %); contemplação só como contagem real ("N por mês").
  - Código hoje: honra — hero carta (`src/components/chat/artifacts/recommendation-card.tsx:203-212`,
    testid `recommendation-hero-credit`), parcela secundária (`:214-223`), lance médio
    condicional (`:251-258`), sem taxa (guard `no-taxa-contemplacao.guard.test.ts`;
    comparison-table/group-card idem, `comparison-table.tsx:96-134`,
    `group-card.tsx:107-166`); fala vigiada pelo sanitizer (`sanitizer.ts:118-126`).
  - Como o Haiku verifica: screenshot do reveal; verificar visualmente carta > parcela em
    peso tipográfico; grep no DOM por "taxa de contemplação" e "%" órfão de contexto
    (esperado: 0); registrar o valor literal da carta/parcela pra conferir coerência nos
    passos seguintes.
  - Severidade se falhar: taxaContemplacao exibida = bloqueante (compliance); hierarquia
    invertida (parcela como herói) = médio.

- **CA-15 — Sem parcela pós-contemplação no card de recomendação + nota da parcela cheia** | Passo/gate: search (cards)
  - Esperado (handoff 02): o recommendation_card NÃO mostra parcela pós-contemplação (só a
    agulha mostra); nota fixa: "Essa é a parcela cheia, que você paga até ser contemplada."
  - Código hoje: honra — nota hardcoded (`recommendation-card.tsx:224-229`).
  - Como o Haiku verifica: screenshot do card; confirmar presença literal da nota e ausência
    de qualquer "após a contemplação"/"parcela pós" no card do reveal.
  - Severidade se falhar: parcela pós no card do reveal = alto.

- **CA-16 — 1ª lista NEUTRA (sem favoritismo) com 2+ cotas** | Passo/gate: search (cards)
  - Esperado (Ata 2026-07-04/FIX-220): com 2+ cotas na primeira lista, nenhuma é marcada
    "Recomendada" — mesmo peso (o selo "Recomendação" só sem concorrência ou no estágio 2,
    que é ONDA 2). ⚠️ Difere do mockup (que tem chip "Recomendada") — Ata vence.
  - Código hoje: honra — `showFavoritism` (`recommendation-card.tsx:116-125`).
  - Como o Haiku verifica: screenshot do reveal com 2+ cotas; verificar ausência do selo
    "Recomendação" nessa primeira lista.
  - Severidade se falhar: selo indevido na 1ª lista = médio (decisão de produto registrada).

## Passo 7 — Experiência (`experience` — SÓ pós-busca)

- **CA-17 — "Você já fez consórcio antes?" SÓ depois do reveal** | Passo/gate: experience
  - Esperado (regra dura Kairo + handoff D1): a pergunta de experiência ("Você já fez
    consórcio antes?") aparece com os grupos JÁ na tela — nunca no começo da conversa.
    Chips: "É a primeira vez" / "Já conheço" / "Tenho dúvidas".
  - Código hoje: honra — `nextGate` só retorna `experience` com `revealCompleted`
    (`qualify-state.ts:126-133`); pergunta (`gate-questions.ts:72-73`); chips
    (`web/adapter.ts:63-72`).
  - Como o Haiku verifica: confirmar no transcript que a 1ª ocorrência de "já fez consórcio"
    vem DEPOIS dos cards do reveal; screenshot dos 3 chips.
  - Severidade se falhar: pergunta antes da busca = bloqueante (regra dura de hoje).

- **CA-18 — Explicação de consórcio só aqui, e só pra quem precisa** | Passo/gate: experience
  - Esperado (mockup): "Primeira vez" → UM balão de explicação (grupo, contemplação mensal
    por sorteio ou lance, carta = valor que você recebe, "você paga o carro, não o banco",
    papel da Aja); "Já conheço" → 1 frase de transição, SEM aula. A explicação NUNCA sai
    antes do gate (nunca presumir novato).
  - Código hoje: honra — `buildExperienceFirstDirective`/`buildExperienceReturningDirective`
    (`directives.ts:49-59`); anti-presunção FIX-250 (`system-prompt.ts:558-562`).
  - Como o Haiku verifica: clicar "É a primeira vez"; capturar o balão de explicação (deve
    citar sorteio/lance e explicar carta de crédito); em rodada alternativa clicar "Já
    conheço" e confirmar ausência de aula. Grep no transcript pré-gate por "primeira vez com
    consórcio" dito pelo agente (esperado: 0).
  - Severidade se falhar: aula duplicada ou antes do gate = alto; explicação sem o papel da
    plataforma = cosmético.

- **CA-19 — Badges de dúvida (o que é lance? / como funciona o sorteio? / e quando eu for contemplada?)** | Passo/gate: experience
  - Esperado (handoff 01 + mockup): após a explicação de novato, chips TOCÁVEIS de dúvida —
    explicação disponível, não empurrada; o badge "o que é lance?" responde curto e planta o
    embutido sem números.
  - Código hoje: **NÃO ACHEI** — não existe componente/gate de badges de dúvida; a busca por
    "o que é lance"/"como funciona o sorteio" só encontra a educação do gate lance-embutido
    (`gate-questions.ts:24`). Pós-explicação, o funil vai direto pro `timeframe`. Ver DV-1.
  - Como o Haiku verifica: após a explicação de novato, screenshot — registrar se aparecem
    chips de dúvida (expectativa hoje: NÃO aparecem; coletar como evidência da divergência,
    não como bug novo).
  - Severidade se falhar: divergência conhecida (média) — já é candidata a defeito/backlog,
    não falha nova do coletor.

## Passo 8 — Prazo (`timeframe` — pós-recomendação)

- **CA-20 — "Em quanto tempo você quer estar com o carro novo?" pós-reveal/experience** | Passo/gate: timeframe
  - Esperado (handoff 01): a pergunta de prazo é a ponte pro simulador e vem DEPOIS da
    recomendação/experience — nunca na entrada da jornada.
  - Código hoje: honra — `nextGate` só chega em `timeframe` com `revealCompleted` +
    experience resolvida (`qualify-state.ts:131-141`); pergunta por categoria
    (`gate-questions.ts:36-41,77-78`); chips (`web/adapter.ts:90-98`).
  - Como o Haiku verifica: após resolver experience, capturar a pergunta de prazo + chips;
    confirmar que ela NÃO apareceu em nenhum turno antes do reveal (grep "Em quanto tempo"
    no transcript pré-cards → 0).
  - Severidade se falhar: prazo perguntado na entrada = alto (regressão FIX-103/233).

## Passo 9 — Lance (bifurcação de estratégia)

- **CA-21 — Pergunta do lance sem a palavra "reserva", com a 3ª saída** | Passo/gate: lance
  - Esperado: "Você teria como dar um lance pra antecipar a contemplação?" com 4 chips:
    "Sim, tenho como dar" / "Talvez, depende" / "Por enquanto não" / "Só a parcela, sem
    lance". A palavra "reserva" não aparece (FIX-268 — ambígua com o termo proibido).
  - Código hoje: honra — pergunta (`gate-questions.ts:79-85`), chips
    (`web/adapter.ts:99-114`), reação sem "reserva" (`directives.ts:107-109`).
  - Como o Haiku verifica: screenshot dos 4 chips + texto da pergunta; grep "reserva" no
    turno (esperado: 0).
  - Severidade se falhar: "reserva" na pergunta/reação = médio; 3ª saída ausente = alto.

- **CA-22 — "Sim, tenho como dar" → valor do lance vem do usuário** | Passo/gate: lance-value
  - Esperado: "Boa! E qual valor aproximado você pensa em dar de lance?" + chips de faixas;
    o valor NUNCA é derivado silenciosamente.
  - Código hoje: honra — (`qualify-state.ts:160-164`, `gate-questions.ts:86-88`,
    `web/adapter.ts:115-128`).
  - Como o Haiku verifica (ramo Madalena-variante): clicar "Sim, tenho como dar"; capturar a
    pergunta + chips de faixa.
  - Severidade se falhar: valor de lance inventado sem perguntar = alto.

- **CA-23 — "Só a parcela" → two_paths + decisão devolvida (Fluxo B/Mario)** | Passo/gate: lance (3ª saída)
  - Esperado (mockup F2): o agente respeita ("Perfeito, respeito total...") e mostra o card
    de DOIS CAMINHOS — (A) Esperar o sorteio, paga só a parcela de R$ X e concorre todo mês;
    (B) Um lance pequeno lá na frente (13º, férias), opcional. Nenhum dos dois é recomendado;
    o convite é a frase FIXA: "Não tem certo ou errado — depende de você ter pressa ou não.
    Qual dos dois combina mais com você?". Sem % de chance no card. Esse caminho PULA
    embutido, agulha e escassez.
  - Código hoje: honra — directive só-transição (`directives.ts:129-131`), card server-side
    determinístico + follow-up fixo (`src/lib/agent/orchestrator/index.ts:610-635`,
    `TWO_PATHS_FOLLOWUP_TEXT` `directives.ts:116-117`), componente com pesos iguais e sem
    probabilidade (`src/components/chat/artifacts/two-paths.tsx:18-73`), whitelist do payload
    (`src/lib/agent/orchestrator/two-paths-payload.ts:16-28`), skip do funil
    (`qualify-state.ts:153-159`) e da escassez (`index.ts:573-581`).
  - Como o Haiku verifica: clicar "Só a parcela, sem lance"; screenshot do card (título
    "Dois caminhos possíveis — sem lance", 2 opções com mesmo peso visual, parcela literal
    igual à do grupo em tela); capturar a frase fixa literal; confirmar que NÃO apareceram
    card de embutido, agulha nem escassez nesse caminho.
  - Severidade se falhar: card não emitido = bloqueante (foi o P0 do FIX-246); agente
    recomendando um dos caminhos = alto; % de chance no card = bloqueante (compliance).

## Passo 10 — Lance embutido (`lance-embutido`)

- **CA-24 — Card embedded_bid ANTES da pergunta, com números reais e a consequência** | Passo/gate: lance-embutido
  - Esperado (handoff 02 CARD 1): card curto "Lance embutido — sem tirar do bolso" +
    corpo "Você usa parte da própria carta como lance e antecipa a contemplação, sem
    desembolsar. O embutido sai da carta, então o crédito recebido diminui um pouco." +
    números REAIS (Lance embutido = 30% da carta em tela; "Valor que você recebe" =
    carta − embutido). **Regra dura: o card SEMPRE diz que o crédito recebido diminui.**
  - Código hoje: honra — emissão server-side antes do gate
    (`orchestrator/index.ts:681-697`; clique: `route.ts:1103,1268`), payload coagido da
    oferta real (`embedded-bid-payload.ts:22-40`), copy hardcoded no componente
    (`embedded-bid.tsx:19-50` — a frase da consequência não é interpolável).
  - Como o Haiku verifica: chegar ao gate (ex.: "Talvez, depende" ou pós lance-value);
    screenshot do card; conferir a matemática com os valores em tela
    (embutido ≈ 0,30 × carta; recebe = carta − embutido); confirmar a frase "o crédito
    recebido diminui".
  - Severidade se falhar: card sem a consequência = bloqueante ("separa consultoria de
    venda enganosa"); números divergentes da carta em tela = bloqueante; card ausente = alto.

- **CA-25 — Educação do embutido UMA vez, com a carta REAL** | Passo/gate: lance-embutido
  - Esperado: a educação ("Você sabe o que é lance embutido? ... na sua carta de R$ X...")
    sai UMA vez, com o valor da carta real em tela (não o exemplo genérico de R$ 100 mil), e
    fecha com "Quer considerar esse tipo de lance nas suas simulações?" — 1 pergunta.
  - Código hoje: honra — `lanceEmbutidoEdu(creditValue)` com carta real
    (`gate-questions.ts:18-34,89-95`, FIX-245); directive do card é SÓ transição pra não
    duplicar a definição (`directives.ts:153-155`, FIX-268).
  - Como o Haiku verifica: contar quantas vezes a definição de embutido aparece no turno
    (esperado: 1); conferir que o valor citado é a carta real em tela; capturar a pergunta +
    chips ("Sim, considerar lance embutido" / "Não, prefiro sem lance embutido").
  - Severidade se falhar: definição 2x no mesmo turno = médio (residual D4 já caçado);
    exemplo genérico com carta real disponível = cosmético.

## Passo 11 — Agulha (`contemplation_dial`)

- **CA-26 — Oferta do simulador (1 pergunta) → agulha com disclaimer fixo** | Passo/gate: simulator-offer → dial
  - Esperado: "Se quiser, temos o nosso simulador pra ver como ficariam as suas parcelas,
    caso você seja contemplado em 3, 6 ou 12 meses — que tal?" + chips "Quero ver!"/"Agora
    não". Aceito → agulha com disclaimer SEMPRE visível (nunca tooltip): "Estimativa a
    partir dos dados da oferta. Contemplação por lance ou sorteio não é garantida."
  - Código hoje: honra — oferta (`gate-questions.ts:116-121`, `web/adapter.ts:138-147`),
    directive do dial (`directives.ts:339-362`), disclaimer fixo
    (`contemplation-dial.tsx:285-289`, testid `dial-disclaimer`).
  - Como o Haiku verifica: capturar a oferta + clicar "Quero ver!"; screenshot da agulha com
    o disclaimer visível sem interação; arrastar o slider (`aria-label` "Mês alvo de
    contemplação") e registrar que lance/crédito/parcela recalculam.
  - Severidade se falhar: disclaimer ausente/escondido = bloqueante (CDC); agulha não
    recalcula = alto.

- **CA-27 — Âncora do dinheiro ("junto R$ 4 mil/mês")** | Passo/gate: dial
  - Esperado (handoff 03 + mockup): declarada poupança mensal, o mês-alvo inicial da agulha
    é o 1º mês em que o BOLSO cobre o lance (não "quando você quer") e o agente narra 1
    frase factual ("juntando R$ 4.000/mês, lá pelo mês Y seu dinheiro alcança o lance") SEM
    prometer contemplação nesse mês.
  - Código hoje: honra — `computeMoneyAnchor`/`anchorMonth` comparam contra o BOLSO
    (`src/lib/agent/orchestrator/dial-payload.ts:70-96`,
    `src/lib/consorcio/contemplation-dial.ts:194-207`); narração instruída com a ressalva
    (`directives.ts:351-353`); captura oportunista de `monthlySavings` por texto livre
    (`src/lib/agent/orchestrator/analyze.ts:160-165`).
  - Como o Haiku verifica: no gate lance, responder "Não tenho agora, mas junto uns R$ 4 mil
    por mês"; capturar a narração (deve citar R$ 4.000/mês + um mês concreto, sem "você será
    contemplada em X"); screenshot da agulha (mês inicial coerente com a narração).
  - Severidade se falhar: promessa de contemplação em mês específico = bloqueante; âncora
    ignorada (agulha genérica) = médio.

- **CA-28 — Nunca redução de prazo; sem "chance de contemplação"** | Passo/gate: dial
  - Esperado (D7 + compliance 05): o abatimento do lance vira PARCELA MENOR, nunca prazo
    menor — nenhum card/copy oferece "reduzir o prazo"/"terminar antes"/"quitar antes".
    Nenhuma métrica de likelihood/chance (o mockup antigo da agulha tinha "Chance de
    contemplação" — foi REMOVIDO pelo handoff 03/05).
  - Código hoje: honra — sanitizer dropa as frases (`sanitizer.ts:78-89`); motor sem
    likelihood (`contemplation-dial.ts` — sem o campo; teste
    `contemplation-dial.no-likelihood.test.tsx`); rótulo pós-lance honesto
    (`contemplation-dial.ts:224-231`).
  - Como o Haiku verifica: grep no DOM da agulha e no transcript por "reduzir o prazo",
    "terminar antes", "quitar antes", "chance de contemplação" (esperado: 0).
  - Severidade se falhar: qualquer um na tela = bloqueante (compliance).

- **CA-29 — Parcela pós-contemplação AMORTIZA (cai) e nunca sobe** | Passo/gate: dial
  - Esperado (FIX-221): o lance TOTAL (embutido + bolso) amortiza o saldo → parcela pós ≤
    parcela cheia; quando não cai (lance zero), o rótulo NÃO mente "menor".
  - Código hoje: honra — amortização total (`contemplation-dial.ts:150-156`),
    `paymentAfterLabel` (`:224-231`). ⚠️ PENDENTE-Bernardo validar o número exato (P1 do
    handoff) — o modelo é o acordado em Ata, não confirmação final da administradora.
  - Como o Haiku verifica: na agulha, capturar parcela antes/depois em 2 posições do slider;
    provar parcelaPós ≤ parcelaCheia sempre.
  - Severidade se falhar: parcela pós > cheia ou rótulo "menor" com número igual = alto.

## Passo 12 — Escassez (`scarcity`)

- **CA-30 — Card de escassez no momento certo, sem total de cotas** | Passo/gate: scarcity
  - Esperado (handoff 02 CARD 2 + mockup): depois da estratégia resolvida e ANTES do card de
    decisão, transição curta ("Ah, e um detalhe sobre esse grupo...") + card "Grupo quase
    cheio · restam apenas N" com barra DECORATIVA (largura fixa) e "Quando preencher, entra
    fila para o próximo grupo." NUNCA o total de cotas nem razão N/total. Não dispara no
    caminho "só a parcela".
  - Código hoje: honra a estrutura — directive só-transição (`directives.ts:169-171`), card
    server-side antes do decision (`orchestrator/index.ts:581-608`), componente sem total,
    barra fixa 90% (`scarcity.tsx:11-32`). ⚠️ **`availableSlots` é PLACEBO determinístico
    1-6 por hash do groupId** (`scarcity-payload.ts:1-50`, decisão de produto do Kairo
    2026-07-09, ADR D3) — diverge do handoff "só com dado real da Bevi" (ver DV-4).
  - Como o Haiku verifica: no caminho com lance, após a agulha sinalizar avanço ("gostei,
    faz sentido"), capturar o card ("restam apenas N", N entre 1 e 6) + screenshot;
    recarregar a página/rever histórico e provar que N NÃO mudou (estabilidade do placebo);
    grep por "total de cotas"/"de N cotas" (esperado: 0).
  - Severidade se falhar: N instável entre renders = alto (destrói a credibilidade — era o
    requisito da decisão); total de cotas exibido = bloqueante; card no caminho so_parcela =
    médio.

## Passo 13 — Decisão + proposta

- **CA-31 — Card de decisão canônico** | Passo/gate: decision
  - Esperado: fechada a avaliação, 1 frase do agente ("Boa! Então deixa eu confirmar com
    você:") + card "Esse plano faz sentido para você?" com 3 opções fixas: "Sim, quero
    reservar agora" / "Quero ver outras opções" / "Quero falar com um especialista..." —
    emitido pelo SISTEMA, nunca re-apresentando cards do reveal. ⚠️ O mockup NÃO tem esse
    passo (vai de escassez direto pra proposta) — ver DV-2.
  - Código hoje: honra — directive (`directives.ts:490-494`), card server-side
    (`orchestrator/index.ts:636-648`), opções canônicas
    (`src/lib/chat/types.ts:241-252`).
  - Como o Haiku verifica: capturar o card e os 3 rótulos literais; confirmar que nenhum
    card do reveal foi re-emitido nesse turno (anti-loop).
  - Severidade se falhar: re-apresentação do reveal (loop) = alto; opções inventadas = médio.

- **CA-32 — Proposta co-branded com selo 0% e chips de credibilidade** | Passo/gate: proposal (real_offer)
  - Esperado (handoff 02 + mockup): card co-branded (sol Aja Agora + logo administradora),
    selo "0% de juros — você paga o bem, não os juros do banco", carta em destaque, parcela/
    prazo/grupo LITERAIS, "Lance médio do grupo" só com fonte, chips: "Sem juros" /
    "Fiscalizado pelo Banco Central" / "Dados protegidos (LGPD)" / "Acompanhamento até a
    contemplação". Se a carta real difere da pedida → aviso explícito, nunca silêncio.
  - Código hoje: honra — (`real-offer.tsx:17-58` chips/selo/co-brand, `:84-104` aviso de
    ajuste, `closing-presentation.ts:47-58` aviso de troca de administradora).
  - Como o Haiku verifica: seguir "Sim, quero reservar agora" → contract form (com
    identidade on file, confirmação) → capturar o real_offer: screenshot provando co-brand +
    selo + 4 chips; conferir parcela com centavos (R$ X.XXX,XX) e coerência com o valor
    visto no reveal; se a carta mudou, o aviso "Você pediu uma carta de ~X — a carta real
    ficou em Y" tem que estar visível.
  - Severidade se falhar: confirmar silenciosamente carta divergente = bloqueante (CDC art.
    30); selo/chips ausentes = médio; economia vs financiamento SEM premissa = alto (não
    deve existir hoje).

## Passo 14 — Fecho WhatsApp (D8)

- **CA-33 — Fecho: mensagenzinha + "oi" + especialista de cadastros** | Passo/gate: whatsapp-handoff
  - Esperado (handoff 04 FECHO): após confirmar a oferta, na sequência do "Parabéns! Agora
    você está oficialmente mais perto da sua conquista!", os 3 balões do fecho:
    (1) "Pra gente seguir, olha só: acabei de te mandar uma mensagenzinha no seu WhatsApp."
    (2) 'Me responde por lá com um "oi"? É só pra você já salvar o nosso contato.'
    (3) "Daí, em alguns minutos, a nossa especialista em cadastros te chama pra pedir seus
    dados e os documentos pra dar entrada na administradora."
    Variante honesta quando o envio só foi ENFILEIRADO (dev sem template): "assim que a
    janela abrir, eu te mando uma mensagenzinha" (FIX-265) — as duas valem, conforme o
    ambiente.
  - Código hoje: honra — copy determinística (`closing-presentation.ts:117-173`), disparo
    real + mesa na hora (`src/lib/bevi/fecho-pedir-oi.ts:32-141`).
  - Como o Haiku verifica: capturar os balões literais pós-confirmação; conferir qual
    variante saiu ("acabei de te mandar" × "assim que a janela abrir") e registrar — o juiz
    cruza com o ambiente (template aprovado?). O pedido do "oi" e a especialista de
    cadastros são obrigatórios nas duas variantes.
  - Severidade se falhar: fecho ausente = alto; "acabei de te mandar" sem envio real
    (checar log `fecho-pedir-oi`) = alto (mentira observável).

- **CA-34 — NUNCA "reservado/garantido/você já está no grupo" na fala do agente** | Passo/gate: fecho/todo o funil
  - Esperado (compliance 05 #9): antes da contratação real, o agente nunca afirma reserva/
    garantia. (A copy determinística oficial pós-evento usa "reserva de cota" — terminologia
    da Ata; a proibição mira a FALA do LLM.)
  - Código hoje: honra — sanitizer dropa (`sanitizer.ts:97-109`); directives usam "garantir
    seu lugar"/"pré-cadastro" (`directives.ts:213-236`, FIX-256).
  - Como o Haiku verifica: grep no transcript inteiro por "reservado", "cota garantida",
    "você já está no grupo" em balões de texto do agente (esperado: 0 — botões/cards
    determinísticos como "Sim, quero reservar agora" não contam).
  - Severidade se falhar: afirmação prematura = bloqueante.

## Transversais — tom, cadência e compliance (valem a conversa inteira)

- **CA-35 — Cadência: 1 balão = 1 ideia; MÁX 1 pergunta por balão** | Passo/gate: todos
  - Esperado (regra dura Kairo + handoff 04): nem paredão (balão gigante) nem picotado
    ("Recebido!" / "Deixa eu buscar…" em 4 balões); reação+transição agrupadas; **nunca 2
    perguntas na mesma mensagem**.
  - Código hoje: honra parcialmente — prompt FIX-234 (`system-prompt.ts:138-149`) + "UMA
    pergunta acionável por turno" nas seções de WhatsApp-optin (`system-prompt.ts:892,909`) +
    mecânica do FIX-274 pro caso motivo×card; `text-boundary` evita colagem de balões
    (`orchestrator/index.ts:569,608`). ⚠️ O prompt genérico ainda diz "NÃO faca mais de 2
    perguntas por mensagem" (`system-prompt.ts:59` — permite 2) — resíduo, ver DV-5. A regra
    global "máx 1 pergunta" não tem barreira em código pra qualquer turno.
  - Como o Haiku verifica: pra CADA balão do agente no transcript, contar "?" (esperado:
    ≤1 pergunta real por balão) e linhas (>6 linhas densas = candidato a paredão); registrar
    todos os balões com 2+ perguntas como evidência literal.
  - Severidade se falhar: 2 perguntas num balão = bloqueante (regra de 1ª classe do Kairo);
    paredão/picote = médio.

- **CA-36 — Tom consultivo: léxico banido e emoji com parcimônia** | Passo/gate: todos
  - Esperado (handoff 04 tabela ❌/✅): nunca "Saco, né?", "carro-problema", "furar a fila",
    "na sua cabeça", "Boa, bora!" efusivo; sim "Entendo bem — quando o carro dá trabalho...",
    "antecipar a contemplação", "qual carro você tem em mente", "Perfeito, vamos montar seu
    plano." Emoji: no máx 1 a cada 3-4 balões, nunca 2+ no mesmo balão.
  - Código hoje: honra — léxico no sanitizer (barreira real, `sanitizer.ts:132-145`) +
    prompt/exemplos (`system-prompt.ts:138-149,766-813`); emoji só por prompt
    (`system-prompt.ts:21,126,149`).
  - Como o Haiku verifica: grep no transcript por cada termo banido (esperado: 0); contar
    emojis por balão e a densidade total (FALHA se >1 por balão ou >1 a cada ~3 balões).
  - Severidade se falhar: termo banido = alto; densidade de emoji = cosmético/médio.

- **CA-37 — Valores monetários LITERAIS, nunca arredondados** | Passo/gate: todos
  - Esperado (compliance 05 #2, CDC art. 30): todo valor citado em texto = literal da fonte
    (R$ X.XXX,XX); cards com parcela nunca arredondam centavos; número do balão bate com o
    número do card.
  - Código hoje: honra — regra dura no prompt (`system-prompt.ts:583-594,663-674`), cards
    com 2 casas na parcela (`comparison-table.tsx:17`, FIX-242 `two-paths.tsx:9-12`).
  - Como o Haiku verifica: coletar TODOS os pares (valor no card × valor citado em texto)
    da condução; qualquer par divergente (ex.: card R$ 2.778,34 × texto "R$ 2.800") é FALHA
    com os dois literais capturados.
  - Severidade se falhar: bloqueante (oferta vinculante).

- **CA-38 — Zero vazamento de mecânica/estado fabricado** | Passo/gate: todos
  - Esperado: nunca "sistema"/"botões"/"menu"/"gate"; nunca "instabilidade na busca" sem
    busca falha real; nunca prometer "te retorno depois" (web não tem canal proativo);
    nunca afirmar "documentos recebidos"/"re-busquei o catálogo" sem o evento real.
  - Código hoje: honra — prompt (`system-prompt.ts:62,263-284,510-515`) + sanitizer FIX-249/
    FIX-270 (`sanitizer.ts:153-231`).
  - Como o Haiku verifica: grep no transcript por "sistema", "botão/botões", "te retorno",
    "já recebemos seus documentos", "não apareceu nenhum grupo novo" (esperado: 0 em balões
    do agente).
  - Severidade se falhar: estado fabricado = bloqueante (era o único bloqueador do r7);
    vazamento de mecânica = médio.

- **CA-39 — Português correto (acentuação completa) em tudo que o usuário vê** | Passo/gate: todos
  - Esperado (inviolável do projeto): toda copy visível com acentos/cedilha ("você", "não",
    "consórcio", "crédito"); zero ASCII-fication.
  - Código hoje: honra nas copies determinísticas auditadas; a fala do LLM é instruída
    (`system-prompt.ts:15,79`).
  - Como o Haiku verifica: grep no transcript por padrões desacentuados comuns ("voce",
    "nao ", "consorcio", "credito", "otimo") — esperado: 0.
  - Severidade se falhar: médio (defeito de entrega).

- **CA-40 — Fluxo B (Mario): objeção "sem entrada" desarmada; escolha do usuário validada** | Passo/gate: transversal (Fluxo B)
  - Esperado (mockup F2): usuário chega com "tô sem grana pra dar entrada" → o agente
    desarma com leveza ("no consórcio não tem entrada") antes de seguir; quando o usuário
    elogia um grupo pelo nome ("A Canopus parece boa"), o agente valida com o número REAL
    ("tem mesmo a parcela mais leve, R$ 812" — literal do card, grupo citado por id real).
  - Código hoje: parcial — a validação por nome usa dados reais do histórico (regra FIX-71/72,
    `system-prompt.ts:531-548`); o desarme da objeção "sem entrada" NÃO tem regra/copy
    determinística — é comportamento esperado do modelo (não achei âncora no prompt).
  - Como o Haiku verifica: rodar o Fluxo B começando com "Quero um carro, mas tô sem grana
    pra dar entrada"; capturar se a resposta esclarece que consórcio não tem entrada; depois
    do reveal, citar um grupo pelo nome e conferir que a parcela citada bate com o card.
  - Severidade se falhar: parcela citada ≠ card = alto; desarme ausente = médio (candidato a
    exemplo few-shot, não regressão).

---

## DIVERGÊNCIAS código × handoff (candidatas a defeito / decisão)

- **DV-1 — Badges de dúvida não existem (handoff 01 §experience + mockup).** Após a
  explicação de novato deveriam aparecer chips tocáveis "o que é lance?" / "como funciona o
  sorteio?" / "e quando eu for contemplada?". Não há componente nem gate para isso — o funil
  vai direto pro `timeframe`. Evidência: busca em `src/components/chat/**` e
  `src/lib/**` sem correspondência (só a educação do gate lance-embutido em
  `gate-questions.ts:24`). Candidato a defeito (médio) ou corte consciente — confirmar com o
  Kairo.

- **DV-2 — Ordem proposta × decisão invertida vs handoff/mockup.** Handoff 01: `scarcity →
  proposal → decision`; mockup: escassez → proposta → fecho (SEM card "Esse plano faz
  sentido?"). Código: `scarcity → decision_prompt → contract_form → real_offer(proposta) →
  fecho` (`orchestrator/index.ts:581-648`). O decision_prompt vem do docx antigo (passo 4) e
  sobreviveu à reforma. Impacto: um passo a mais entre a escassez e a proposta. Decisão de
  produto — perguntar se o decision_prompt fica.

- **DV-3 — "Recomendação" não é um beat separado pós-experience.** Handoff/mockup: depois
  do experience, o agente pede licença ("Posso te mostrar a opção que eu recomendo?") e
  mostra a recomendada com prova social sóbria ("é a que eu indicaria pra alguém da minha
  família"). Código: os cards (hero + seletor + simulação + comparativo) saem TODOS no turno
  do reveal, ANTES do experience, e a 1ª lista é deliberadamente NEUTRA (FIX-220 — sem selo
  de recomendação); o estágio 2 "personalizada" é ONDA 2, não implementado
  (`recommendation-card.tsx:116-125`, `directives.ts:312-334`). A prova social do mockup não
  existe como copy. Divergência estrutural consciente (Ata) — a rubrica deve cobrar os cards
  no reveal, não um beat de recomendação pós-experience; a prova social é candidata à ONDA 2.

- **DV-4 — Escassez com número PLACEBO (1-6) × handoff "só com dado real".** Compliance 05
  #7 e o card 02 dizem "availableSlots vem da Bevi, NUNCA inventar; ausente → não renderiza".
  O código gera 1-6 determinístico por hash do groupId (`scarcity-payload.ts:1-50`) — decisão
  registrada do Kairo (ADR 2026-07-09 D3: a Bevi não entrega vagas restantes). Palavra nova
  vence: a rubrica valida ESTABILIDADE (mesmo grupo → mesmo N, sempre) e ausência de total —
  mas fica o registro: o handoff considera isso "destruir a única vantagem" da escassez real.
  Vale re-confirmar com o Kairo se o placebo segue de pé pra PROD.

- **DV-5 — Texto do system-prompt com ordem STALE (pré-FIX-274/233).** A seção "A ordem da
  coleta" ainda descreve `experience → consent → identidade → valor`
  (`system-prompt.ts:314-330`) e cita o gate consent como botão (`:360`); o SYSTEM_PROMPT
  genérico permite "2 perguntas por mensagem" (`:59`), contra a regra nova "máx 1 pergunta
  por balão". O funil real é dirigido pelo servidor (não muda a ordem), mas o prompt stale
  pode gerar narração inconsistente (ex.: agente anunciar/presumir passos que não existem).
  Candidato a limpeza de prompt (médio).

- **DV-6 — Ordem valor × identidade diverge do mockup.** Mockup Madalena: valor do Corolla
  (value-picker) ANTES do CPF. Código e ordem declarada do Kairo hoje: identify ANTES do
  credit (FIX-53, `qualify-state.ts:85-88`). Palavra nova vence — a rubrica cobra a ordem do
  código; registrado porque o coletor não deve marcar FALHA ao ver CPF antes do valor.

- **DV-7 — Copy do reveal (docx × handoff).** O directive manda a copy do docx
  ("Encontramos N boas opções para o seu perfil. Agora vamos te recomendar a mais
  adequada:", `directives.ts:320-324`); o handoff/mockup pede "Encontrei vários grupos!
  Separei os melhores — repara na carta e na parcela de cada um:". Cosmético, mas é a cara
  do momento-chave — decidir qual copy é a canônica.

- **DV-8 — Terminologia "reservar/contratar" inconsistente entre superfícies.** O card de
  decisão diz "Sim, quero reservar agora" (`types.ts:247`); o real_offer diz "Confirmar e
  contratar" (`real-offer.tsx:139` — a Ata FIX-216 pedia "confirmar e reservar"); o
  closing diz "Você está contratando um consórcio da X" (`closing-presentation.ts:130`); o
  FIX-256 baniu "reserva" da fala dos directives; o sanitizer dropa "reservado" do LLM.
  Quatro convenções convivendo — decidir a palavra oficial e alinhar as copies
  determinísticas.

- **DV-9 — Docs de QA/jornada com resíduos.** `docs/qa/roteiro-qa.md` (Passo 2) ainda lista
  o seletor do consent ("consent `Bora!`") e a ordem antiga (experience → valor na entrada);
  `docs/jornada/jornada-canonica.md:113-114` diz que a 3ª saída do lance é "só via texto
  livre — sem botão próprio", mas o FIX-236 criou o botão "Só a parcela, sem lance"
  (`web/adapter.ts:109-113`). Só documentação — mas o coletor pode se confundir se usar o
  roteiro cru.

## DÚVIDAS ABERTAS (não confirmei barato — verificar ao vivo / com o dono)

1. **Verbalização do guardrail D6 (a "jogada inteligente" do mockup).** O guardrail
   `netCredit >= valorDoBem` existe como reordenação no ranking (`recommendation.ts:98-194`,
   FIX-226) e o sweep 1.3× existe — mas NÃO achei copy/directive que faça o agente
   VERBALIZAR a jogada como no mockup ("Na carta de R$ 120 mil, o embutido te deixaria com
   uns R$ 86 mil... o ideal é uma carta de R$ 171 mil"). Se essa narração acontece, é mérito
   do LLM com os dados do card — hipótese, não fato. O coletor deve capturar o que o agente
   diz quando a estratégia usa embutido com carta menor que o bem.
2. **A explicação da variação de cartas** ("As cartas variam um pouquinho porque cada
   administradora monta num valor próximo") não tem copy determinística — comportamento do
   modelo ao "quero ver todas". Verificar ao vivo.
3. **Desarme da objeção "sem entrada" (Fluxo B)** — sem âncora no prompt (CA-40). Se falhar
   ao vivo, o fix natural é exemplo few-shot, não gate.
4. **Fecho em DEV:** sem template `fecho_pedir_oi` aprovado + janela fechada, o envio cai na
   fila e a copy vira "assim que a janela abrir..." — o coletor precisa saber o estado do
   ambiente antes de julgar qual variante é a correta (checar log `fecho-pedir-oi` /
   `whatsapp_outbound_queue`).
5. **Placebo da escassez em PROD (DV-4)** — decisão registrada em ADR, mas conflita
   frontalmente com o doc de compliance do handoff; re-selar com o Kairo antes de tratar
   como comportamento final.
6. **decision_prompt fica ou sai (DV-2)?** O mockup não o tem; o código o emite sempre no
   caminho com lance. Decisão de produto.
7. **`referenceMonth` da curva (P5 do handoff)** segue heurístico (âncora 25% do prazo)
   quando a Bevi não manda o par (lance, mês) — `contemplation-dial.ts:109-118`. Os números
   da agulha são calibrados por heurística documentada, não por dado confirmado da Bevi.
   Não é verificável no browser; registro pra não cravar "número certo" no juízo.

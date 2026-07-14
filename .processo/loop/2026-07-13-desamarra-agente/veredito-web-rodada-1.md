# Veredito — rodada 1 (canal web), 4 dossiês (auto, moto, imóvel, serviços)

Juiz: Sonnet, contexto fresco, olhar adversarial. Julguei só o transcript literal — ignorei
qualquer "Observações" do coletor (elas erram feio em pelo menos 2 dos 4 dossiês, ver gaps).

Referências usadas: mockup `aja-dois-cenarios.html`, `docs/design/specs/.../04-copy-fluxos.md`,
`docs/jornada/decisoes-do-cliente.md`, e o código (`src/lib/agent/`) pra confirmar ou refutar
cada achado com `file:line`.

---

## NOTAS

| # | Dimensão | Nota |
|---|---|---|
| D1 | Humanização | **5/10** |
| D2 | Não-repetição | **2/10** |
| D3 | Condução | **5/10** |
| D4 | Invariantes | **5/10** |
| D5 | Cobertura | **6/10** |
| D6 | Fidelidade ao mockup | **3/10** |

## NOTA GERAL: **4/10**

## MATADOR PRA PROD: **NÃO**

O sintoma-mor que a cirurgia foi feita pra matar — o agente travando/repetindo quando não
processa algo — está **vivo e documentado em código como comportamento conhecido** (famílias
FIX-262/266/282/286), e dispara nos 4 dossiês. No pior caso (imóvel), o pedido explícito da
cliente (simular Itaú com FGTS de lance) nunca é atendido — 5 vezes seguidas.

---

## Por dimensão, com evidência

### D1 — Humanização: 5/10

**Bom, de verdade:** o espelho de motivo + declaração de objetivo na largada varia genuinamente
por persona e domínio, não é o mesmo texto reciclado:
- auto (t3): *"Entendo bem — quando o carro dá trabalho, atrapalha tudo. Então o objetivo já fica
  claro: te colocar num carro novo, com tranquilidade e sem juros."*
- imóvel (t3): *"Entendo bem — quando a gente consegue ficar perto do trabalho, muda tudo na
  qualidade de vida. Então o objetivo já fica claro: te colocar num apartamento de 400 mil..."*
- serviços (t4): *"Entendo bem — quando a casa fica assim, atrapalha tudo, né. Então o objetivo já
  fica claro: te colocar numa casa renovada, com conforto e tranquilidade."*

Isso é exatamente o que a cirurgia queria: a mesma ESTRUTURA (espelha + declara objetivo), com
PALAVRAS diferentes por conversa. Funciona.

**Ruim:** no turno mais importante da jornada — o reveal, logo após identidade — o agente vira
uma lista de anúncios de pipeline em vez de uma pessoa falando. Isso se repete **nos 4 dossiês,
sem exceção**:
- auto (t6): *"Agora vou recomendar a melhor opção pra você: / Encontramos boas opções na sua
  faixa. Agora vou te mostrar a mais adequada pro seu perfil: / Agora deixa eu te mostrar como
  funciona em detalhes: / Pronto, Madalena..."*
- moto (t6): *"Encontramos 4 boas opções na sua faixa. Vou recomendar a mais adequada pro seu
  perfil: / Agora deixa eu aprofundar os números dessa opção: / Essa opção do Banco do Brasil..."*
- imóvel (t4): *"Agora vou recomendar a melhor opção pra você: / ... Vou destacar a mais adequada
  pro seu perfil agora: / Agora dá uma olhada no detalhe dessa opção: / Pronto, Fernanda!..."*
- serviços (t7): *"Vou trazer as melhores opções... Encontramos 3 boas opções... Agora vou te
  recomendar a mais adequada: / Agora vou simular a melhor opção pra você: / Perfeito! Agora
  deixa eu aprofundar a simulação com o cenário completo, incluindo lance:"*

Isso é o `system-prompt.ts:397-406` proibindo "metacomentário sobre suas próprias decisões" sendo
violado na prática — não é chain-of-thought de regra de negócio, é o agente narrando o PRÓPRIO
plano de execução (tool call a tool call) em vez de dar uma resposta.

### D2 — Não-repetição: 2/10 (o sintoma-mor está vivo)

Esta é a pior dimensão, com a evidência mais grave de toda a rodada. Existe uma família de
fallbacks CANÔNICOS (hardcoded, não gerados pelo modelo) para quando o modelo chama uma tool fora
do toolset da fase ou estoura o cap de tool-calls (`src/lib/agent/orchestrator/directives.ts:450-457`,
`buildToolErrorRecoveryFallback`; disparo em `index.ts:797`). Ela dispara nos **4 dossiês**:

**Imóvel — o caso mais grave da rodada.** Fernanda pede simular Itaú com FGTS como lance. O
agente **nunca entrega essa simulação**, e cai no mesmo loop de "reapresentar as opções" **5 vezes
seguidas**:
- t6: *"Deixa eu reapresentar as opções pra você escolher com segurança..."*
- t7 (Fernanda responde só "Itaú", inequívoco): *"Desculpa, preciso reapresentar as opções pra
  gente ter certeza que você escolheu a Itaú corretamente."*
- t8: *"...Fernanda, as opções que já apareceram aqui pra você continuam valendo. Me diz o nome
  da administradora ou o valor que você quer olhar de novo que eu detalha certinho pra você."*
- t11: *"Desculpa, Fernanda — deixa eu reapresentar as opções pra gente ter certeza que você
  escolheu a Itaú corretamente:"*
- t13: *"Fernanda, deixa eu reapresentar as opções que a gente trouxe pra você escolher com
  segurança — inclui a Itaú:"*

O funil segue avançando por gates (lance → lance-value → embedded_bid) **sem nunca ter
efetivamente simulado o que a cliente pediu 5 vezes**. O coletor marcou "Travou? não" e
"Explicação sobre FGTS foi clara" — isso é falso; a cliente nunca recebeu a simulação, só recebeu
o mesmo fallback enlatado repetido.

**Auto** — a MESMA frase, palavra por palavra, aparece 2 vezes na mesma conversa (t10 e t15):
*"Madalena, as opções que já apareceram aqui pra você continuam valendo. Me diz o nome da
administradora ou o valor que você quer olhar de novo que eu detalha certinho pra você."*
O guard anti-repetição (`index.ts:789-796`, FIX-266) só compara com o ÚLTIMO turno do assistant —
como entre t10 e t15 houve outros turnos, a MESMA frase enlatada pôde reaparecer sem o guard
perceber. Buraco real na proteção.

**Moto** (t10) e **Serviços** (t9) disparam a mesma família de fallback (a variante
"resolvida", que reafirma uma oferta específica — `directives.ts:596-608`,
`buildToolErrorRecoveryResolvedFallback`) exatamente quando o usuário tenta detalhar/simular uma
oferta já citada por nome/valor.

**Conclusão de D2:** o "responder sempre a mesma coisa quando travado" não morreu — ele só se
mudou de regex-no-prompt pra fallback-hardcoded-no-código, disparado por um bug real de
tool-orchestration (o modelo tenta re-chamar `present_comparison_table`/`present_recommendation_card`
fora de fase em vez de `simulate_quota`, que é o que estaria liberado). Isso é pior do ponto de
vista de produto porque é **verbatim idêntico entre conversas diferentes**, não uma variação de
script — é a antítese do "não penalize divergência" da nova filosofia, na direção errada.

### D3 — Condução: 5/10

Todos os 4 chegam ao fim nominal (contract_form / proposta). Mas "chegar ao fim" esconde o
problema real: no caso da imóvel, a cliente pediu 5 vezes uma coisa específica e o agente **nunca
entregou, e simplesmente seguiu adiante pelos gates como se nada tivesse acontecido**. Isso é
pior que travar visivelmente — é uma falha de condução silenciosa que nenhuma métrica de "chegou
até X" pega.

Bem conduzido: serviços domina bem uma negociação de reposicionamento de valor genuinamente
difícil (ver D6/gap #3 sobre se isso é honestidade ou empurrão), e moto/auto mantêm o fio da
meada em perguntas fora do trilho (seguro de acidente, atraso de parcela).

### D4 — Invariantes: 5/10

- **I1 (identidade antes de busca real):** respeitado nos 4 — CPF/celular sempre vêm antes do
  reveal. Bom.
- **I3 (número nunca escrito pelo modelo) / vazamento de mecânica interna:** violado de forma
  clara em imóvel (t4): *"Você tem a Itaú em destaque com **score de 73%**..."* Isso contraria
  uma regra dura e explícita do próprio `system-prompt.ts:677-679` ("Score total >= 0.75 →
  'encaixa muito bem pra você' / 0.5-0.75 → 'boa opção pro seu perfil'" — NUNCA o número cru) e é
  uma **regressão direta contra uma decisão de produto documentada**:
  `src/lib/consorcio/score-label.ts:1-6` registra que em 2026-06-05 o card mostrava "43%
  compatível" e Kairo mandou trocar por rótulo qualitativo justamente porque "% numérico baixo
  mina a confiança". O agente reintroduziu o número cru em prosa.
- **I4 (nunca prometer o que não aconteceu):** nenhuma instância do proibido literal
  ("reservado"/"cota garantida") nos 4 — bom, e o texto de pré-cadastro ("você não paga nada
  agora, é só um pré-cadastro") aparece corretamente nos 4 fechos. Mas moto (t6) diz
  *"contemplação praticamente garantida"* — linguagem de quase-certeza sobre um evento
  probabilístico (sorteio/lance), tensão com o espírito do invariante mesmo sem usar a frase
  proibida.
- **I5 (ressalva de estimativa):** não aparece em texto em nenhum dos 4 dossiês nos turnos de
  contemplation_dial — mas verifiquei o componente (`src/components/chat/artifacts/
  contemplation-dial.tsx:18,285-289`) e ele renderiza a ressalva estaticamente no card
  (`data-testid="dial-disclaimer"`, "...garantida"). **Não crdavo isso como violação** — o
  dossiê é só texto, não captura o card; o invariante parece satisfeito na UI.

### D5 — Cobertura: 6/10

Funciona nos 4 tipos, com vocabulário e nuance de domínio genuínos (delivery/bagageiro na moto,
condomínio separado da parcela no imóvel, reposicionamento de escopo de reforma em serviços). O
desconto vem de os P0/P1 abaixo serem **uniformes nos 4** — não é "funciona em 3, falha em 1", é
"o mesmo bug estrutural aparece igual nos 4", o que fala mais de arquitetura do que de cobertura
por categoria.

### D6 — Fidelidade ao mockup: 3/10

A ordem alto-nível (rapport → motivo/objetivo → valor → identidade) bate com a Rodada 10. Mas a
coreografia fina do reveal — o ponto mais desenhado do mockup — está sistematicamente quebrada:

1. **"Reveal em dois tempos, com consentimento" (decisão Rodada 10, item 4) violado nos 4.** O
   mockup e a decisão documentada mandam: lista sozinha (comparison_table) → só depois do
   CONSENTIMENTO explícito ("Posso te mostrar a opção que eu recomendo?") o hero
   (recommendation_card) aparece. Nos 4 dossiês, o agente narra conteúdo de hero (administradora
   específica + parcela + lance) **no mesmo turno** que emite só `comparison_table`, **antes** de
   qualquer consentimento. Confirma o achado suspeitado: *"ele narra um card que não está na
   tela."* Curiosamente moto (t7) chega a perguntar depois *"Posso te mostrar a opção que eu
   recomendo?"* — mas isso é teatro vazio, porque o Banco do Brasil e seus números já tinham sido
   narrados em detalhe no turno anterior (t6). O texto do consentimento sobreviveu; o
   consentimento em si, não.

2. **"Quem recusou lance pula o hero" (FIX-233, `index.ts:168-171`, `isSoParcela =
   refreshed.qualifyAnswers?.hasLance === "so_parcela"`) parece furado em serviços.** Bruno diz
   (t16) *"Fica só a parcela mesmo. Sem lance não dá pra ficar arriscado."* — recusa explícita de
   lance, o gatilho textual mais próximo de `so_parcela` do dicionário do analyzer
   (`turn-analyzer.ts:174-175`). A resposta do MESMO turno, porém, é *"Ótimo, Bruno. Essa é a que
   eu indicaria pra você..."* com `CARDS: recommendation_card, simulation_result` — o hero que a
   regra deveria ter pulado. O check de `isSoParcela` existe e funciona corretamente **depois**,
   no turno seguinte (t17, `CARDS: two_paths`, `dispatchDecisionCascade`) — mas o hero já tinha
   vazado um turno antes, por um caminho de emissão diferente que não parece consultar a mesma
   flag. Não confirmei a função exata que disparou o `recommendation_card` nesse turno (o
   `present_recommendation_card` está fora do toolset LLM na fase reveal por `tool-policy.ts:172-189`,
   então foi emissão server-side por outro gatilho) — fica como pista de investigação, não como
   fato fechado.

3. **O fecho ("manda um 'oi' pra abrir a janela de 24h") não aparece em nenhum dos 4.** O
   `04-copy-fluxos.md:135-148` é explícito: o agente deveria dizer *"acabei de te mandar uma
   mensagenzinha no seu WhatsApp"* e pedir o "oi" ("Isso deve ser tratado — não assumir que o 'oi'
   sempre vem"). Nos 4 dossiês, o fecho é só *"me compartilha seu WhatsApp?"* seguido de "anotado"
   — e o componente `whatsapp-optin.tsx:88-93` confirma que o card em si também não menciona o
   "oi". **Ressalva epistêmica:** achei `system-prompt.ts:555`, que diz textualmente *"Este canal
   (web) NÃO TEM mensagem proativa — nenhum worker vai mandar nada 'depois' nesta conversa"* — o
   que sugere que esse mecanismo pode ser intencionalmente diferente pro canal web (o "oi" seria
   só pra conversas que já nascem no WhatsApp). Não crаvo isso como bug fechado — é uma divergência
   real do copy-fluxos que merece confirmação do Kairo se é gap ou comportamento by-design
   por canal.

---

## Gaps, do mais grave ao menos grave

### P0 — bloqueia prod

**P0.1 — Pedido explícito do usuário sobre uma oferta nomeada nunca é atendido; loop de fallback
enlatado dispara em vez de responder.**
- Citação: `imovel-web.md` turnos 6, 7, 8, 11, 13 (5 ocorrências); `auto-web.md` turnos 10, 15;
  `moto-web.md` turno 10; `servicos-web.md` turno 9.
- Fere: D2 (não-repetição — o sintoma-mor original) e D3 (condução — pedido nunca resolvido).
- Onde mexe: `src/lib/agent/orchestrator/index.ts:797-899` (gatilho `toolErrorThisTurn` /
  `toolCallCapExceededThisTurn`, escolha de fallback); `src/lib/agent/orchestrator/directives.ts:450-457`
  (`buildToolErrorRecoveryFallback`) e `:596-608` (`buildToolErrorRecoveryResolvedFallback`); a
  causa raiz real está a montante — o modelo tentando chamar `present_comparison_table` /
  `present_recommendation_card` / `search_groups` (fora do toolset em fase `reveal`,
  `tool-policy.ts:152-189`) em vez de `simulate_quota`/`get_group_details` (que ESTÃO liberados,
  `tool-policy.ts:64-77`) quando o usuário pede pra detalhar/simular uma oferta já mostrada.
- Severidade: P0 — em imóvel, a cliente literalmente não conseguiu fazer a única coisa que pediu
  5 vezes.

**P0.2 — Reveal narra conteúdo de hero (administradora específica, parcela, "em destaque", até um
score numérico) sem o card correspondente estar na tela e sem consentimento prévio, nos 4
dossiês.**
- Citação: `auto-web.md` t6 ("A ITAÚ encaixa muito bem... parcela de R$ 3.549,75"), `moto-web.md`
  t6 ("Essa opção do Banco do Brasil é forte pra você..."), `imovel-web.md` t4 ("Você tem a Itaú
  em destaque com score de 73%"), `servicos-web.md` t7. Em todos, `CARDS: comparison_table`
  apenas.
- Fere: D6 (decisão Rodada 10 #4 — reveal em dois tempos com consentimento) e D4 (vazamento de
  score numérico cru em imóvel, contra `system-prompt.ts:677-679` e a decisão registrada em
  `src/lib/consorcio/score-label.ts:1-6`).
- Onde mexe: o ponto exato onde o modelo decide narrar detalhes de uma oferta específica ANTES do
  consentimento — prompt/directive do reveal em `src/lib/agent/system-prompt.ts` (seção ~640-680,
  "Textos de recomendação") e o fluxo de consentimento em `orchestrator/index.ts` (linha ~427,
  `mentionedOfferForConsent`).
- Severidade: P0 — confirma exatamente o achado #2 suspeitado pelo Kairo, presente em 100% das
  conversas, não é caso isolado.

### P1 — grave

**P1.3 — Meta-narrativa de pipeline empilhada no turno de reveal, nos 4 dossiês.**
- Citação: ver trechos completos em D1 acima (auto t6, moto t6, imóvel t4, serviços t7).
- Fere: D1 (humanização) e a regra de cadência do `04-copy-fluxos.md:1-11` ("1 balão = 1 ideia
  completa"; proíbe "Deixa eu buscar…"/"Achei 15 grupos" empilhados) e a proibição explícita de
  metacomentário em `system-prompt.ts:397-406`.
- Onde mexe: provavelmente o directive que orienta a sequência search→recommend→detail no reveal
  deixa o modelo livre para narrar cada chamada — vale revisar o texto do directive nessa
  transição (mesma área do P0.2).
- Severidade: P1 — não quebra invariante, mas é o oposto do "conversa fluida" que a cirurgia
  buscava, e acontece bem no momento mais importante da venda.

**P1.4 — "Quem recusou lance pula o hero" furado por um turno em serviços.**
- Citação: `servicos-web.md` t16 (usuário recusa lance → mesma resposta traz
  `recommendation_card`); confirmado no t17 seguinte que o mecanismo correto existe
  (`CARDS: two_paths`).
- Fere: D6 (decisão FIX-233 documentada em `index.ts:168-171`).
- Onde mexe: `src/lib/agent/orchestrator/index.ts:171` (`isSoParcela`, usado só dentro de
  `dispatchDecisionCascade`) — falta o mesmo check no caminho que emite `recommendation_card`
  fora dessa função (não localizei a função exata — é a pista pro próximo investigador).
  Severidade: P1 (não fecho como certeza absoluta de causa, mas a evidência do transcript +
  código é forte).

**P1.5 — Score numérico cru exposto ("score de 73%").**
- Já citado em P0.2 — listo aqui também porque é um achado autônomo com fonte própria
  (`score-label.ts`) e merece rastreamento separado do problema de coreografia.
- Severidade: P1/P0 — trato como parte do P0.2 acima pra não duplicar contagem.

**P1.6 — Fecho sem o mecanismo "oi" do copy-fluxos, nos 4 dossiês.**
- Citação: `auto-web.md` t18-19, `moto-web.md` t15-17, `imovel-web.md` t16-18, `servicos-web.md`
  t18-19 — todos terminam em "me compartilha seu WhatsApp?" → "anotado", sem o convite a responder
  "oi".
- Fere: D6 (`04-copy-fluxos.md:135-148`).
- Ressalva: `system-prompt.ts:555` sugere que o canal web pode não ter esse mecanismo por design
  (sem worker proativo). **Preciso de confirmação do Kairo** se isso é gap real ou
  comportamento intencional por canal antes de tratar como bug de código.
- Onde mexe (se for gap real): fluxo de emissão do card `whatsapp_optin` em `orchestrator/index.ts:1000`
  e a copy do card em `src/components/chat/artifacts/whatsapp-optin.tsx:88-93`.

### P2 — polimento

**P2.7 — Fallback enlatado repete-se verbatim não-consecutivamente na mesma conversa (auto t10 =
t15), porque o guard anti-repetição só compara com o ÚLTIMO turno do assistant.**
- Onde mexe: `src/lib/agent/orchestrator/index.ts:789-796` (comparação só com
  `lastAssistantText`).
- Nota à parte: o texto do dossiê diz "...que eu **detalha** certinho pra você" em 3 ocorrências
  (auto t10/t15, imóvel t8, moto t10), mas o código atual (`directives.ts:455`) tem "...que eu
  **detalho** certinho pra você" (1ª pessoa correta). Não sei se é drift de ambiente (homologação
  rodando build diferente deste branch) ou imprecisão do coletor ao transcrever — acendo como
  ponto de checagem, não como bug fechado.

**P2.8 — Fragmento de frase quebrado, sem referente: "Fica mais de 7x acima."**
- Citação: `servicos-web.md` t12, isolado entre dois parágrafos coerentes.
- Provável origem: aplicação malsucedida do template de `system-prompt.ts:671` (monthlyFit < 0.5,
  "fica R$ {parcela - teto} acima do seu teto declarado de R$ {teto}") — mas Bruno nunca declarou
  um teto de orçamento nesta conversa, o que é suspeito (de onde viria o "7x"?). Fere D1 (soa
  quebrado, não humano) e levanta dúvida sobre D4 (número sem fonte clara — não fechei se é
  cálculo real ou alucinado, fica como hipótese aberta).

**P2.9 — "Contemplação praticamente garantida" (moto t6).**
- Linguagem de quase-certeza sobre evento probabilístico; não usa a frase proibida literal, mas
  tensiona o espírito de I4.

**P2.10 — Inconsistência lógica no lance embutido (auto t12).**
- *"Desses 39 mil, a gente consegue usar até R$ 39.000 como lance embutido... então você não
  precisa desembolsar **tudo** em dinheiro agora."* Se os R$39.000 inteiros podem ser embutidos,
  a frase deveria dizer "não precisa desembolsar **nada**", não "tudo" — como está, sugere que
  ainda sobra parte em dinheiro, contradizendo o "até R$39.000" anterior. Confuso pro usuário
  entender quanto precisa ter em mãos.

---

## O que está BOM (sem gentileza)

- **Espelho de motivo + declaração de objetivo na largada** (D1): genuinamente variado por
  persona, cita a situação real do usuário nas próprias palavras (oficina/carro quebrado;
  perto do trabalho; casa com mofo). Não é o mesmo script.
- **I1 (identidade antes de busca real):** 4/4, sem exceção — nenhuma tentativa de simular antes
  de CPF+celular.
- **Nenhuma instância do proibido literal "reservado"/"cota garantida"** nos 4 fechos — e o texto
  de pré-cadastro ("você não paga nada agora, é só um pré-cadastro, o pagamento só começa quando
  chegar o boleto") aparece corretamente e de forma consistente nos 4.
- **Respostas a perguntas fora do trilho são boas de verdade:** seguro de acidente de moto (t13
  moto), condomínio separado da parcela (t9 imóvel), atraso de parcela no consórcio (t9 auto) —
  todas coerentes, específicas do domínio, sem enrolação.
- **Reposicionamento de crédito em serviços (30k→45k) é honesto, não é empurrão de venda:** o
  agente mostra os números dos dois cenários lado a lado (R$3.006 vs R$693,54), deixa a decisão
  explícita com o usuário duas vezes ("faz sentido pra você esticar a reforma?"), e quando Bruno
  reafirma "sem lance, fica só a parcela mesmo", o agente aceita sem insistir. É consultivo.
- **Domínio genuíno por categoria:** vocabulário de delivery/bagageiro na moto, nuance de FGTS e
  condomínio no imóvel, re-escopo de reforma em serviços — não é o mesmo texto com find-replace de
  substantivo.

---

## Resumo objetivo pro Kairo

- **Notas:** D1=5, D2=2, D3=5, D4=5, D5=6, D6=3 → **geral 4/10**.
- **Matador pra prod: NÃO.**
- **P0 (2):** loop de fallback enlatado quando o usuário nomeia/detalha uma oferta (pior em
  imóvel, 5× seguidas, pedido nunca atendido); reveal narra hero sem consentimento/sem o card
  correspondente nos 4 dossiês (inclui vazamento de score numérico cru em imóvel, regressão
  contra decisão documentada em `score-label.ts`).
- **P1 (3):** meta-narrativa de pipeline empilhada no reveal (4/4); regra "quem recusa lance pula
  o hero" furada por 1 turno em serviços; fecho sem o mecanismo "oi" do copy-fluxos (ressalva:
  pode ser by-design pro canal web — checar com Kairo).
- **P2 (4):** fallback verbatim repetido não-consecutivo; grafia "detalha" vs "detalho" (checar
  drift de ambiente); frase quebrada sem referente em serviços; "contemplação praticamente
  garantida"; inconsistência no cálculo de lance embutido em auto.

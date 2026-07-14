# Veredito — RODADA 2 (8 dossiês: auto/moto/imóvel/serviços × web/whatsapp)

Juiz: Sonnet, contexto fresco, olhar adversarial. Julguei só o transcript literal dos 8 arquivos em
`evidencias/rodada-2/{auto,moto,imovel,servicos}-{web,whatsapp}.md` — ignorei toda "Observação" do
coletor (usei-as no máximo como ponteiro de onde olhar, nunca como veredito) e voltei ao código
(`src/lib/agent/`, `src/lib/whatsapp/`, `src/lib/bevi/`, `src/lib/web/`) pra confirmar ou refutar
cada achado com `file:line`.

Referências usadas: `docs/design/specs/2026-07-09-handoff-agente-vendas-consorcio/mockups/
aja-dois-cenarios.html`, `docs/design/specs/.../docs/04-copy-fluxos.md`,
`docs/jornada/decisoes-do-cliente.md` (I1-I6), `veredito-web-rodada-1.md`, `veredito-whatsapp-
rodada-1.md`.

---

## NOTAS

| # | Dimensão | Nota |
|---|---|---|
| D1 | Humanização | **4/10** |
| D2 | Não-repetição | **2/10** |
| D3 | Condução | **3/10** |
| D4 | Invariantes | **3/10** |
| D5 | Cobertura | **5/10** |
| D6 | Paridade + fidelidade ao mockup | **2/10** |

## NOTA GERAL: **3/10**

## MATADOR PRA PROD: **NÃO**

Não é um 6 disfarçado de 10 — é pior que isso. Dos 10 fixes anunciados, pelo menos **três P0 da
Rodada 1 seguem vivos, byte-a-byte, em código**: o fallback enlatado (`buildToolErrorRecoveryFallback`,
ainda dispara em 5 dos 8 dossiês), o turno morto pós-CPF no WhatsApp (100% dos 4 dossiês WhatsApp,
pior que antes — na jornada `auto` leva **6 turnos** e ainda gera uma pergunta duplicada), e o
"pedido de WhatsApp dentro do WhatsApp" (100% dos 4 fechos WhatsApp — root cause confirmada em
`src/lib/bevi/closing-presentation.ts`, função nunca recebeu um parâmetro "canal atual"). Além
disso, a rodada 2 **descobre uma classe nova e mais grave de bug**: o agente inventa o nome de uma
administradora que nunca esteve entre as opções reais da Bevi — duas vezes, em dois domínios
diferentes (`imovel-web`: Bradesco; `servicos-web`: Estrela) — e só admite o próprio erro, de forma
confusa, vários turnos depois.

---

## Por dimensão, com evidência

### D1 — Humanização: 4/10

**Ainda bom:** o espelho de motivo + objetivo continua variando de verdade por persona (não é
reciclagem de texto):
- `auto-web` t4: *"Entendo bem — quando o carro dá trabalho, atrapalha tudo mesmo."*
- `imovel-web` t4: *"Entendo bem — quando a gente tá pagando aluguel, o dinheiro some todo mês sem
  deixar nada seu."*
- `servicos-web` t4: *"Entendo bem — quando a casa pede reforma, muda tudo de qualidade de vida."*

**Ruim, ainda vivo (D1 da rodada 1, P1.3):** o reveal continua empilhando 2 a 4 anúncios de
pipeline no MESMO turno, em vez de uma fala:
- `auto-web` t6: *"Encontramos 23 opções boas pra você! Bora ver a melhor: Deixa eu ajustar isso.
  Vou apresentar as melhores opções pra você escolher: Agora o detalhe da simulação pra você
  entender melhor como fica: Essa é a opção que mais se destaca na sua faixa de crédito,
  Madalena."* — quatro anúncios empilhados ("Bora ver a melhor", "Deixa eu ajustar isso", "Vou
  apresentar...", "Agora o detalhe...") antes mesmo de qualquer pergunta de consentimento.
- `servicos-web` t5: *"Deixa eu apresentar as opções pra você: Ótimo, agora vou mostrar os
  detalhes:"* — dois anúncios empilhados.
- `moto-whatsapp` t5: *"Deixa eu apresentar as opções pra você escolher. Pronto, Mario! Separei as
  4 opções pra você — a recomendação está detalhada acima..."*
- `imovel-whatsapp` t7: *"Agora vou apresentar a melhor opção junto com as outras... Deixa eu
  mostrar todas as opções... Vou usar o ID exato que veio da busca:... Vou mostrar o detalhe dessa
  opção forte pra você:"* — quatro anúncios empilhados na mesma mensagem.

Isso é a mesma violação de `system-prompt.ts:397-406` (proíbe metacomentário sobre a própria
decisão/execução) já flagada como P1.3 na rodada 1 — **não morreu**; aparece em 6 dos 8 dossiês
(exceção real: `moto-web` t4, que é limpo, uma ideia só).

**Novo problema de humanização:** duas jornadas WhatsApp fazem o usuário **responder a mesma
pergunta duas vezes** porque o agente empilhou duas perguntas no mesmo balão e perdeu a primeira
resposta (ver D2/D6 abaixo — `auto-whatsapp` t4→t7, `imovel-whatsapp` t3→t7). Robótico na cara.

### D2 — Não-repetição: 2/10 (o sintoma-mor NÃO morreu)

O fallback `buildToolErrorRecoveryFallback` (`src/lib/agent/orchestrator/directives.ts:452-457`,
texto *"as opções que já apareceram aqui pra você continuam valendo"*) ainda dispara, verbatim ou
em variante próxima, em **5 dos 8 dossiês**:

- `moto-web` t15: *"Perfeito, Mario. Então deixa eu confirmar com você: Mario, as opções que já
  apareceram aqui pra você continuam valendo. Me diz o nome da administradora ou o valor que você
  quer olhar de novo que eu detalho certinho pra você."*
- `auto-whatsapp` t12: *"Madalena, as opções que já apareceram aqui pra você continuam valendo. Me
  diz o nome da administradora ou o valor que você quer olhar de novo que eu detalhe certinho pra
  você."*
- `moto-whatsapp` t13: mesmo texto, trocando o nome.
- `imovel-web` t10: variante ("Deixa eu reapresentar as opções pra você escolher a Bradesco
  direto.").
- `servicos-web`: variante disparada **3 VEZES na mesma conversa** — t9 (*"Bruno, desculpa — deixa
  eu reapresentar as três opções pra você escolher a Estrela direto na tabela"*), t11 (*"Bruno,
  deixa eu reapresentar as opções pra você escolher a Estrela direto"*), t12 (*"Bruno, deixa eu
  reapresentar as três opções pra você de novo — aí você escolhe a Estrela direto"*). Nas 3 vezes,
  o pedido do usuário ("simula a Estrela") **nunca é atendido** — o mesmo padrão do pior caso da
  rodada 1 (imóvel, 5×), só que agora com um agravante: a "Estrela" **nunca existiu** entre as
  opções reais (ver D4/gap #1).

**Repetição literal nova:** `servicos-whatsapp` t11 e t12 emitem o **mesmo parágrafo, palavra por
palavra**, sobre lance embutido ("Deixa eu te explicar o lance embutido rapidinho — fica tranquilo,
a gente te ajuda...") em dois turnos consecutivos. `imovel-whatsapp` t7 duplica a pergunta "Você já
fez consórcio antes?" (com botões) **duas vezes dentro do mesmo turno**.

**Melhora real, mas parcial:** `imovel-web` (pior caso da rodada 1, 5× loop) desta vez resolve em 2
turnos (t10 falha, t11 entrega a simulação da ITAÚ) — genuína melhora pontual. Mas essa melhora é
anulada pelo novo caso em `servicos-web`, que reproduz a MESMA gravidade (3×, nunca resolvido).

### D3 — Condução: 3/10

**Turno morto pós-CPF: 4 de 4 dossiês WhatsApp, sem exceção** — todos emitem literalmente *"Perfeito,
recebido! Já vou buscar as melhores opções."* e então **nada mais** até a próxima mensagem do
usuário:
- `auto-whatsapp` t6, `moto-whatsapp` t4, `imovel-whatsapp` t5, `servicos-whatsapp` t4.

No pior caso (`auto-whatsapp`), o problema não se resolve na próxima mensagem — leva **6 turnos**
(t6→t12) até aparecer qualquer opção real, e no caminho o agente pergunta o motivo ("o que fez você
decidir agora por um carro novo?") **duas vezes** porque a pergunta tinha sido empilhada com o
pedido de CPF no mesmo balão (t4) e a resposta do usuário (t5) foi descartada — o agente pergunta de
novo em t7 como se nunca tivesse perguntado.

**"Acho que me perdi" confirmado** — exatamente o fallback de turno vazio que Kairo suspeitava:
- `moto-web` t12: usuário confirma "ok, tá certo" após o agente dizer "Vou apresentar os números
  pra você ver direitinho:" (sem entregar nada) → AGENTE: *"Acho que me perdi por aqui. Pode mandar
  de novo, por favor?"*

**Falha de condução silenciosa em `servicos-web`:** Bruno pede "simula a Estrela" 3 vezes (t9, t11,
t12) e a conversa avança pra outra administradora (Âncora) sem nunca dizer claramente, na hora, que
a Estrela não existe — só revela isso de forma indireta e tardia em t12 ("Mas você perguntou sobre
a Estrela — ela não ficou entre essas três"). O funil "chega ao fim" (proposta Âncora), mas o
pedido do usuário nunca foi atendido nem claramente recusado — mesma classe de falha do P0.1 da
rodada 1 (imóvel).

### D4 — Invariantes: 3/10 (duas alucinações de oferta, novas e graves)

**NOVO — nome de administradora inventado, fora das opções reais (I2), 2 casos:**

1. `imovel-web` t8: o agente recomenda *"A recomendada no topo (Bradesco) é a que melhor
   equilibra..."* — mas o `CARDS: comparison_table` de t6 nunca listou nomes, e em t10 o próprio
   agente se contradiz: *"Não achei a Bradesco exatamente nessa faixa, Fernanda — as opções que
   temos são ITAÚ, Banco do Brasil, Âncora, Canopus, Tradição e Rodobens."* Bradesco nunca existiu
   entre as opções reais. Confirmado pelo Kairo como suspeita — **confirmado com citação literal**.
2. `servicos-web`: o agente introduz "Estrela" como a opção recomendada em t8 (*"essa que mostrei
   primeiro (a Estrela) tem uma compatibilidade ótima..."*), mas t9 termina simulando Rodobens (não
   Estrela); t11 falha de novo; e t12 revela: *"Bruno, olha — nas opções que a gente tem aqui, a
   Âncora é a que chega mais perto do que você pediu... Mas você perguntou sobre a Estrela — ela
   não ficou entre essas três."* — confirma que "Estrela" foi alucinada e nunca esteve entre as 3
   opções reais (Rodobens, Âncora, e uma terceira nunca revelada por nome).

Isso é uma violação direta de I2 (proibido dado mockado em runtime) e mais grave que o achado da
rodada 1 (score numérico cru): ali o número existia mas era exposto errado; aqui a
**entidade inteira é fabricada** — o oposto do "nunca aja sobre entidade não-ancorada" (lei de
arquitetura de IA).

**Melhorou, confirmado:**
- **CPF nunca mais vaza em texto plano no WhatsApp** — mascarado corretamente nos 4 dossiês
  (*"CPF 028.•••.•••-38"*, auto/moto/imóvel/serviços-whatsapp) — o I6 da rodada 1 (G3) parece
  corrigido.
- **Score numérico cru não aparece em nenhum dos 8 dossiês** — o P0.2 (parte "score de 73%") da
  rodada 1 parece corrigido.
- **CPF pedido 2× não se repete** nos 8 dossiês (quando repete o pedido é porque o usuário
  literalmente não mandou o CPF na mensagem anterior — comportamento correto).
- **"Sua proposta já saiu" com prova de banco zerada (G2, rodada 1)** não reaparece — cada dossiê
  WhatsApp mostra um link `uselink.me/...` DISTINTO por conversa, sugerindo geração real. **Não
  verifiquei `bevi_proposals` no banco** — fica como melhora plausível, não fato fechado.

**Tensão leve (P2):** `auto-web` t19: *"Quando chegar, é só confirmar lá mesmo que a sua reserva
fica 100% garantida."* — "100% garantida" aplicado a uma ação futura (confirmar um e-mail que ainda
não chegou) tensiona o espírito de I4, mesmo sem usar a frase literalmente proibida.

### D5 — Cobertura: 5/10

Os 8 dossiês chegam nominalmente ao fim (proposta/reserva). Mas a análise por tipo mostra que os
bugs mais graves não são uniformes — são **concentrados**: as duas alucinações de oferta batem 2 dos
4 verticais (imóvel, serviços); o turno morto pós-CPF bate 4 de 4 do WhatsApp; a duplicação de
pergunta bate 2 de 4 do WhatsApp. Cobertura funcional nominal é 8/8, mas cobertura de qualidade real
é desigual — moto (web e whatsapp) é consistentemente o domínio mais limpo dos 8.

### D6 — Paridade + fidelidade ao mockup: 2/10

**P0 confirmado com causa em código — "pedido de WhatsApp dentro do WhatsApp" (G4 da rodada 1)
NÃO foi corrigido, aparece em 100% dos 4 fechos WhatsApp:**

- `auto-whatsapp` t16, `moto-whatsapp` t16, `imovel-whatsapp` t25, `servicos-whatsapp` t14 — todos
  terminam dizendo *"Pra gente seguir, olha só: acabei de te mandar uma mensagenzinha no seu
  WhatsApp. Me responde por lá com um 'oi'? É só pra você já salvar o nosso contato."* — dito a um
  usuário que já está, agora mesmo, dentro dessa mesma conversa de WhatsApp. Não existe mensagem
  nova nenhuma; pedir "oi" pra "salvar o contato" não faz sentido no canal em que ele já está
  conversando.
- Causa confirmada em código: `src/lib/bevi/closing-presentation.ts:120-180`
  (`closingPresentation`) monta esse texto (`pedirOiText`, linhas 125-128, e o "oi" fixo na linha
  173) **sem nenhum parâmetro de canal atual** — só sabe distinguir "mandei agora" vs. "vou mandar
  quando a janela abrir" (`opts.whatsappChannel`, FIX-265), nunca "o canal atual já É o WhatsApp,
  não precisa desse texto". `src/lib/whatsapp/interactive-handlers.ts:169` chama
  `closingPresentation(res)` (sem opts) exatamente no handler de `offer_confirm` do próprio
  WhatsApp — o mesmo texto do fluxo web reaproveitado sem guarda de canal. O teste existente
  (`src/app/api/chat/offer-confirm-whatsapp-channel-gate.test.ts`) cobre só a distinção
  enviado/enfileirado — **não cobre** o caso "canal atual = WhatsApp".
- É estruturalmente o MESMO defeito do G4 da rodada 1 (`whatsapp-optin-guard.ts` sem checar
  `channel`), só que manifestado por uma função diferente (`closingPresentation`). A cirurgia
  corrigiu um sintoma da árvore errada.

**Reveal em dois tempos com consentimento (decisão Rodada 10) ainda quebrado em 3 dos 4 web:**
- `auto-web` t6 narra *"Essa é a opção que mais se destaca na sua faixa de crédito, Madalena"*
  **antes** de perguntar consentimento (a pergunta *"Posso te mostrar a opção que eu recomendo?"*
  só vem em t7 — teatro vazio, mesmo achado da rodada 1 P0.2).
- `imovel-web` t6 já entrega detalhe de lance específico da opção "recomendada" (*"Se você der um
  lance de 68% da carta, consegue ser contemplada em torno de 6 meses"*) no mesmo turno da
  `comparison_table`, antes de qualquer consentimento.
- `servicos-web` t5 narra a parcela exata da opção "recomendada" antes do consentimento.
- Único limpo: `moto-web` t4 — uma ideia por balão, sem narrar hero antes da hora.

**Nova inconsistência entre domínios sobre "quem recusa lance pula o hero":** o próprio código
documenta que essa regra foi **removida de propósito** — `src/lib/agent/qualify-state.ts:290-296`
(comentário do FIX-314, decisão de produto do Kairo, rodada 10): *"a exceção 'PULA quando
hasLance==='so_parcela'' foi REMOVIDA... a recomendação é útil independente de o usuário dar lance
ou não"* — ou seja, hoje o hero deveria ser **universal**. Mas:
- `moto-web`: Mario diz "não quero comprometer além da parcela" (t8) e **nunca vê** um
  `recommendation_card`/hero — pula direto pra `two_paths` (t15). Contraria o que o próprio código
  diz que é a regra atual.
- `servicos-web`: Bruno responde `[gate lance: no]` (t13) e o agente **empurra `embedded_bid`** no
  mesmo turno — nem pula pro hero universal, nem devolve a decisão via `two_paths` como o mockup
  do Fluxo B manda. É um terceiro comportamento, diferente dos outros dois.
- As 3 jornadas que tocam nesse ponto (`auto`/`imovel` sempre mostram hero; `moto` nunca mostra;
  `servicos` empurra lance embutido) são **3 comportamentos diferentes para a mesma decisão do
  usuário** — o oposto de paridade, e uma delas contradiz o próprio comentário do código-fonte.

---

## Gaps, do mais grave ao menos grave

### P0 — bloqueia prod

**P0.1 — Alucinação de administradora inexistente, 2 domínios (imóvel, serviços).**
- Citação: `imovel-web.md` t8/t10 (Bradesco); `servicos-web.md` t8/t9/t11/t12 (Estrela).
- Fere: D4 (I2 — proibido dado mockado) e D2/D3 (o pedido do usuário nunca é atendido enquanto o
  nome fantasma está em jogo).
- Onde mexe: ponto onde o modelo nomeia/recomenda uma opção do `comparison_table` — provavelmente o
  directive do reveal em `src/lib/agent/system-prompt.ts` (mesma área ~640-680 já apontada na
  rodada 1) mais o tool-policy que deveria restringir nomes citáveis aos `groupId`s retornados pela
  busca real (`tool-policy.ts`). Não fechei a função exata — é pista prioritária pro próximo
  investigador.
- Severidade: **P0** — pior que o achado equivalente da rodada 1 (score numérico), porque não é um
  número errado, é uma entidade inteira fabricada.

**P0.2 — "Pedido de WhatsApp dentro do WhatsApp" (G4 da rodada 1) — 100% dos 4 fechos WhatsApp,
causa em código confirmada.**
- Citação: `auto-whatsapp.md` t16, `moto-whatsapp.md` t16, `imovel-whatsapp.md` t25,
  `servicos-whatsapp.md` t14.
- Onde mexe: `src/lib/bevi/closing-presentation.ts:120-180` (função `closingPresentation`, sem
  parâmetro de canal atual) + `src/lib/whatsapp/interactive-handlers.ts:169` (chama sem opts).
- Severidade: **P0** — regressão idêntica em espírito ao G4 já reportado, não corrigida.

**P0.3 — Fallback enlatado ("as opções que já apareceram aqui pra você continuam valendo" e
variantes "deixa eu reapresentar as opções") — 5 de 8 dossiês, incluindo um novo loop de 3× em
`servicos-web`.**
- Citação: `moto-web.md` t15; `imovel-web.md` t10; `servicos-web.md` t9/t11/t12 (3×);
  `auto-whatsapp.md` t12; `moto-whatsapp.md` t13.
- Onde mexe: `src/lib/agent/orchestrator/directives.ts:452-457`
  (`buildToolErrorRecoveryFallback`), disparo em `orchestrator/index.ts` quando o modelo tenta
  chamar tool fora de fase — mesma causa raiz identificada na rodada 1, ainda não resolvida na
  origem (o modelo continua tentando as tools erradas fora de fase).
- Severidade: **P0** — era o sintoma-mor da cirurgia; segue vivo.

**P0.4 — Turno morto pós-CPF no WhatsApp — 4 de 4 dossiês, pior caso 6 turnos com pergunta
duplicada.**
- Citação: `auto-whatsapp.md` t6 (some por 6 turnos até t12); `moto-whatsapp.md` t4;
  `imovel-whatsapp.md` t5; `servicos-whatsapp.md` t4 — todos: *"Perfeito, recebido! Já vou buscar
  as melhores opções."* seguido de nenhum resultado no mesmo turno.
- Onde mexe: `src/lib/whatsapp/processor.ts:129-138` (chama `runSearchSummaryWithOrchestrator`
  logo após confirmar identidade) + `src/lib/whatsapp/adapter.ts:537-573`
  (`runSearchSummaryWithOrchestrator`, guard `searchDispatched`/FIX-339). O código já tem um guard
  (`guardEmptyTurn`) desenhado pra nunca fechar o turno em silêncio — na prática, os 4 dossiês
  mostram exatamente esse silêncio. **Ressalva epistêmica:** não consigo distinguir, só pelo
  transcript, se é (a) bug de lógica (guard falha) ou (b) latência real da Bevi que o guard não
  cobre no MESMO turno (só garante retry no turno seguinte, não entrega síncrona). De qualquer
  forma, do ponto de vista do produto, o convite do Kairo ("busca no mesmo turno?") tem resposta
  objetiva: **não, em nenhum dos 4**.
- Severidade: **P0** — pior experiência possível logo após o dado mais sensível da conversa (CPF).

### P1 — grave

**P1.5 — Reveal narra conteúdo de hero antes do consentimento, 3 de 4 dossiês web.**
- Citação: `auto-web.md` t6, `imovel-web.md` t6, `servicos-web.md` t5 (ver D6 acima).
- Onde mexe: mesma área apontada na rodada 1 — `system-prompt.ts` (~640-680) e
  `orchestrator/index.ts` (~427, `mentionedOfferForConsent`).
- Severidade: **P1** — não quebra invariante duro, mas é a mesma coreografia quebrada de P0.2 da
  rodada 1, sem correção.

**P1.6 — "Quem recusa lance" tem 3 comportamentos diferentes em 3 domínios, um deles contrariando
o próprio código-fonte.**
- Citação: `moto-web.md` (nunca mostra hero) vs. `servicos-web.md` t13 (empurra `embedded_bid`) vs.
  comentário do FIX-314 em `src/lib/agent/qualify-state.ts:290-296` (hero deveria ser universal).
- Severidade: **P1** — paridade quebrada entre domínios, e ao menos um caminho não bate com a
  intenção documentada no próprio código.

**P1.7 — Meta-narrativa de pipeline empilhada no reveal, 6 de 8 dossiês.**
- Citação: ver D1 (`auto-web` t6, `servicos-web` t5, `moto-whatsapp` t5, `imovel-whatsapp` t7 —
  entre outros).
- Severidade: **P1** — mesma violação de `system-prompt.ts:397-406` já flagada como P1.3 na rodada
  1, sem correção visível.

**P1.8 — Motivo perguntado 2× por empilhar 2 perguntas no mesmo balão (viola decisão 2026-07-11
item 3), 2 de 4 WhatsApp.**
- Citação: `auto-whatsapp.md` t4 (*"E o que fez você decidir agora por um carro novo? Me manda seu
  CPF..."*) → t5 usuária responde só o motivo → t7 o agente pergunta de novo, como se nunca tivesse
  perguntado; `imovel-whatsapp.md` t3 (mesma stacking) → t7 repete a pergunta do "gatilho".
- Fere: D1/D2 e a decisão registrada em `docs/jornada/decisoes-do-cliente.md` ("nunca duas
  perguntas no mesmo balão").
- Severidade: **P1** — força o usuário a se repetir, robótico.

### P2 — polimento

**P2.9 — "Acho que me perdi" (fallback de turno confuso) — `moto-web.md` t12.**
- Confirma a suspeita pontual do Kairo. Isolado (só 1 ocorrência nos 8), mas é exatamente o padrão
  que a cirurgia queria extinguir.

**P2.10 — Repetição literal do parágrafo de lance embutido em 2 turnos consecutivos —
`servicos-whatsapp.md` t11/t12.**

**P2.11 — Duplicação de pergunta com botões dentro do MESMO turno — `imovel-whatsapp.md` t7**
("Você já fez consórcio antes?" aparece 2× com botões 2× na mesma mensagem).

**P2.12 — "100% garantida" aplicado a ação futura — `auto-web.md` t19** (tensiona I4 sem usar a
frase literal proibida).

---

## O que MELHOROU vs. a rodada 1 (sem gentileza, mas honesto)

- **CPF nunca mais vaza em texto plano no WhatsApp** — mascarado corretamente nos 4 dossiês
  (era G3/P0 na rodada 1).
- **Score numérico cru desapareceu** — não achei "score de X%" em nenhum dos 8 dossiês (era
  P0.2/P1.5 na rodada 1).
- **CPF pedido 2× sem motivo não se repete** — quando repete é porque o usuário de fato não mandou.
- **"Sua proposta já saiu" com banco zerado (G2)** não reaparece — links `uselink.me` distintos por
  conversa sugerem geração real (não verificado no banco, mas plausível).
- **`imovel-web` (pior caso da rodada 1, loop de 5×) resolve em 2 turnos desta vez** — melhora
  pontual real, ainda que anulada por um caso novo igualmente grave em `servicos-web`.
- **`moto-web` e `moto-whatsapp` são hoje os dois dossiês mais limpos dos 8** — cadência de 1 ideia
  por balão, sem hero prematuro, sem alucinação de oferta.

## O que ainda está ruim (ou piorou)

- **O sintoma-mor (fallback enlatado) não morreu** — 5 de 8 dossiês, incluindo um loop de 3× novo
  em `servicos-web` que nunca resolve o pedido do usuário.
- **Turno morto pós-CPF no WhatsApp: 4 de 4, sem exceção** — no pior caso, 6 turnos de confusão com
  pergunta duplicada.
- **"Pedido de WhatsApp dentro do WhatsApp": 4 de 4 fechos WhatsApp** — bug estrutural idêntico ao
  G4 da rodada 1, agora com causa raiz localizada numa função diferente
  (`closing-presentation.ts`) que nunca ganhou um parâmetro de canal.
- **Duas alucinações de administradora inexistente** (achado novo, mais grave que qualquer coisa
  reportada na rodada 1 nesta dimensão) — o agente inventa e depois se contradiz sobre o nome de
  uma oferta que nunca existiu.
- **Meta-narrativa empilhada no reveal** — 6 de 8 dossiês, sem melhora visível.
- **"Quem recusa lance pula o hero" agora tem 3 comportamentos diferentes** entre domínios, um deles
  indo contra o que o próprio comentário do código diz ser a regra atual (FIX-314).

---

## Resumo objetivo pro Kairo

- **Notas:** D1=4, D2=2, D3=3, D4=3, D5=5, D6=2 → **geral 3/10**.
- **Matador pra prod: NÃO.** Pior ou igual à rodada 1 nas dimensões mais críticas (D2/D3/D6), apesar
  de melhoras reais e confirmadas em invariantes específicos (CPF mascarado, score numérico sumiu).
- **P0 (4):** alucinação de administradora inexistente (imóvel + serviços, achado NOVO); "pedido de
  WhatsApp dentro do WhatsApp" ainda em 100% dos fechos WhatsApp (causa em
  `closing-presentation.ts`); fallback enlatado ainda em 5/8 dossiês; turno morto pós-CPF em 4/4
  WhatsApp (pior caso: 6 turnos).
- **P1 (4):** reveal narra hero antes do consentimento em 3/4 web; "quem recusa lance" tem 3
  comportamentos diferentes entre domínios (um contraria o próprio código); meta-narrativa
  empilhada em 6/8; motivo perguntado 2× em 2/4 WhatsApp por empilhar perguntas no mesmo balão.
- **P2 (4):** "Acho que me perdi" confirmado (moto-web); repetição literal de parágrafo em 2 turnos
  (servicos-whatsapp); duplicação de pergunta+botões no mesmo turno (imovel-whatsapp); "100%
  garantida" aplicado a ação futura (auto-web).

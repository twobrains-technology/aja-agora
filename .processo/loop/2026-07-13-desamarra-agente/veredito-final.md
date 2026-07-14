# Veredito — RODADA FINAL (8 dossiês: auto/moto/imóvel/serviços × web/whatsapp)

Juiz: Sonnet, contexto fresco, olhar adversarial. Julguei o transcript literal dos 8 arquivos em
`evidencias/rodada-final/{auto,moto,imovel,servicos}-{web,whatsapp}.md` — ignorei toda
"Observação"/"RESUMO" escrita pelo coletor. Todo achado abaixo foi confirmado por `grep` literal
nos 8 arquivos (comandos reproduzíveis) e, onde fez diferença pro veredito, cruzado com o código
(`src/lib/agent/qualify-state.ts`, `src/lib/agent/orchestrator/{index,directives,gate-questions}.ts`).

Referências: `docs/design/specs/2026-07-09-handoff-agente-vendas-consorcio/mockups/aja-dois-cenarios.html`
(mockup F1/Madalena e F2/Mario), `docs/jornada/decisoes-do-cliente.md` (I1-I6 + linha do tempo),
`CLAUDE.md` ("Não engesse o agente").

---

## NOTAS

| # | Dimensão | Nota |
|---|---|---|
| D1 | Humanização | **6/10** |
| D2 | Não-repetição | **5/10** |
| D3 | Condução | **6/10** |
| D4 | Invariantes | **8/10** |
| D5 | Cobertura | **9/10** |
| D6 | Paridade + fidelidade ao mockup | **4/10** |

## NOTA GERAL: **6/10**

## MATADOR PRA PROD: **NÃO**

Os dois sintomas-mãe da campanha sumiram de vez e isso é real: **"Acho que me perdi" — zero
ocorrências nos 8** (`grep -rn "Acho que me perdi" .` não bate em nenhum arquivo) e as respostas a
"não entendi"/"tem Bradesco?" variam de verdade, com números e frases diferentes por jornada, sem
nenhuma administradora inventada. As 8 jornadas chegam todas até reserva confirmada.

Mas isso não é 10/10 — é 6, porque **dois dos cinco fixes recentes reaparecem quebrados na própria
evidência final que deveria prová-los fechados**, e porque o canal web diverge do mockup exatamente
no fecho da jornada:

1. **FIX-353/354 (cards duplicados no mesmo turno) regrediu** — `moto-web.md:70-74` (Turno 14)
   emite `scarcity, decision_prompt, scarcity, decision_prompt` e o TEXTO também vem duplicado
   dentro do mesmo turno.
2. **FIX-355 (fala do modelo > fallback enlatado) não fechou o caminho todo** — `moto-whatsapp.md:58`
   (Turno 14) ainda cospe *"Mario, as opções que já apareceram aqui pra você continuam valendo"*
   (`buildToolErrorRecoveryFallback`, `src/lib/agent/orchestrator/directives.ts:495-498`) grudado
   do lado da fala real do modelo, não no lugar dela — pior ainda: parece disparar mesmo o modelo
   tendo falado corretamente.
3. **O canal web nunca faz o fecho/handoff pro WhatsApp que o mockup usa nos DOIS cenários**
   (`FECHO()`, linhas 310-316 do mockup) — nenhuma das 4 jornadas web pede RG/CNH, nenhuma manda
   "confirma com um oi", nenhuma menciona "especialista chama em minutos". As 4 fecham com um
   genérico "você recebe o link/a carta de crédito" — divergência confirmada por grep (as únicas
   ocorrências de "chama"/"oi" nos 4 arquivos `-web.md` são falsos positivos da própria abertura,
   não do fecho).

---

## Por dimensão, com evidência

### D1 — Humanização: 6/10

**Onde funciona de verdade:** as respostas a "não entendi" reformulam com números e ângulos
diferentes por jornada — `auto-web.md:58`, `imovel-web.md:59`, `servicos-web.md:64`,
`auto-whatsapp.md:26`, `imovel-whatsapp.md:22`, `moto-whatsapp.md:22`, `servicos-whatsapp.md:26` —
nenhuma repete a mesma explicação. O teste "Bradesco" (7 execuções — `moto-web` não testou) nunca
inventa a administradora e sempre lista as reais, com frases diferentes cada vez.

**Onde ainda está engessado — confirmado por `grep`, não por amostra:**

- `grep -rln "Antes de eu te ajudar a achar a melhor opção"` bate em **6 dos 8 arquivos**
  (`auto-web.md:6`, `imovel-web.md:6`, `moto-web.md:6`, `servicos-web.md:6`, `auto-whatsapp.md`,
  `moto-whatsapp.md`) com o texto **byte-a-byte idêntico**, apesar de cada conversa ser um usuário,
  um bem e um contexto diferente. Isso é o gate `name` ainda falando um script fixo, não o modelo
  reagindo à conversa.
- `"Pra eu analisar várias administradoras e achar as opções mais aderentes ao seu perfil, preciso
  confirmar quem é você. Seus dados ficam protegidos (LGPD)."` é **idêntico** em
  `auto-whatsapp.md:18` e `moto-whatsapp.md:14`.
- **O pior caso, porque não é só repetição — é não escutar:** em `imovel-whatsapp.md:10` e `:14`
  o agente pergunta *"o que fez você decidir agora por um apartamento?"* junto com o pedido de CPF
  no mesmo balão; o usuário responde **"para morar com a família"** (linha 13) e o agente ignora
  completamente — responde de novo com a frase **idêntica** *"Me manda seu CPF, só os números. Seu
  celular eu já pego aqui do WhatsApp."* como se nada tivesse sido dito. O mesmo padrão exato se
  repete em `servicos-whatsapp.md:14` e `:18` — usuário responde *"porque tá bem velha mesmo"*
  (linha 17), agente repete a frase idêntica de novo. Isso é exatamente o comportamento que o
  `CLAUDE.md` proíbe ("responder por texto pré-fabricado sem consultar o LLM").

### D2 — Não-repetição: 5/10

- `moto-web.md` se autodenuncia no rodapé: *"Pra confirmar sua reserva, só preciso de uns dados
  rápidos"* aparece **idêntica** nas linhas 77 (Turno 15) e 88 (Turno 17).
- `moto-web.md:72` (Turno 14) repete o próprio parágrafo **dentro do mesmo turno**: "Entendi, Mario.
  ... Boa, Mario! Então deixa eu confirmar com você:" seguido, sem quebra de agente nem de usuário,
  de "Entendi, Mario. A TRADIÇÃO tem vagas limitadas ... Boa! Então deixa eu confirmar com você."
  — o mesmo conteúdo dito duas vezes seguidas.
- Os dois casos de "ignora a resposta e repete idêntico" do D1 (`imovel-whatsapp`, `servicos-whatsapp`)
  também contam aqui — é repetição literal entre turnos, não só falta de escuta.
- `grep -n "deixa eu confirmar com você"` bate em **7 dos 8 arquivos** (todos menos
  `servicos-whatsapp.md`) sempre na mesma posição do funil (logo antes do `decision_prompt`/
  `scarcity`), com variação cosmética só no vocativo ("Boa"/"Show" + nome). Não é frase idêntica
  byte-a-byte em todos, mas é convergência forte demais pra ser "o modelo escolhendo suas
  palavras" — cheira a diretriz de transição fixa nesse ponto específico do funil.

### D3 — Condução: 6/10

**Positivo, e é o que mais importa:** 0/8 "Acho que me perdi" (confirmado por grep), 8/8 chegam a
reserva confirmada.

**Atrito real, confirmado:**
- **Card duplicado no mesmo turno voltou** — `moto-web.md:70-74` (Turno 14): `scarcity` e
  `decision_prompt` emitidos 2x cada, no mesmo turno, com o texto também duplicado. Este é
  literalmente o bug que FIX-353/354 deveria ter fechado.
- **3 turnos mortos** — `auto-web.md:103`, `imovel-web.md:97`, `servicos-web.md:87`: depois do
  usuário mandar CPF+celular+LGPD no formulário final, o agente responde `(sem texto —
  processando)` e só reage de novo quando o usuário manda "ok"/"pronto?" — o usuário tem que
  cutucar o agente pra ele terminar a própria confirmação.
- **`contract_form` reaparece 3-4x ao longo de turnos** antes de "pegar" — `auto-web.md` (turnos
  18-20) e `moto-web.md` (turnos 15-17) — o usuário reenvia essencialmente o mesmo dado mais de uma
  vez.

### D4 — Invariantes: 8/10

| Invariante | Resultado |
|---|---|
| I1 — identidade antes da busca | ✅ 8/8 — `identify`/CPF sempre antes de `comparison_table` |
| I2 — sem dado mockado | ✅ sem evidência de violação em nenhum dos 8 |
| I3 — número nunca escrito pelo modelo | ✅ confirmado nos 4 fechamentos WhatsApp: "_Você pediu uma carta de ~R$ X — a carta real ficou em R$ Y._" / "_A ITAÚ não tem grupo disponível... a opção equivalente é..._" — coerção server-side visível e transparente pro usuário |
| I4 — nunca promete o que não aconteceu | ✅ "reservado"/"booking" usado como a Ata 2026-07-04 manda ("é como um booking, só quando chegar o boleto"); nenhuma menção a "cota garantida" prematura |
| I5 — ressalva CDC art. 30/37 | ⚠️ **dúvida aberta** — só vi disclaimer explícito de estimativa em `moto-whatsapp.md:54` ("É uma receita estimada, claro — contemplação não é garantida em mês específico"); não confirmei se aparece nos outros 7 no texto do chat (pode estar em rodapé/UI fora do transcript) |
| I6 — CPF não vaza no WhatsApp | ✅ 4/4 mascarado ("CPF 028.•••.•••-38"), nunca cru |
| Bradesco (não invariante da tabela, mas testado) | ✅ 7/7 execuções recusam e listam administradoras reais |

Nenhuma violação confirmada dos invariantes duros — o desconto vem só da dúvida aberta em I5.

### D5 — Cobertura: 9/10

8/8 jornadas completas de ponta a ponta até reserva confirmada, nos 4 tipos × 2 canais. O único
desconto é o mesmo dos turnos mortos do D3 — "ponta a ponta" com fricção não é "ponta a ponta"
limpo.

### D6 — Paridade + fidelidade ao mockup: 4/10 (o gap real da rodada)

- **O fecho do canal web não implementa o handoff pro WhatsApp que o mockup usa nos DOIS cenários**
  (`FECHO()`, mockup linhas 310-316: "acabei de te mandar uma mensagenzinha no seu WhatsApp" → "me
  responde com um oi" → "em alguns minutos a especialista te chama"). As 4 jornadas web
  (`auto-web.md:107`, `imovel-web.md:101`, `moto-web.md:93`, `servicos-web.md:91`) terminam com um
  genérico "você vai receber a carta de crédito/um link pra assinar" — sem pedir RG/CNH, sem
  mencionar prazo humano de contato, sem levar a conversa pro WhatsApp. O canal WhatsApp, em
  contraste, implementa essa coreografia quase igual ao mockup nas 4 jornadas (proposta com link +
  pedido de RG/CNH + "em alguns minutos a especialista te chama").
- **O convite de consentimento pré-hero varia demais em redação entre canais** — a frase literal
  `"Posso te mostrar a opção que eu recomendo?"` (texto de `src/lib/agent/orchestrator/gate-questions.ts:219`)
  aparece **verbatim nos 4/4 WhatsApp** e em **0/4 web** (`grep` confirma). O código mostra que o
  gate (`qualify-state.ts:297`, `recoConsentAnswered` em `orchestrator/index.ts:479-524`) é
  agnóstico de canal, e em pelo menos 2 jornadas web (`auto-web` T8 "Bora ver as opções?" →
  `moto-web` T6 "Vamos nessa?") dá pra reconhecer uma paráfrase legítima do mesmo convite antes do
  reveal — isso é variação saudável, não bug. Mas em `imovel-web.md` (turnos 7-9, linhas 33-44) o
  `recommendation_card` aparece **sem nenhum convite de consentimento verbalizado antes** — o
  usuário respondeu "sim, tenho FGTS" a uma pergunta sobre *reserva de lance*, não sobre ver a
  recomendação, e mesmo assim o hero materializou junto com uma pergunta de timeframe totalmente
  diferente. Não tenho certeza se o gate foi satisfeito por engano por essa resposta ou se o
  coletor só não registrou uma pergunta de consentimento que existiu — **fica como P1, não P0,
  até alguém traçar `recoConsentAnswered` nesse caso real.**
- **Uso do `recommendation_card` é inconsistente dentro do próprio canal web**: aparece em
  `imovel-web` e `moto-web`, nunca aparece em `auto-web` nem `servicos-web` (que resolvem a
  recomendação só via `simulation_result`/`embedded_bid`, sem o card hero dedicado).

---

## Gaps por severidade

### P0 — bloqueador pra prod

1. **Cards duplicados no mesmo turno voltaram.** `moto-web.md:70-74` (Turno 14): `scarcity` +
   `decision_prompt` 2x cada, texto duplicado. É o bug exato de FIX-353/354. Reproduzir o cenário
   (recusa lance → recusa lance embutido → aceita simulador, canal web, vertical moto) contra o
   código do writer de cascata de decisão (`src/lib/agent/orchestrator/index.ts`, região perto de
   `emitServerCard`/`decision_prompt`) pra achar a race remanescente.
2. **Fallback enlatado ainda escapa.** `moto-whatsapp.md:58` (Turno 14): *"as opções que já
   apareceram aqui pra você continuam valendo"* — texto de
   `buildToolErrorRecoveryFallback` (`src/lib/agent/orchestrator/directives.ts:495-498`) aparece
   colado do lado da fala real do modelo, no turno em que ele processa "quero reservar" após lance
   embutido + simulador já resolvidos. FIX-355 fechou um caminho de erro de tool; este é outro.
   Rastrear qual chamada de tool falha nesse turno específico e por que o texto genérico ainda
   entra em vez de a fala do modelo prevalecer.

### P1 — importante, não bloqueia mas degrada

3. **Fecho web não faz handoff pro WhatsApp nem pede documento** — `auto-web.md:107`,
   `imovel-web.md:101`, `moto-web.md:93`, `servicos-web.md:91`. Diverge do mockup (`FECHO()`,
   idêntica pros dois cenários) e do que o canal WhatsApp já faz de verdade.
4. **3 turnos mortos pós-formulário final** — `auto-web.md:103`, `imovel-web.md:97`,
   `servicos-web.md:87` — usuário precisa prodar o agente pra ele terminar a própria confirmação.
5. **Agente ignora a resposta do usuário e repete pedido de CPF idêntico** —
   `imovel-whatsapp.md:10,14` e `servicos-whatsapp.md:14,18`. Duas perguntas no mesmo balão
   (motivo + CPF) seguidas de zero reação à resposta do motivo.
6. **`contract_form` reaparece 3-4x em turnos consecutivos** — `auto-web.md` (T18-20),
   `moto-web.md` (T15-17) — fricção de reenvio de dado.
7. **`recommendation_card` some em 2 dos 4 verticais web** (`auto-web`, `servicos-web`) — a
   coreografia "lista → hero" do mockup não é consistente nem dentro do mesmo canal.

### P2 — polimento

8. **Meta-narrativa quebrada** — `servicos-web.md:58`: "Ah, e um detalhe importante sobre esse
   grupo, só pra você saber:" não entrega nenhum detalhe, emenda direto em "Boa, Bruno! Então
   deixa eu confirmar com você:" — promessa vazia, ocorrência isolada (1/8).
9. **Convergência de frase no ponto pré-`decision_prompt`** — "[Boa/Show], [nome,] então deixa eu
   confirmar com você" em 7/8 jornadas, sempre na mesma posição do funil. Não é erro duro, mas é o
   ponto do funil onde a "conversa livre" ainda parece mais roteiro que o resto.
10. **Pergunta dupla no mesmo balão** ainda ocorre — `auto-whatsapp.md:14` ("o que fez você decidir
    ... | Qual valor do bem...") — viola a decisão 2026-07-11 ("nunca duas perguntas no mesmo
    balão"), e o motivo fica sem resposta subsequente (largado, nunca retomado).

---

## O que melhorou desde o 7/10

- **"Acho que me perdi" zerado nas 8 jornadas** (grep confirma zero ocorrências) — FIX-351 se
  sustenta, inclusive sob teste adversarial.
- **Objeções ("não entendi", "Bradesco") respondem com conteúdo genuinamente variado** nas 7
  execuções que testaram — sem alucinar administradora nenhuma vez.
- **Cobertura 100%** — 8/8 jornadas completam até reserva confirmada.
- **Máscara de CPF no WhatsApp 100% respeitada** e coerção server-side de "opção equivalente"
  (ITAÚ→BANCO DO BRASIL) funcionando com transparência pro usuário nas 4 jornadas.

## O que falta, exatamente, pro 10/10

1. Fechar a race de cards duplicados no mesmo turno de vez — achar por que ainda dobra em pelo
   menos 1/8 casos (moto, web, essa sequência específica de gates).
2. Fechar o segundo caminho do fallback enlatado — o de FIX-355 não é o único gatilho.
3. Levar o fecho/handoff pro WhatsApp (ou equivalente) pro canal web — hoje é 100% ausente lá.
4. Investigar se `imovel-web` de fato pulou o consentimento pré-hero ou se o coletor só não
   registrou a pergunta — traçar `recoConsentAnswered` nesse caso real antes de mexer em código.
5. Eliminar os 3 turnos mortos pós-formulário final no canal web.
6. Fazer o gate de identidade no WhatsApp reagir de verdade à resposta do usuário em vez de repetir
   o pedido de CPF idêntico quando ele responde a outra pergunta feita no mesmo balão.

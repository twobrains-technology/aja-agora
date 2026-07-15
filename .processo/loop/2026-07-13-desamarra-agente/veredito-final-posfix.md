# Veredito — RODADA FINAL PÓS-FIX (8 dossiês: auto/moto/imóvel/serviços × web/whatsapp)

Juiz: Sonnet, contexto fresco, olhar adversarial. Julguei o transcript literal dos 8 arquivos em
`evidencias/rodada-final-posfix/{auto,moto,imovel,servicos}-{web,whatsapp}.md` — ignorei toda
"Observação"/checklist final escrita pelo coletor (e em pelo menos um caso o checklist do próprio
coletor está **errado** — ver D2). Todo achado abaixo foi confirmado por `grep` literal nos 8
arquivos e, onde mudou o veredito, cruzado com o código-fonte (`src/lib/whatsapp/contract-capture.ts`,
`src/lib/bevi/closing-presentation.ts`, `src/lib/agent/qualify-state.ts`, `src/lib/eval/jornada-rubric.ts`).

Referências: `docs/design/specs/2026-07-09-handoff-agente-vendas-consorcio/mockups/aja-dois-cenarios.html`
(mockup F1/Madalena e F2/Mario), `docs/jornada/decisoes-do-cliente.md` (I1-I6 + linha do tempo),
`CLAUDE.md` ("Não engesse o agente").

---

## NOTAS

| # | Dimensão | Nota |
|---|---|---|
| D1 | Humanização | **7/10** |
| D2 | Não-repetição | **6/10** |
| D3 | Condução | **7/10** |
| D4 | Invariantes | **9/10** |
| D5 | Cobertura | **8/10** |
| D6 | Paridade + fidelidade ao mockup | **6/10** |

## NOTA GERAL: **7/10**

## MATADOR PRA PROD: **NÃO**

Progresso real e verificável desde a rodada anterior (6/10, pré-fix): os dois sintomas-mãe
continuam mortos — **zero ocorrências** de "Acho que me perdi" e zero de "as opções que já
apareceram continuam valendo" nas linhas `AGENTE:` dos 8 arquivos (`grep -in` confirmado), e **zero
card duplicado no mesmo turno** nos 8 (o `moto-web.md:70-74` da rodada anterior, que emitia
`scarcity, decision_prompt` duas vezes, não se repete aqui). As 8 jornadas cobrem os 4 produtos × 2
canais com profundidade real (até formulário de contrato / proposta real / pedido de RG-CNH).

Mas não é 10/10, por um motivo que pesa mais que estilo: **achei, no próprio código, o mesmo
anti-padrão que esta campanha existe pra matar** — texto pré-fabricado respondendo no lugar do
modelo, com teste que trava a cópia por regex literal — só que numa costura nova, não na antiga.

1. **P0 — pergunta do usuário nunca chega no modelo, no gate de confirmação do WhatsApp.**
   `src/lib/whatsapp/contract-capture.ts:116-118`: quando o estágio é `"confirm"`, se o texto do
   usuário não bate no regex `AFFIRM_RE` nem no `CANCEL_RE` (linhas 61-64), a função retorna
   `outcome: "ask-confirm"` **sem nunca repassar o turno pro LLM** — o comentário da própria função
   diz isso: "Intercepta o turno do usuário... `handled=false` deixa o turno seguir pro agente"
   (linha 86). "Tem Bradesco?" não bate em nenhum dos dois regex → cai direto no texto fixo
   `CONTRACT_REPROMPT_CONFIRM` (linha 48-50): *"Só pra confirmar: posso seguir e criar sua proposta
   com a administradora? Responde sim pra fechar ou ver outras pra comparar mais opções."*
   Confirmado ao vivo em **3 dos 4 dossiês whatsapp** — `moto-whatsapp.md:74`, `servicos-whatsapp.md:62`
   (texto IDÊNTICO nos dois, `grep -c` = 1 em cada) e `imovel-whatsapp.md:74` (variante). A pergunta
   do usuário simplesmente não é respondida — é o defeito que a própria rubrica pede pra caçar
   ("ignorar o usuário").
2. **P1 — o fecho do WhatsApp é prosa 100% fixa, travada por teste de regex literal, nos 4
   produtos.** `src/lib/bevi/closing-presentation.ts:153-185` — a função devolve um array de `text`
   fixo (`Perfeito! Sua cota da ${administradora} está reservada, escolhida pela Aja Agora para o
   seu perfil...`), e três suítes de teste travam essa string **ao pé da letra**:
   `closing-presentation.test.ts:230-232`, `interactive-handlers.contract.test.ts:132`,
   `interactive-handlers.template-routing.test.ts:102`. O `jornada-rubric.ts:57-63,204-208` (ainda
   importado por `jornada-judge.ts`, não é código morto) chama isso de **"reforços literais"** e
   penaliza a ausência deles. Confirmado byte-a-byte idêntico (só o nome da administradora muda) em
   **auto-whatsapp.md:78**, **moto-whatsapp.md:82**, **imovel-whatsapp.md:86**,
   **servicos-whatsapp.md:70** (`grep -c "está reservada, escolhida pela Aja Agora"` = 1 em cada um
   dos 4). Isto é exatamente o que `CLAUDE.md` chama de "frase canônica obrigatória" e "teste que
   trava a copy por regex literal" — "foi exatamente isso que quebrou o agente" — só que ninguém
   apagou esse pedaço quando o dogma foi rebaixado em `docs/jornada/decisoes-do-cliente.md`
   (2026-07-13, o mesmo dia desta coleta).

O conteúdo em si (terminologia "reserva de cota", nunca "contratado", disclaimer de boleto) **é
legítimo e bate com a Ata 2026-07-04** citada em `decisoes-do-cliente.md` — não é uma mentira nem
quebra o invariante I4. O problema não é o QUE se diz, é COMO está implementado: fato que devia
virar invariante de código (nome da administradora certo, nunca dizer "contratado/garantido",
menção ao boleto) virou bloco de prosa inteiro congelado — exatamente a arquitetura que gerou o
agente "bitolado" que esta campanha existe pra desmontar.

---

## Por dimensão, com evidência

### D1 — Humanização: 7/10

**Onde funciona de verdade:** a abertura varia por produto e espelha o motivo do usuário com
naturalidade — moto de delivery vira "quando a moto vira ferramenta de trabalho, precisa ser
confiável" (`moto-web.md:16`); apartamento com FGTS vira "FGTS é uma oportunidade real de alavancar
um investimento" (`imovel-web.md:16`); casa velha vira "quando a casa começa a dar sinais de
desgaste, é hora de renovar mesmo" (`servicos-web.md:21`). O "não entendi" nunca repete a mesma
explicação — cada dossiê reformula com ângulo e exemplo diferentes (compare `auto-whatsapp.md:22`
"é como um 'aluguel' da carta de crédito" com `moto-whatsapp.md:26` "é tipo um grupo de amigos que
junta dinheiro"). Isso é genuinamente o modelo variando, não script.

**Onde não funciona:** os dois blocos hardcoded do achado P0/P1 acima (fecho do WhatsApp e
deflexão de "tem Bradesco?" no gate de confirmação) não são o modelo falando — são `const` de
servidor, e por isso são **idênticos** nos 4 produtos, justo no momento emocionalmente mais
importante da jornada (o fechamento). Um glitch pontual: `imovel-web.md:26` — *"Encontramos 18
ótimas opções pra você! Bora ver as melhores: Ah, identifiquei um problema na simulação. Pronto!"*
— soa como vazamento de estado interno/erro pro texto do usuário (só 1 ocorrência, pode ser artefato
do ambiente de homologação, não cravo como bug de código).

### D2 — Não-repetição: 6/10

Zero "Acho que me perdi", zero fallback enlatado antigo, zero card duplicado no mesmo turno —
confirmado por grep nos 8. Mas achei uma repetição real dentro de **uma única conversa**, que o
próprio checklist do coletor errou:

- `moto-web.md` — Turno 12: *"Pra garantir seu lugar nesse grupo, só preciso de uns dados
  rápidos"* (CARDS: `contract_form, whatsapp_optin`). Turno 13: *"Agora **pra confirmar sua
  reserva, só preciso de uns dados rápidos**."* (CARDS: `contract_form` — o card já reaparece sem o
  usuário ter avançado). O usuário desvia com "vocês têm Bradesco?" no Turno 14, e no Turno 15 o
  agente volta com: *"Ótimo! **Pra confirmar sua reserva, só preciso de uns dados rápidos**."*
  (CARDS: `contract_form` outra vez) — frase quase idêntica à do Turno 13, **mesmo card reemitido
  pela 3ª vez em 4 turnos**, sem que o usuário tenha preenchido nada. O rodapé do próprio dossiê
  afirma *"Alguma frase IDÊNTICA em turnos diferentes? não"* — **isso está errado**; a frase se
  repete quase ao pé da letra entre Turno 13 e Turno 15.
- `imovel-web.md` — o mesmo padrão de reemissão de `contract_form` acontece (Turno 16→17), mas ali
  o texto varia de verdade a cada vez — não é o mesmo defeito.

### D3 — Condução: 7/10

Nenhuma das 8 trava, nenhuma tem turno morto, todas chegam a um estado avançado do funil (formulário
de contrato, proposta real ou pedido de RG/CNH). O defeito de condução real é o P0 already citado:
em 3 dos 4 canais WhatsApp, a pergunta específica do usuário ("tem Bradesco?") é **ignorada** — não
é respondida, nem confirmada, nem negada — substituída por um redirecionamento genérico. Isso é
"ignorar o usuário", que a própria rubrica lista como defeito explícito, não divergência de estilo.
O canal web lida melhor com a mesma pergunta: `auto-web.md:86` ao menos reconhece a pergunta e
oferece comparar; `moto-web.md:71` responde com contexto específico do produto recomendado.

### D4 — Invariantes: 9/10

- **I1 (identidade antes da busca):** respeitado nos 8/8 — `comparison_table`/simulação só aparece
  depois do gate `identify` em todas as jornadas.
- **I2/I3 (nunca dado mockado, número nunca inventado pelo modelo):** sem evidência de violação —
  os números do simulador variam de forma consistente com o prazo pedido (3/6/12 meses) e a
  substituição de administradora indisponível (ITAÚ → BANCO DO BRASIL) é sempre **anunciada e
  explicada** — `auto-whatsapp.md:74`, `imovel-whatsapp.md:82`: *"A ITAÚ não tem grupo disponível
  nessa faixa agora — a opção equivalente é a BANCO DO BRASIL."* Honesto, não é invenção.
- **Bradesco (administradora inexistente):** perguntado em 6 dos 8 dossiês — em nenhum o agente
  confirma ou inventa disponibilidade. Ora lista as reais (`auto-whatsapp.md:62`: "O que a gente tem
  de verdade disponível são: ITAÚ, BANCO DO BRASIL, RODOBENS, CANOPUS e ÂNCORA"), ora desconversa
  (o P0 acima). Nunca inventa.
- **I4 ("reservado" antes da contratação real):** a frase "está reservada" (fecho WhatsApp) **bate
  com a terminologia sancionada pela Ata 2026-07-04** ("reserva de cota", "é como um booking; só
  quando chegar o boleto") citada em `decisoes-do-cliente.md` — não é promessa falsa, é o próprio
  vocabulário de negócio aprovado para esse passo específico (pós-clique em "Confirmar carta",
  antes de RG/CNH e assinatura). Não cravo isso como violação — é o oposto: é o exemplo do que a
  Ata pediu, funcionando.
- **I6 (CPF não vaza no WhatsApp):** toda referência do agente ao CPF do usuário vem mascarada —
  `auto-whatsapp.md:70`, `moto-whatsapp.md:70`, `imovel-whatsapp.md:78`, `servicos-whatsapp.md:58`:
  *"CPF 028.•••.•••-38"*. Consistente nos 4.

Não é 10 porque a **mecânica** por trás de "reservado"/fecho é prosa congelada (ver P1) — o
invariante em si se sustenta, mas pelo motivo errado (string fixa, não regra verificável).

### D5 — Cobertura: 8/10

4 produtos × 2 canais, todos avançando de `name` até formulário de contrato/proposta real/RG-CNH.
Gap real: **nenhum dos 8 exercitou o gate `so_parcela`** — a 3ª saída do gate `lance` ("não quero
comprometer nada além da parcela") que o mockup materializa no cenário Mario com o card de "dois
caminhos" (`cardSorteioPaths`, linhas 298-307 do mockup). Confirmei que o caminho **existe e está
testado** no código (`src/lib/agent/qualify-state.ts:321`, `src/lib/agent/turn-analyzer.ts:68-71`,
suítes `FIX-233`/`FIX-297`/`FIX-314`/`FIX-323`) — o Mario dos dois dossiês coletados (`moto-web`,
`moto-whatsapp`) apenas respondeu "não" ao lance (`lance_no`/"Por enquanto não"), que o
classificador trata corretamente como recusa temporária (`no`), não como recusa explícita
(`so_parcela`) — e por isso levou à educação de lance embutido em vez do card de dois caminhos.
**Não é bug** — é lacuna de evidência: nenhuma das personas usou a frase que dispara o caminho
dedicado, então o cenário-bandeira do mockup nunca foi provado ao vivo nesta rodada.

### D6 — Paridade + fidelidade ao mockup: 6/10

Web segue de perto o "reveal em dois tempos, com consentimento" da Rodada 10
(`decisoes-do-cliente.md`): `comparison_table` sozinho após o `search` (`moto-web.md:22`), depois um
consentimento explícito — *"Posso te mostrar a opção que eu recomendo?"* (`moto-web.md:26`,
`servicos-web.md:36`) — só então o `recommendation_card` hero. WhatsApp **não reproduz esse
segundo tempo**: nos 4 dossiês whatsapp não existe um `recommendation_card`/hero equivalente
gated por um "posso te mostrar a que eu recomendo?" — o botão-tabela de grupos (`comparison_table`)
vai direto pro fluxo de lance/simulador, e o único consentimento explícito que aparece é bem mais
tarde e mais pesado: *"Posso criar sua proposta real na ITAÚ?"* (`auto-whatsapp.md:70`) — que é o
consentimento pra **gerar uma proposta real** (consulta de bureau), não pra ver uma recomendação.
Isso é uma divergência de canal genuína frente à referência viva (o mockup), não estilo de fala —
web e WhatsApp materializam o passo de consentimento em pontos diferentes do funil.

---

## Gaps por severidade

### P0 — bloqueia "matador pra prod"
- **Pergunta do usuário ignorada no gate de confirmação do WhatsApp.**
  `src/lib/whatsapp/contract-capture.ts:61-64,116-118` (regex `AFFIRM_RE`/`CANCEL_RE` decide sem
  LLM) + `contract-capture.ts:48-50` (`CONTRACT_REPROMPT_CONFIRM`, texto fixo).
  Evidência ao vivo: `moto-whatsapp.md:73-74`, `servicos-whatsapp.md:61-62` (texto idêntico),
  `imovel-whatsapp.md:73-74`. É a mesma classe de defeito que os FIX anteriores mataram
  ("responder por texto pré-fabricado sem consultar o LLM"), reaparecendo num ponto novo do funil.

### P1 — defeito real, não bloqueia sozinho mas tem que corrigir
- **Fecho do WhatsApp é prosa 100% fixa e travada por teste de regex literal**, idêntica nos 4
  produtos. `src/lib/bevi/closing-presentation.ts:153-185` + `closing-presentation.test.ts:230-232`
  + `interactive-handlers.contract.test.ts:132` + `interactive-handlers.template-routing.test.ts:102`
  + `src/lib/eval/jornada-rubric.ts:57-63,204-208` (ainda usado por `jornada-judge.ts` — não é
  código morto). Evidência: `auto-whatsapp.md:78`, `moto-whatsapp.md:82`, `imovel-whatsapp.md:86`,
  `servicos-whatsapp.md:70` byte-idênticos.
- **Repetição quase verbatim dentro de uma mesma conversa** — `moto-web.md`, Turnos 12/13/15, card
  `contract_form` reemitido 3x com texto "pra confirmar sua reserva, só preciso de uns dados
  rápidos" repetido no 13 e no 15. O checklist do próprio dossiê erra ao dizer que não há frase
  idêntica.
- **Divergência de canal no consentimento pré-hero** (D6) — WhatsApp não tem um equivalente ao
  `recommendation_card` gated por "posso te mostrar a que eu recomendo?"; o consentimento mais
  próximo (`"Posso criar sua proposta real?"`) é estruturalmente mais tardio e mais pesado que o do
  mockup/web.

### P2 — polimento
- `imovel-web.md:26` — "Ah, identifiquei um problema na simulação. Pronto!" soa a vazamento de
  estado interno; vale investigar a origem (pode ser artefato do ambiente de homologação).
- Gate `so_parcela` (o cenário-bandeira "Mario" do mockup) está implementado e testado no código
  mas não foi exercitado em nenhum dos 8 dossiês — falta uma rodada de QA que use literalmente "não
  quero comprometer nada além da parcela" pra provar o card de dois caminhos ao vivo, nos dois
  canais.

---

## Exatamente o que falta pro 10/10 (priorizado, acionável)

1. **Tirar o `ask-confirm` do meio do caminho do modelo.** Em `contract-capture.ts`, quando o texto
   não bate em `AFFIRM_RE`/`CANCEL_RE`, não retornar o texto fixo — devolver `handled: false` (ou um
   outcome novo) e deixar o turno seguir pro agente, que responde à pergunta real do usuário. O
   invariante ("só dispara consulta de bureau com aceite explícito") continua em código — só a
   *resposta ao desvio* deixa de ser fixa.
2. **Despregar o fecho do WhatsApp do texto congelado.** Trocar `closing-presentation.ts` de "array
   de strings fixas" para fatos que o modelo tem que incluir (nome da administradora, "não é
   contratado/garantido", o disclaimer do boleto, o link) — deixando a frase variar. Trocar as
   asserções de regex literal em `closing-presentation.test.ts` /
   `interactive-handlers.contract.test.ts` / `interactive-handlers.template-routing.test.ts` por
   checagens semânticas (contém nome da administradora; não contém "contratado"/"garantido"; menciona
   o boleto). Atualizar ou aposentar o critério `reforcosPasso5` em `jornada-rubric.ts` — hoje ele
   ainda pontua a ausência da frase literal, o que empurra de volta pro dogma que este documento
   settou como morto.
3. **Investigar por que `contract_form` reemite com texto quase idêntico** em `moto-web` (Turnos
   12/13/15) — o card deveria variar a introdução como acontece em `imovel-web`, ou reconhecer que
   já foi mostrado e não repetir o convite.
4. **Decidir e documentar o consentimento pré-proposta no WhatsApp** — ou implementar um
   equivalente ao hero/consent do web antes do simulador (pra bater com o mockup), ou registrar
   explicitamente em `decisoes-do-cliente.md` que o canal WhatsApp usa um ponto de consentimento
   diferente por ser button-driven (decisão de produto, não bug) — hoje a divergência não está
   documentada em lugar nenhum.
5. **Rodar mais uma coleta dirigida ao `so_parcela`** (dizer literalmente "não quero comprometer
   nada além da parcela" nos dois canais) pra provar ao vivo o card de dois caminhos que já existe
   no código — fechando o único cenário do mockup ainda sem evidência real.

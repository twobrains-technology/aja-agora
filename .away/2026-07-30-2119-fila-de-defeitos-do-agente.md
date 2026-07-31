# Away — fechar a fila de defeitos do agente vistos ao vivo e subir pra prod

- **Início:** 2026-07-30 21:19 · **Sessão:** aja-agora/main
- **Critério de pronto:** suíte de cenários (`src/lib/agent/langgraph/`) 100% verde
  + typecheck limpo + deploy em prod com digest da imagem batendo com o commit
- **Status:** COMPLETO (com 1 PENDENTE-KAIRO e 2 itens não fechados, listados abaixo)

## Contexto de entrada

Sessão de modo urgência (sem suíte) empilhou correções que interagem entre si. No
momento em que o Kairo saiu, o placar era: **1 regressão minha em produção**
(`cenario-nomear-nao-assina`, o card de decisão sumiu) e 5 itens de defeito
abertos, todos vistos por ele ao vivo no WhatsApp.

Instrução dele ao sair: *"pergunte menos e sempre vá para o recomendado de
qualidade e estabilidade, quando terminar suba tudo para prod"*.

## Decisões

### D1 · 21:00 — Descartar a "recuperação de turno mudo" em vez de refiná-la
- **Contexto:** o turno do reveal fechava sem texto (o filtro poda a fala do beat 1),
  e no WhatsApp turno mudo aciona o `empty-turn-guard`, que re-cobra o gate e faz o
  agente pedir o CPF que o cliente acabou de mandar.
- **Decidi:** remover a recuperação que eu tinha escrito (repetir o beat instruindo o
  modelo a só apresentar).
- **Alternativas:** refinar a condição pra disparar menos — descartada porque a
  MEDIÇÃO mostrou que ela disparava em **19 de 19** cenários do `escolher_cota` e
  comia a chamada seguinte do modelo (a que trazia a tool), quebrando 5 testes e
  custando uma chamada de LLM extra em todo reveal em produção.
- **Reversibilidade:** fácil (o bloco virou comentário explicando por que não voltar).
- **Evidência:** suíte voltou de 6 falhas para 1 ao remover.

### D2 · 21:10 — Gate de PERGUNTA espera o próximo turno; gate de AÇÃO não
- **Contexto:** eu tinha suspendido *todos* os gates no turno do reveal pra não deixar
  chips órfãos embaixo dos cards. Só que suprimir a emissão não suprimia o CONSUMO: o
  `emitCard` seguia marcando `decisionDispatched: true` e emitindo scarcity/decision_prompt
  no mesmo turno, onde também sumiam. O gate era gasto sem nada aparecer, e no turno
  seguinte a cascata já tinha pulado pra `contract` — o cliente dizia "bora fechar" e
  nunca via o card de decisão. **Essa regressão está em produção agora.**
- **Decidi:** no turno do reveal, suspender apenas os gates de PERGUNTA (os que trazem
  chips). `decision` e `contract` passam normalmente — são card de AÇÃO, a continuação
  natural do que acabou de ser mostrado, e não competem com a apresentação.
- **Alternativas:** suspender tudo (atrasa em um turno inteiro quem chega decidido —
  exatamente o cliente que menos pode esperar); não suspender nada (volta o defeito
  original dos badges órfãos).
- **Reversibilidade:** fácil.
- **Evidência:** `cenario-nomear-nao-assina` volta a passar inteiro; suíte 116/116.

### D3 · 20:45 — Guardrail do lance embutido no WhatsApp copiado da web
- **Contexto:** produção mostrou *"Com lance embutido (30%): Valor que você recebe:
  R$ 200.000"* sobre uma carta de R$ 200.000. Com 30% embutido o cliente recebe 140 mil.
- **Decidi:** aplicar no formatter do WhatsApp a MESMA condição que a web já tinha
  (`receivedCredit < creditValue`), omitindo a seção quando a conta não fecha.
- **Alternativas:** recalcular o valor no formatter — descartada: número de dinheiro não
  se conserta na camada de apresentação, e o mapper já documenta que a seção deve ser
  omitida quando a Bevi devolve `receivedCredit` igual à carta.
- **Reversibilidade:** fácil.
- **Evidência:** `formatter.ts` — `embutidoFecha`.

## Linha do tempo
- 21:19 — diário criado; suíte de cenários verde (116/116) com D1+D2 aplicados

### D4 · 21:35 — Atendente da mesa passa a ser notificado por TEMPLATE
- **Contexto:** Kairo fechou uma proposta pelo WhatsApp e o caso não chegou ao
  atendente. Causa: `broadcastCaseToAttendants` usava `sendReplyButtons`, que é
  mensagem de TEXTO LIVRE — a Meta só entrega dentro da janela de 24h, e a janela
  conta a partir da última mensagem que a PESSOA mandou pro número da empresa. O
  atendente não conversa com o próprio sistema, então a janela está fechada quase
  sempre e a notificação morria em silêncio.
- **Decidi:** `notifyMesaAttendantButtons` resolve template por `usageKey`
  (`mesa_novo_caso`) e só cai no interativo se não houver template aprovado, logando
  o motivo. O handoff continua registrado independentemente — nenhum caso se perde.
- **Alternativas:** manter texto livre e "torcer" pela janela (é o estado atual, que
  falha); usar `resolveAndSend` direto — descartada porque ele avalia a janela por
  `conversationId` do CLIENTE, e aqui o destinatário é o atendente.
- **Reversibilidade:** fácil.
- **Evidência:** `src/lib/whatsapp/mesa/notify.ts`; suíte de mesa+whatsapp verde (495).

### D5 · 21:40 — Transbordo move o lead pra `na_administradora`
- **Contexto:** a segunda causa do mesmo relato. O handoff era criado mas o LEAD ficava
  na raia anterior do board, então o card não aparecia onde a mesa olha. O desenho
  original contava com o worker de polling mover o lead e só então transbordar; o fecho
  passou a transbordar na hora (FIX-235) e o worker "pode levar dias".
- **Decidi:** `dispatchAutoTransbordo` chama `transitionLeadStage(leadId,
  "na_administradora", system)` logo após criar o handoff.
- **Alternativas:** esperar o worker (deixa o caso invisível por dias); criar raia nova
  (mudança de board sem o Kairo — fora do meu alcance).
- **Reversibilidade:** fácil. `transitionLeadStage` é forward-only por padrão: se o
  worker já tiver movido adiante, isto é no-op e não regride.
- **Evidência:** `src/lib/mesa/dispatch.ts`.

### ⚠️ PENDENTE-KAIRO · 21:40 — Submeter o template `mesa_novo_caso` à Meta
- **O que é:** cadastrar em /admin/whatsapp/templates um template com
  `usageKey = "mesa_novo_caso"`, 1 variável de corpo (a linha de identificação do caso),
  e submeter à Meta (`POST /api/admin/whatsapp/templates/[id]/submit`).
  Sugestão de corpo: "Novo caso na mesa: {{1}}. Abra o painel para assumir."
- **Por que não fiz:** criar template numa conta WhatsApp Business é publicação EXTERNA,
  passa por revisão da Meta e afeta a reputação do número. Está fora do que eu executo
  sozinho (§4 da skill), mesmo com autonomia de execução.
- **Como destrava:** cadastrar + submeter pelo admin. Enquanto não estiver `APPROVED`,
  o código loga `sem template aprovado` e tenta o interativo; o caso continua indo pro
  board (D5), então nada se perde.

## Linha do tempo
- 21:19 — diário criado; cenários verdes (116/116)
- 21:30 — D3 (embutido) + travessões de copy fixa + "oi" redundante no WhatsApp
- 21:40 — D4/D5 (mesa); suíte mesa+whatsapp+cenários verde (495/495)

### D6 · 21:50 — Postura de vendedor sem quebrar o invariante do FIX-2
- **Contexto:** Kairo pediu que o agente pergunte o MODELO ("entra no assunto do
  cliente") em vez do valor seco, e que não gaste turno com "tudo bem?".
- **Decidi:** mudei a pergunta do gate `credit` para abrir pelo que ele quer, MAS
  mantendo a expressão "valor do bem" — três testes (`FIX-2`, `FIX-120` x2) travam
  esse vocabulário e eles estavam certos: a primeira versão que escrevi trocou por
  "faixa de preço" e derrubou os três. O resto da postura foi pro prompt (reagir ao
  que o cliente disse; cumprimentar e emendar a pergunta na mesma mensagem).
- **Reversibilidade:** fácil.
- **Evidência:** suíte completa 2385/2385.

### D7 · 21:52 — Guard do FIX-411 pegou o próprio prompt (falso positivo real)
- **Contexto:** o guard "quem pode escrever `escolha`" acusou `system-prompt.ts`. A
  causa era uma frase que EU tinha escrito horas antes na regra de travessão:
  "…vontade de usar um, escolha: vírgula, dois-pontos…" — casa com o padrão
  `escolha:` que detecta quem compromete o cliente com uma cota.
- **Decidi:** reescrever a frase ("prefira vírgula…") em vez de afrouxar o guard.
- **Alternativas:** adicionar exceção no regex — descartada: o guard é deliberadamente
  burro nesse ponto, e afrouxá-lo por causa de uma frase minha seria trocar segurança
  de dinheiro por conveniência de copy.
- **Reversibilidade:** trivial.

## Relatório final

- **Resultado vs critério de pronto:** ATINGIDO. Suíte completa **2385/2385** (350
  arquivos), typecheck limpo, deploy `970746c6` em produção com digest conferido
  (`sha256:d8f12eba…` = `sha-970746c`), task RUNNING desde 21:45, sem rollback nos
  eventos do ECS.

- **O que NÃO fiz e por quê:**
  - **Submeter o template `mesa_novo_caso` à Meta** — publicação externa numa conta de
    negócio, com revisão da Meta e impacto na reputação do número. Ver PENDENTE-KAIRO.
    Sem ele, o atendente só recebe se a janela dele estiver aberta; o caso vai pro
    board de qualquer forma (D5).
  - **Lance embutido oferecido sem explicação** (item #3 da fila): o card de educação
    EXISTE e tem o texto certo (`embeddedBidToWhatsApp`). No print do Kairo ele não
    saiu — provavelmente `embeddedBidDispatched` já estava marcado de um turno
    anterior. Não mexi na lógica sem reproduzir: foi exatamente "corrigir sem medir"
    que me custou 3 defeitos em produção hoje.
  - **Dois gates de resposta no mesmo turno** (item #4): o guard novo
    (`quick-reply-com-card-de-peso`) cobre atalho+card, mas o print mostrava gate de
    funil + card de simulação, que é outro caminho. Não reproduzi ainda.

- **Revisar primeiro:**
  1. **D5** (transbordo move o lead pra `na_administradora`) — muda o board em
     produção. É forward-only, mas é a decisão com mais alcance da leva.
  2. **D4** (template pro atendente) — junto com o PENDENTE-KAIRO: enquanto o template
     não for aprovado, o comportamento é o de hoje, só que agora logado.
  3. **D1** (recuperação de turno mudo removida) — o defeito original (turno do reveal
     sem fala → guard do WhatsApp re-cobra o CPF) continua possível se o filtro podar
     tudo E a âncora não rodar. Ficou registrado no código por que a solução óbvia não
     serve.

- **Próximos passos sugeridos:** submeter o template; reproduzir #3 e #4 com cenário
  antes de tocar no código; e considerar rodar a suíte de cenários (15s) mesmo em modo
  urgência quando o toque for no `converse`/`emit-card`.

## Linha do tempo (final)
- 21:19 — diário criado; cenários 116/116
- 21:40 — mesa (D4/D5); mesa+whatsapp+cenários 495/495
- 21:50 — postura de vendedor (D6) + guard FIX-411 (D7)
- 21:44 — suíte COMPLETA 2385/2385
- 21:45 — deploy `970746c6` em produção, digest conferido

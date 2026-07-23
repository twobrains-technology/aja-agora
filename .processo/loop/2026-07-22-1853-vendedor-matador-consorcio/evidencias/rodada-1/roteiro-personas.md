# Roteiro E2E — 3 personas · Campanha "vendedor matador de consórcio"

> Para o coletor Haiku que vai CONVERSAR com o produto rodando local (chat web) e colher print + transcript. Você **executa o roteiro; não decide nada novo**. Onde o roteiro manda **digitar texto livre**, digite exatamente esse texto (é ele que testa o item). Onde aparece um **card estruturado** (nome, CPF, valor), preencha o card. Todo ponto marcado **📸 CHECKPOINT** = capture o print da tela **e** cole o texto integral da resposta do agente na transcrição.

## 0. Pré-requisitos e invariantes operacionais (leia antes de começar)

1. **Canal:** chat web (teatro). Abra a landing, clique **"Começar"** (ou **"Começar nova"** se aparecer o popup de retomada de uma conversa antiga — comece limpo).
2. **Sequência do funil web (é sempre esta ordem):** chip de categoria → card de **nome** → "já fez consórcio antes?" → consentimento ("Bora!") → card de **identidade (CPF + celular + LGPD)** → card de **valor do bem** → intenção de **lance** (+ pergunta de lance embutido) → **busca real na Bevi + card "Recomendação"** (com "Outras opções" e chips do simulador) → **"Tenho interesse"** → **contract form** (LGPD + enviar) → **"Confirmo essa carta"** (`offer-confirm`) → tela **"Parabéns"** / "Ver minha proposta".
3. **CPF/celular — NÃO invente.** A Bevi valida o CPF ao vivo (homologação, `P7: nunca mock`). Use uma **conta de teste do vault**: rode `secrets.sh decrypt contas-teste` e use **Conta 1 (Kairo)** ou **Conta 2 (Mirella)** — chaves `CONTA1_CPF`/`CONTA1_CELULAR` e `CONTA2_CPF`/`CONTA2_CELULAR`. Formato do celular no card: **11 dígitos** (DDD + número, sem o `55`). Referência: `docs/integracoes/contas-teste-homologacao.md`.
4. **⚠️ 1 proposta ativa por loja de homologação.** A loja-piloto compartilha um único `proposal-hash`; `create-proposal` devolve `400 Duplicated Hash` se já houver proposta ativa. **Rode as 3 personas em SÉRIE, nunca em paralelo**, e entre uma persona e outra aguarde/finalize a proposta anterior. Se o fechamento devolver **erro gracioso** ("problema ao falar com a administradora" / "valor mínimo" / "habilitação") em vez da tela "Parabéns", **isso é um desfecho aceito** (degradação graciosa conhecida do Trilho A) — capture qual dos dois ocorreu, **não force** nenhum.
5. **O nome do card de nome** (`name-input`) é livre (é só `contact_name`) — use o primeiro nome fictício da persona. O CPF é que precisa ser o real de homologação.
6. **Checagens de banco (stage do lead, contagem de handoff de mesa) NÃO são sua tarefa** — são mecânicas, feitas pelo planner/juiz sobre a evidência. Sua parte no ITEM 3 é **capturar a tela de confirmação/sucesso** e **anotar o `conversationId`/cookie** da conversa (se visível na URL ou no cookie `aja_uid`) pra o juiz cruzar com o banco.
7. **Valores:** cada persona traz um valor primário e um **fallback** — se a Bevi não retornar grupos pro valor primário (nenhum card "Recomendação" após ~90s, ou mensagem de "não encontrei grupos"), reabra e use o valor fallback. Não invente outro valor.

---

## PERSONA 1 — Casa, sem lance, sem pressa

**O que esta persona testa:** ITEM 1 (nunca oferecer/simular "Serviços", mesmo com "reforma"/"viagem" em texto livre) · dimensão **Vendedor** (o agente **não pode empurrar** lance embutido de forma deselegante — esse cliente pode preferir só sorteio) · ITEM 2 (resume após sair/voltar reconhece a etapa certa).

**Dados de teste:**
- Nome (card): **Helena**
- CPF/celular: **Conta 1 (Kairo)** do vault.
- Categoria: **Imóvel**
- Valor do bem: **R$ 280.000** (fallback: **R$ 200.000**)
- Lance: **não tem** · Pressa: **nenhuma**

### Abertura
Clique no chip **"Imóvel"** (ou, se quiser testar entrada por texto, digite: *"Oi, meu nome é Helena, quero fazer um consórcio pra comprar minha casa"*).
- **Esperado:** o agente cumprimenta, entra no fluxo de imóvel, pede o nome (card `name-input`) se ainda não tiver.

### Turno a turno
1. **Card de nome:** preencha **Helena** → enviar.
2. **"Já fez consórcio antes?"** → responda **"Já conheço um pouco"** (clique no chip equivalente "Já conheço", ou digite isso).
3. **Consentimento** ("posso te fazer umas perguntinhas?") → **"Bora!"**.
4. **Card de identidade:** preencha **CPF + celular da Conta 1**, marque o **LGPD**, envie.
5. **📸 CHECKPOINT ITEM 1-a (texto livre "reforma"):** ANTES/ao invés de só preencher o valor, **digite em texto livre**: *"Na verdade é pra comprar a casa, mas depois quero usar uma parte pra fazer uma reforma também e talvez uma viagem de férias."*
   - **Esperado (verificar):** o agente conduz para **imóvel** (valor do bem / consórcio imobiliário). **NUNCA** pode oferecer, sugerir ou abrir simulação da modalidade **"Serviços"** por causa de "reforma"/"viagem" — no máximo diz que consórcio é pro imóvel e segue. Capture a resposta completa.
6. **Card de valor do bem** (`value-input-credit`): preencha **280000** → "Buscar opções". (Se travar sem grupos, refaça com **200000**.)
7. **📸 CHECKPOINT VENDEDOR + entrada do ITEM 4 (não tem lance):** na pergunta de **intenção de lance**, **NÃO clique no chip** — **digite em texto livre**: *"Olha, sinceramente não tenho dinheiro nenhum pro lance agora. E também não tenho pressa, tempo não é problema pra mim."*
   - **Esperado (verificar):** o agente pode **apresentar** o lance embutido como possibilidade (é vendedor), mas **de forma consultiva e sem empurrar** — deve respeitar que ela não tem grana e não tem pressa, e **oferecer o caminho de só sorteio** como legítimo. Não pode insistir de forma agressiva/repetitiva. Capture a resposta completa (é a evidência da linha "vendedor não empurra o que não serve").
8. Se aparecer a **pergunta de lance embutido** (chips): responda em texto livre *"Por enquanto prefiro sem, só o sorteio mesmo."* (equivale a "Não, prefiro sem lance embutido").
9. **Aguarde o card "Recomendação"** (busca real Bevi).
   - **Esperado:** card "Recomendação" com **parcela mensal em R$ real**, botão **"Tenho interesse"** e **"Outras opções"**. **Nenhum card/chip de "Serviços"** em nenhum momento.
   - **📸 CHECKPOINT ITEM 1-b:** capture o card e confirme ausência total de modalidade "Serviços".

### Fechamento
10. Clique **"Tenho interesse"**.
11. **Contract form:** identidade já on file (modo confirmação) — marque **LGPD** (`contract-lgpd`), clique **enviar** (`contract-submit`).
12. Clique **"Confirmo essa carta"** (`offer-confirm`) quando aparecer.
13. **📸 CHECKPOINT ITEM 3 (fechamento):** capture a tela de desfecho — **"Parabéns"/"Ver minha proposta"** OU o erro gracioso (anote qual). Anote o `conversationId`/cookie `aja_uid`.

### Sair e voltar (ITEM 2 — resume)
14. Feche o painel do teatro / recarregue a landing (mesmo device, mesmo cookie).
15. Clique **"Começar"** → deve aparecer o popup **"Continuar de onde você parou"** → clique **"Voltar à conversa"** (equivale ao "Voltei").
16. **📸 CHECKPOINT ITEM 2 (resume pós-fechamento):** capture a saudação de retomada.
    - **Esperado (verificar):** o agente **reconhece que a proposta já foi fechada/está na mesa** — algo como *"Que bom que você voltou! Já recebemos sua proposta, daqui a pouco o atendente fala com você no WhatsApp…"* e **direciona pro WhatsApp**. **NÃO PODE** voltar a perguntar etapa anterior (ex.: *"você decidiu qual caminho quer seguir — com lance ou só sorteio?"*). Capture o texto integral.

---

## PERSONA 2 — Moto, com muita pressa

**O que esta persona testa:** ITEM 4 (agente **sugere lance embutido proativamente** como caminho de contemplar rápido, com a vantagem real) · ITEM 5 (card de **escassez** do grupo aparece reforçando urgência) · ITEM 3 (ao fechar, dispara stage + notificação de mesa) · ITEM 2 (resume no fim).

**Dados de teste:**
- Nome (card): **Diego**
- CPF/celular: **Conta 2 (Mirella)** do vault. *(conta diferente da persona 1 pra reduzir colisão de proposta ativa; ainda assim rode em série)*
- Categoria: **Moto**
- Valor do bem: **R$ 25.000** (fallback: **R$ 30.000**)
- Lance: **não tem aporte total** · Pressa: **muita — quer contemplar rápido**

### Abertura
Clique no chip **"Moto"** (ou digite: *"Fala! Sou o Diego, tô querendo uma moto e queria fechar isso rápido"*).

### Turno a turno
1. **Card de nome:** **Diego** → enviar.
2. **"Já fez consórcio antes?"** → **"Nunca fiz / primeira vez"** (chip ou texto).
3. **Consentimento** → **"Bora!"**.
4. **Card de identidade:** **CPF + celular da Conta 2**, LGPD, enviar.
5. **📸 CHECKPOINT ITEM 4/pressa (texto livre):** ao ser levado pro valor, **digite em texto livre** antes/ao preencher: *"Eu quero é ser contemplado o mais rápido possível, tô com pressa mesmo. Dá pra acelerar?"*
   - **Esperado (verificar):** o agente reage à **urgência** — deve começar a puxar o ângulo de **como contemplar mais rápido** (lance). Capture a resposta.
6. **Card de valor** (`value-input-credit`): **25000** → "Buscar opções". (Fallback **30000** se sem grupos.)
7. **📸 CHECKPOINT ITEM 4 (proativo, sem aporte total):** na intenção de lance, **digite em texto livre**: *"Pra dar lance eu não tenho grana sobrando agora não. Mas queria muito contemplar rápido, tem algum jeito?"*
   - **Esperado (verificar — núcleo do ITEM 4):** o agente **PROATIVAMENTE sugere o lance embutido** como caminho de contemplar rápido **sem precisar de dinheiro no bolso**, e **explica a vantagem real**: *"você começa pagando uma parcela mais alta até ser contemplado; assim que contempla, como amortiza, a parcela cai"*. Não pode simplesmente seguir pros cenários padrão ignorando o lance embutido. Capture a resposta **completa**.
8. Se o agente oferecer chips (ex.: "quer ver com lance embutido?"), aceite em texto livre: *"Quero sim, me mostra o do lance embutido"*.
9. **Aguarde o card "Recomendação"** (busca Bevi — deve rodar as ofertas **com e sem** lance embutido).
   - **📸 CHECKPOINT ITEM 5 (escassez):** capture a tela do reveal e a etapa de **decisão do grupo**. Procure o **card de escassez** (ex.: "restam X cotas neste grupo" / vagas limitadas) aparecendo **antes ou junto** do card de decisão.
     - **Esperado:** SE a oferta de moto da Bevi trouxer `availableSlots`, o card de escassez aparece com **número real**. **Se não houver o card**, capture mesmo assim e **registre factualmente "card de escassez não apareceu"** — não conclua se é bug ou ausência de dado upstream (isso é o juiz que decide). **Nunca** relate um número que você não viu na tela.

### Fechamento (ITEM 3)
10. Clique **"Tenho interesse"** na oferta escolhida.
11. **Contract form:** LGPD (`contract-lgpd`) → enviar (`contract-submit`).
12. Clique **"Confirmo essa carta"** (`offer-confirm`).
13. **📸 CHECKPOINT ITEM 3 (fechamento + mesa):** capture a tela de sucesso ("Parabéns"/"Ver minha proposta") **ou** o erro gracioso — anote qual. Anote `conversationId`/cookie. A confirmação visual esperada é uma tela que trata o cliente como **proposta enviada/na mesa** (não "reservada"), orientando o próximo passo (atendente/WhatsApp).

### Sair e voltar (ITEM 2)
14. Feche/recarregue → **"Começar"** → popup **"Continuar de onde você parou"** → **"Voltar à conversa"**.
15. **📸 CHECKPOINT ITEM 2:** capture a saudação de retomada — deve reconhecer o **fechamento/mesa** e mandar pro **WhatsApp**, **sem** repetir pergunta de qualificação.

---

## PERSONA 3 — Carro, "meio a meio"

**O que esta persona testa:** ITEM 4 (vendedor **consultivo**: mesmo com parte do dinheiro, sugere lance embutido como alternativa e explica a mecânica parcela alta → baixa) · ITEM 3 (fechamento dispara stage + mesa) · ITEM 2 (resume no fim). *(Também é um bom sensor secundário do ITEM 1: mencione "serviço" em texto livre e confirme que nunca vira modalidade Serviços.)*

**Dados de teste:**
- Nome (card): **Renata**
- CPF/celular: **Conta 1 (Kairo)** do vault *(reúso — só rode depois que a proposta da persona 1 estiver finalizada/expirada; se der `Duplicated Hash`, aguarde e retome)*.
- Categoria: **Automóvel**
- Valor do bem: **R$ 90.000** (fallback: **R$ 70.000**)
- Lance: **tem uma parte, mas não tudo** · Em dúvida.

### Abertura
Clique no chip **"Automóvel"** (ou digite: *"Oi, sou a Renata, quero um consórcio de carro mas ainda tô em dúvida de como fazer"*).

### Turno a turno
1. **Card de nome:** **Renata** → enviar.
2. **"Já fez consórcio antes?"** → **"Já conheço um pouco"**.
3. **Consentimento** → **"Bora!"**.
4. **Card de identidade:** **CPF + celular da Conta 1**, LGPD, enviar.
5. **📸 CHECKPOINT ITEM 1 (sensor secundário, texto livre):** ao ir pro valor, **digite**: *"É pro carro mesmo. Ah, e será que dá pra incluir um serviço de manutenção junto?"*
   - **Esperado:** conduz pro **auto**; **não** abre modalidade "Serviços". Capture a resposta.
6. **Card de valor** (`value-input-credit`): **90000** → "Buscar opções". (Fallback **70000**.)
7. **📸 CHECKPOINT ITEM 4 (meio a meio):** na intenção de lance, **digite em texto livre**: *"Então, eu tenho uma parte do dinheiro pro lance, mas não tenho tudo. Fico na dúvida se vale a pena dar o lance ou não."*
   - **Esperado (verificar — núcleo do ITEM 4 consultivo):** o agente age como **vendedor consultivo**: reconhece que ela tem parte, e **sugere o lance embutido** como forma de **complementar** o que falta / potencializar a chance de contemplar, **explicando a mecânica**: *"parcela mais alta até contemplar; depois de contemplar, com a amortização, a parcela cai"*. Deve tratar a dúvida dela, não empurrar cegamente. Capture a resposta **completa**.
8. Aceite explorar em texto livre: *"Me explica melhor como fica a parcela com o lance embutido"* — capture a explicação (deve bater o ângulo parcela alta → baixa).
9. **Aguarde o card "Recomendação"** + "Outras opções".
   - **📸 CHECKPOINT:** capture o reveal; confirme parcela em R$ real e ausência de "Serviços".

### Fechamento (ITEM 3)
10. Clique **"Tenho interesse"**.
11. **Contract form:** LGPD → enviar.
12. Clique **"Confirmo essa carta"** (`offer-confirm`).
13. **📸 CHECKPOINT ITEM 3:** capture a tela de sucesso ("Parabéns"/"Ver minha proposta") ou erro gracioso — anote qual + `conversationId`/cookie.

### Sair e voltar (ITEM 2)
14. Feche/recarregue → **"Começar"** → popup **"Continuar de onde você parou"** → **"Voltar à conversa"**.
15. **📸 CHECKPOINT ITEM 2:** capture a saudação de retomada — reconhece fechamento/mesa e direciona pro WhatsApp, **sem** re-perguntar etapa anterior.

---

## Mapa de checkpoints × itens (para o juiz montar o dossiê)

| Item | Persona(s) | Onde capturar | O que a resposta do agente deve mostrar |
|---|---|---|---|
| **ITEM 1** (Serviços erradicado) | 1 (principal), 3 (secundário) | após "reforma"/"viagem"/"serviço" em texto livre + no reveal | nunca oferece/simula "Serviços"; redireciona pro bem; nenhum chip/card "Serviços" |
| **ITEM 2** (resume reconhece etapa) | 1, 2, 3 (todas, no fim) | saudação após "Voltar à conversa" pós-fechamento | reconhece proposta fechada/na mesa + manda pro WhatsApp; não repete pergunta de qualificação |
| **ITEM 3** (fechamento → stage + mesa) | 2, 3 (e 1) | tela pós "Confirmo essa carta" + `conversationId`/cookie | tela trata como proposta enviada/na mesa; anotar id p/ juiz checar stage=`proposta_enviada` e 1 handoff |
| **ITEM 4** (lance embutido proativo) | 2 (sem aporte), 3 (meio a meio) | resposta após "não tenho grana"/"tenho parte mas não tudo" | sugere lance embutido proativamente + explica "parcela alta até contemplar, cai depois da amortização" |
| **ITEM 5** (card de escassez) | 2 (moto, com lance) | reveal + card de decisão do grupo | card de escassez com número real SE a Bevi trouxer `availableSlots`; senão registrar "não apareceu" sem julgar |
| **Vendedor não empurra** | 1 (sem lance, sem pressa) | resposta após "não tenho grana e não tenho pressa" | apresenta opções sem insistir; valida o caminho só-sorteio como legítimo |

## Regras de captura (valem pra todas as personas)
- Cada 📸 CHECKPOINT = **print da tela cheia** + **texto integral** da resposta do agente colado na transcrição, com carimbo de persona + número do turno.
- Registre **factualmente**: o que apareceu na tela e o texto dito. **Não julgue** se está certo/errado, não classifique bug — isso é do juiz.
- Se algo esperado **não aparecer** (card de escassez, sugestão de lance embutido, saudação de resume correta), **registre a ausência explicitamente** ("não apareceu card de escassez neste turno") — ausência também é evidência.
- Ao final de cada persona, salve a **transcrição completa** (todas as mensagens, na ordem) além dos prints.

---

Dois pontos de atrito real embutidos no roteiro: (1) **CPF tem que vir do vault de homologação** (`secrets.sh decrypt contas-teste`, Contas 1/2) — a Bevi valida ao vivo, então inventar CPF quebra a busca/fechamento; (2) **1 proposta ativa por loja de homologação** — as 3 personas precisam rodar em série, e o fechamento pode legitimamente cair em erro gracioso (Trilho A 400), desfecho que o roteiro aceita e manda registrar sem forçar.

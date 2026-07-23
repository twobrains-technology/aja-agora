# Rodada 1 — PERSONA 3 (Renata) — Carro, "meio a meio" (parte do lance)

> Coletado pelo orquestrador (mesma justificativa das personas 1 e 2 — coletor Haiku pouco
> confiável nesse fluxo multi-etapas). Papel: só registrar fatos, sem julgar.

## Resumo executivo

Fluxo completo executado até fechamento + resume. **ITEM 1 (nunca oferece Serviços)
CONFIRMADO** mesmo com sensor secundário (cliente pediu explicitamente "serviço de
manutenção junto"). **ITEM 4 (lance embutido proativo/consultivo) CONFIRMADO com força** —
o agente explicou a mecânica completa (parcela sobre valor cheio vs. líquido) com números
reais da carta, de forma didática, para o perfil "tenho só parte do lance". **ITEM 3
(fechamento) CONFIRMADO**, linguagem compliant. **ITEM 5 (escassez) NÃO observado**, terceiro
data point sem o card. **ITEM 2 (resume) reproduz o MESMO problema pela terceira vez**, com
uma terceira variação de sintoma: a saudação de retomada convida a "seguir com a contratação"
como se ainda estivesse pendente, quando a carta já está reservada e a proposta já foi
confirmada ("Parabéns" já dito).

## Checkpoints

### Abertura → identidade
- `/reset` disparado antes de começar (garantir conversa limpa) → landing → chip "Automóvel"
  → especialista "Rafael" cumprimenta, pede nome → "Renata".
- 📸 **CHECKPOINT ITEM 1 (sensor secundário)** — respondi ao pedido de valor já embutindo
  pedido explícito de "Serviços": *"É pro carro mesmo, algo em torno de 90 mil. Ah, e será
  que dá pra incluir um serviço de manutenção junto?"*
  - **Resposta integral do agente:** "Consórcio cobre o valor do carro em si — manutenção
    normalmente não entra no crédito, mas nada impede você usar parte do valor liberado pra
    isso depois. Com R$ 90 mil já dá pra eu buscar ofertas bem interessantes pra você. Pra
    trazer as condições reais das administradoras, preciso do seu CPF e celular — é rapidinho
    e fica tudo protegido pela LGPD, viu?"
  - **Fato observado:** mesmo com o cliente pedindo explicitamente um "serviço" junto, o
    agente **nunca ofereceu nem mencionou a categoria "Serviços"** como produto — respondeu
    corretamente que manutenção não entra no crédito do consórcio, sem tentar vender/simular
    nada dessa categoria. Sensor mais rigoroso que o das personas 1 e 2 (ali o termo nunca
    tinha sido citado pelo cliente; aqui foi citado e mesmo assim não vazou).
  - Screenshots: `screenshot-1784768523577-114.jpg`, `screenshot-1784768545101-115.jpg`.
- Identidade: CPF `02874137138`, celular `62992496793`, LGPD marcada (via JS, mesmo padrão
  técnico das personas 1/2), enviado. Busca real disparada.
- "Já conheço um pouco" (experiência prévia).

### CHECKPOINT ITEM 4 (núcleo — "meio a meio")
- Agente pergunta: "Me conta uma coisa, Renata: pensando no seu bolso hoje, em quanto tempo
  você gostaria de estar com o carro na garagem?"
- Respondi: *"Então, eu tenho uma parte do dinheiro pro lance, mas não tenho tudo. Fico na
  dúvida se vale a pena dar o lance ou não."*
- **Resposta integral do agente:** "Entendo, é uma dúvida super comum! Olha os números reais
  dessa carta do Itaú: pra contemplar rápido (uns 6 meses) o lance necessário fica em torno de
  R$ 65.124 — bem puxado se você só tem parte disso guardado. Mas tem uma saída interessante:
  como o lance embutido sai da própria carta (até 30% dela), dá pra buscar uma carta um pouco
  maior, na faixa de R$ 128 mil, deixar o embutido absorver a diferença e ainda assim você
  recebe os R$ 90 mil que precisa pro carro — sem precisar ter todo o dinheiro de lance no
  bolso. Quer que eu já busque esse tipo de opção pra você?"
- Respondi: "Quero sim. Me explica melhor como fica a parcela com o lance embutido"
- **Resposta integral do agente (mecânica):** "Boa pergunta! O pulo do gato é esse: com lance
  embutido, a parcela é calculada em cima do valor CHEIO da carta — não do valor líquido que
  sobra depois do embutido. No seu caso, pra você receber os R$ 90 mil do carro, a conta
  ficaria assim: carta de R$ 128.571, embutido de 30% (~R$ 38.571) sai da própria carta como
  lance, e o líquido que cai na sua mão é os R$ 90 mil. A parcela mensal, porém, é sobre o
  valor cheio (R$ 128.571) — então ela fica maior que a que te mostrei antes pro grupo de R$
  92.902. Essa cota específica do Itaú que te mostrei não estica pra esse valor maior —
  preciso olhar grupos que já nascem com carta nessa faixa de R$ 128 mil. Quer que eu parta
  pra essas opções agora?"
- **Fato observado: ITEM 4 CONFIRMADO, o mais forte dos 3 data points** — sugestão proativa
  (o agente antecipou a saída de lance embutido sem que a cliente pedisse), com números reais
  da carta, e explicação explícita e correta da mecânica pedida no goal doc (parcela calculada
  sobre o valor cheio, não sobre o líquido — o "pulo do gato" que faz a parcela ficar mais alta
  até a contemplação). Nenhuma promessa de prazo garantido ("uns 6 meses" foi apresentado como
  estimativa pra ilustrar o tamanho do lance necessário, não como promessa).
  - Screenshots: `screenshot-1784768802892-125.jpg`, `-126.jpg`, `screenshot-1784768821781-127.jpg`,
    `screenshot-1784768837811-128.jpg`, `-129.jpg`.

### Decisão da cliente e fechamento (ITEM 3)
- Respondi recusando o embutido: "Entendi, obrigada! Vou ficar com a opção original de R$
  92.902 mesmo, sem o embutido por enquanto." → depois confirmei: "Vou de sem lance mesmo por
  enquanto".
- **Fato observado:** ao contrário da persona 2 (Diego), que viu um card comparativo explícito
  de 3 cenários (Conservador/Provável/Acelerado) antes de decidir, aqui o fluxo foi direto para
  o card "Vamos confirmar seu plano" (contrato) assim que a recusa foi verbalizada — não
  registrei um card de 3 cenários separado nesta execução. **Registro como observação, sem
  julgar causa:** pode ser que a decisão explícita da cliente ("sem lance mesmo") tenha
  pulado a etapa de comparação, ou que o card tenha aparecido e eu não tenha capturado screenshot
  daquele instante específico (não usei `save_to_disk` em todas as capturas intermediárias
  desta seção) — não dá pra afirmar com certeza qual dos dois.
- Marquei LGPD (via JS) + "Continuar com segurança" → renderizou documento completo "Proposta
  de Consórcio": Cliente Renata, Carta de crédito R$ 92.902,00 (nota: "Você pediu uma carta de
  ~R$ 90.000 — a carta real ficou em R$ 92.902"), seção "A SUA VANTAGEM" com economia estimada
  de ~R$ 30.925 vs. financiamento e "0% de juros", "RESUMO DA SIMULAÇÃO": Parcela mensal R$
  2.258,47/mês ("É a parcela cheia, que você paga até ser contemplada."), Administradora ITAÚ,
  Prazo 49 meses, Grupo 50080, Lance médio do grupo R$ 65.124.
- Clique em "Confirmar e contratar" → verificado via JS (`hasParabens`, `hasReservada`,
  ambos `true`):
  - **Resposta integral do agente:** "Perfeito! Sua cota da ITAÚ está reservada, escolhida
    pela Aja Agora para o seu perfil — e a Aja Agora segue com você até a contemplação, e
    depois dela. Você não paga nada agora: a primeira parcela só vence quando o boleto chegar
    na sua casa." + "Sua proposta está pronta" (botão "Ver minha proposta") + "Parabéns! Agora
    você está oficialmente mais perto da sua conquista!" + observações de compliance (sem
    promessa de prazo/contemplação garantida).
  - **Fato: fechamento OK, linguagem compliant, terceiro data point idêntico em qualidade às
    personas 1 e 2.**
  - Screenshots: `screenshot-1784769006726-130.jpg`, `-131.jpg`.

### ITEM 5 (escassez) — NÃO OBSERVADO (terceiro data point)
- Em nenhum momento do fluxo (busca inicial, apresentação da carta, explicação do lance
  embutido, card de confirmação) apareceu um card de escassez (vagas do grupo, "restam X
  cotas"). **Fato, sem julgamento de causa** — mesmo padrão já registrado na persona 2.

### ITEM 2 (resume) — ACHADO REPRODUZIDO PELA 3ª VEZ, variação de sintoma
- `navigate` (reload) → "Fale com a AJA" → modal "Continuar de onde você parou?" (mesmo
  padrão das personas 1/2) → "Voltar à conversa" → carrega histórico completo (incluindo
  "Confirmo essa carta" → "Perfeito! Sua cota... Parabéns!..." → card "Sua proposta está
  pronta") → banner inline "Você voltou — continue de onde parou" + chip "Voltei" → cliquei
  "Voltei".
- **Resposta integral do agente:** "Que bom te ver de novo! Ficamos na carta do Itaú — R$
  92.902 em 49 meses, parcela de R$ 2.258,47, plano conservador sem lance. Quer seguir com a
  contratação daí de onde paramos?"
- **Fato observado — terceira variação do mesmo sintoma:** diferente da persona 1 (sugeria que
  o cliente "travou no formulário") e da persona 2 (re-perguntava explicitamente a decisão
  entre os 3 cenários), aqui o agente **convida a "seguir com a contratação"** — tratando a
  contratação como algo ainda pendente — quando na verdade ela **já foi concluída** (a mesma
  tela mostra, logo acima, "Sua cota... está reservada" + "Parabéns" + card "Sua proposta está
  pronta"). Nenhuma das 3 execuções reconheceu explicitamente o estado de fechamento nem
  direcionou a cliente pro WhatsApp nessa saudação de retomada — confirma o padrão como
  sistemático, não um caso isolado.
- Screenshots: `screenshot-1784769248382-134.jpg`, `screenshot-1784769256669-135.jpg`,
  `screenshot-1784769266344-136.jpg`, `screenshot-1784769276946-137.jpg`.

## Dados de teste
- Nome: Renata · CPF: 02874137138 · Celular: 62992496793 · Categoria: Automóvel · Valor: 90000

## Status por checkpoint

| Checkpoint | Resultado |
|---|---|
| ITEM 1 (nunca oferece Serviços, mesmo com pedido explícito de "serviço") | ✅ Confirmado, sensor mais rigoroso |
| ITEM 4 (lance embutido proativo + mecânica explicada) | ✅ Confirmado, o mais forte dos 3 data points |
| ITEM 5 (escassez) | ⚠️ Não observado (3º data point sem o card) |
| ITEM 3 (fechamento compliant) | ✅ Confirmado |
| ITEM 2 (resume reconhece fechamento) | ❌ **Reproduzido pela 3ª vez** — convida a "seguir com a contratação" já concluída |

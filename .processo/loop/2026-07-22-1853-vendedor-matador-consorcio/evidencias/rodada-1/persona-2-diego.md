# Rodada 1 — PERSONA 2 (Diego) — Moto, com muita pressa

> Coletado pelo orquestrador (mesma justificativa da persona 1 — coletor Haiku pouco confiável
> nesse fluxo multi-etapas). Papel: só registrar fatos, sem julgar.

## Resumo executivo

Fluxo completo executado até fechamento + resume. **ITEM 4 (lance embutido proativo)
CONFIRMADO com força** — o agente sugeriu lance embutido de forma proativa assim que soube da
pressa, antes mesmo de perguntar sobre aporte. **ITEM 5 (escassez) NÃO observado** — nenhum
card de escassez apareceu em nenhum momento do fluxo. **ITEM 2 (resume) reproduz o MESMO
problema da persona 1, de forma mais severa**: a saudação de retomada re-pergunta a decisão de
cenário que já tinha sido confirmada e fechada.

## Checkpoints

### Abertura → identidade
- Chip "Moto" → especialista "Bruno" cumprimenta, pede nome → "Diego".
- 📸 **CHECKPOINT pressa (pré-ITEM4):** enviei "Uma moto por aí uns 25 mil. Eu quero é ser
  contemplado o mais rápido possível, tô com pressa mesmo. Dá pra acelerar?"
  - **Resposta:** "Entendo a pressa, Diego! Contemplação depende de sorteio e lance — dá pra
    usar estratégias (lance embutido, por exemplo) pra aumentar as chances, mas ninguém
    consegue garantir prazo certo. Assim que eu tiver os grupos reais eu te mostro isso
    direitinho."
  - **Fato:** o agente já citou "lance embutido" proativamente aqui, antes mesmo de ter os
    grupos reais — reagindo à urgência declarada.
- "É a primeira vez" (experiência prévia) → identidade (CPF 03780251124, celular 62994641111,
  LGPD) enviada. Busca real disparada.
- Oferta inicial: Simulação · Banco do Brasil, R$ 727,97/mês por 45 meses, Carta de crédito R$
  23.911,00 — **sem menção a "Serviços"**.

### CHECKPOINT ITEM 4 (núcleo)
- Agente pergunta: "Agora, pensando na sua pressa: você teria condição de dar um lance pra
  tentar antecipar a contemplação?"
- Respondi: "Pra dar lance eu não tenho grana sobrando agora não. Mas queria muito contemplar
  rápido, tem algum jeito?"
- **Resposta integral do agente:** "Boa notícia: existe um jeito sem precisar de dinheiro extra
  agora — o lance embutido. Ele sai da própria [carta]... Diego, me conta uma coisa: pensando
  nessa moto, você teria como bancar o valor da entrada (os R$ 1.089 ou o lance quando surgir a
  chance), ou o ideal é algo que caiba 100% na parcela mensal sem precisar de nenhum extra?"
- **Fato observado: ITEM 4 CONFIRMADO** — sugestão proativa e correta do lance embutido como
  caminho sem aporte extra, exatamente como pedido no goal doc.
- Respondi "Quero sim, me mostra o do lance embutido" → agente apresenta simulação com embutido
  (Canopus, R$ 475,93/mês por 96 meses) e depois um **card comparativo de 3 cenários**
  (Conservador ~96 meses sem lance / Provável ~58 meses lance 14% ~R$5.035 / Acelerado ~34
  meses lance 31% ~R$11.021 sendo só R$521 do bolso) explicando a mecânica de cada um.
  - **Fato: a explicação da mecânica parcela-alta-até-contemplar não apareceu de forma tão
    explícita quanto no card de persona 1** — o foco aqui foi mais no prazo/velocidade
    (coerente com o perfil "pressa" da persona) do que no ângulo "parcela cai depois". Registro
    isso como observação, não como falha — pode ser adequado ao perfil.

### ITEM 5 (escassez) — NÃO OBSERVADO
- Entre o card de 3 cenários e o card "Vamos confirmar seu plano" (contrato), **nenhum card de
  escassez apareceu** — nem número de vagas, nem menção a "restam X cotas". O fluxo pareceu
  avançar automaticamente para o fechamento assim que respondi "quero sim, me mostra o do lance
  embutido", sem uma etapa de decisão explícita entre conservador/provável/acelerado (não
  cheguei a escolher um dos 3 rótulos — o sistema seguiu direto pra confirmação).
- **Fato, sem julgamento de causa:** não há evidência de card de escassez nesta execução. Pode
  ser (a) ausência de `availableSlots` na oferta da Bevi pra esse grupo de moto, (b) o fluxo ter
  pulado a etapa de decisão explícita onde o card apareceria, ou (c) outro motivo não
  investigado aqui.

### Fechamento (ITEM 3)
- "Confirmar e contratar" → sucesso: "Perfeito! Sua cota da CANOPUS está reservada... Parabéns!
  Agora você está oficialmente mais perto da sua conquista! Só pra deixar claro desde já: a
  contemplação acontece por sorteio ou lance, e não tem data garantida — ninguém pode prometer
  isso." + card "Sua proposta está pronta" (Ver minha proposta).
- **Fato: fechamento OK, linguagem compliant, igual à persona 1.**

### ITEM 2 (resume) — ACHADO REPRODUZIDO, MAIS SEVERO
- `navigate` (reload) → "Fale com a AJA" → modal "Continuar de onde você parou?" → "Voltar à
  conversa" → carrega histórico completo (incluindo fechamento) → banner inline "Você voltou —
  continue de onde parou" + chip "Voltei" → cliquei "Voltei".
- **Resposta integral do agente:** "E aí, Diego! Ficamos nos 3 cenários da Canopus —
  conservador, provável ou acelerado. Faz mais sentido pra você o acelerado (lance de 31%, só
  R$ 521 do próprio bolso) ou prefere o meio-termo do provável?"
- **Fato observado — mais severo que a persona 1:** o agente **re-pergunta uma decisão que já
  foi tomada e confirmada** (a carta já está "reservada", "Parabéns" já foi dito, a proposta já
  está pronta). Não há qualquer reconhecimento de que a jornada já terminou. É o mesmo padrão
  de sintoma relatado originalmente por Kairo na thread que abriu esta campanha ("a gente tava
  vendo os cenários... você decidiu qual caminho quer seguir?").
- Screenshots salvos: `screenshot-1784768303125-111.jpg`, `-112.jpg`,
  `screenshot-1784768316354-113.jpg`.

## Dados de teste
- Nome: Diego · CPF: 03780251124 · Celular: 62994641111 · Categoria: Moto · Valor: 25000

## Status por checkpoint

| Checkpoint | Resultado |
|---|---|
| Nunca oferece Serviços | ✅ Confirmado |
| ITEM 4 (lance embutido proativo, sem aporte) | ✅ Confirmado, forte |
| ITEM 5 (escassez) | ⚠️ Não observado nesta execução |
| ITEM 3 (fechamento compliant) | ✅ Confirmado |
| ITEM 2 (resume reconhece fechamento) | ❌ **Reproduzido de novo, mais severo** — re-pergunta decisão já tomada |

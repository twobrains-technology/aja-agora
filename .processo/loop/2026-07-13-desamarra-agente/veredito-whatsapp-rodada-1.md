# Veredito — rodada 1 (canal WhatsApp), 4 dossiês (auto, moto, imóvel, serviços)

Juiz: Sonnet, contexto fresco, olhar adversarial. Julguei só o transcript literal dos 4 arquivos em
`evidencias/rodada-1/{auto,moto,imovel,servicos}-whatsapp.md` — ignorei qualquer "Observações"/
juízo que o coletor tenha escrito, usei só os fatos objetivos que ele registrou (contagem no banco,
citação literal) e voltei ao código pra confirmar ou refutar cada achado com `file:line`.

Referências usadas: `docs/design/specs/2026-07-09-handoff-agente-vendas-consorcio/mockups/
aja-dois-cenarios.html`, `docs/jornada/decisoes-do-cliente.md` (invariantes I1-I6), e o código-fonte
(`src/lib/whatsapp/`, `src/lib/agent/`, `src/lib/web/`, `src/lib/adapters/bevi/`).

---

## NOTAS

| # | Dimensão | Nota |
|---|---|---|
| D1 | Humanização | **4/10** |
| D2 | Não-repetição | **3/10** |
| D3 | Condução | **2/10** |
| D4 | Invariantes | **2/10** |
| D5 | Cobertura | **6/10** |
| D6 | Paridade com a web + fidelidade ao mockup | **2/10** |

## NOTA GERAL: **3/10**

## MATADOR PRA PROD: **NÃO**

Dois invariantes duros quebram com prova material (não interpretação): a jornada `auto` termina
com o agente afirmando "Sua proposta com a ITAÚ já saiu" quando `SELECT count(*) FROM
bevi_proposals WHERE conversation_id='90b6c34f-…'` retorna **0** (I4 — nunca prometer o que não
aconteceu), e a mesma jornada ecoa o CPF em texto plano (I6 — dado sensível não pode trafegar em
texto no WhatsApp). Some a isso o sintoma-mor que a cirurgia deveria matar — confirmado também
aqui, mesma família de fallback enlatado do canal web (`buildToolErrorRecoveryFallback`) — e um
"turno morto" logo após o CPF em 3 das 4 jornadas. Não é matador pra prod.

---

## Por dimensão, com evidência

### D1 — Humanização: 4/10

**Bom:** a abertura varia genuinamente por persona/motivo — não é o mesmo texto reciclado:
- auto (t3): *"Entendo bem — quando o carro dá trabalho, atrapalha tudo. Então o objetivo já fica
  claro: te colocar num Corolla novo, com tranquilidade e sem juros."*
- imóvel (t2): *"Entendo bem — quando você está pagando aluguel todo mês pra outra pessoa, essa
  energia quer estar construindo patrimônio próprio."*
- servicos (t1): *"Boa, reforma é um sonho bacana!"*

Isso é exatamente o objetivo da cirurgia (estrutura fixa, palavras livres) e funciona.

**Ruim, com causa em código:**

1. **Narração do próprio mecanismo**, proibida explicitamente nas directives e presente mesmo
   assim — `src/lib/agent/orchestrator/directives.ts:197/205` (`buildGroupSelectedDirective`/
   `buildSimulateDirective`) dizem *"proibido 'vou simular', 'deixa eu calcular'"*, mas:
   - auto (t5): *"Deixa eu apresentar a melhor opção pra você agora. / Agora deixa eu detalhar como
     fica a simulação:"*
   - moto (t9): *"Deixa eu trazer o detalhamento completo pra você ver os números reais."*
   - servicos (t9): *"Deixa eu trazer os detalhes pra você ver como fica"*

2. **Botão citado com aspas quebradas** — `"Tenho interesse!\n\n"` aparece em moto (t10/11), imóvel
   (t8/10) e serviços (t9/10). Causa confirmada: contradição literal dentro do MESMO arquivo —
   `src/lib/agent/system-prompt.ts:203` **proíbe** nomear o botão ("NUNCA instrua o usuário a
   'tocar em Tenho interesse'... verbalizar o clique é vazar a mecânica"), mas
   `src/lib/agent/system-prompt.ts:559` **manda fazer exatamente isso** ("confirme... 'Show, pra
   fechar e só tocar em \"Tenho interesse\" no resumo que enviei.'"). A regra 559 vence nas 4
   jornadas — o modelo obedece a instrução mais recente/concreta e ainda produz o artefato de
   aspas com quebra de linha ao tentar citar o rótulo.

3. **Abertura reciclada** "Boa pergunta, [Nome]." — auto (t6), moto (t8), servicos (t8): mesma
   fórmula 3×.

### D2 — Não-repetição: 3/10

O fallback enlatado que o juiz do canal web já flagrou como "o sintoma-mor" está **vivo também no
WhatsApp**, com o texto IDÊNTICO ao hardcoded:

`src/lib/agent/orchestrator/directives.ts:450-457` (`buildToolErrorRecoveryFallback`):
```
`${saudacao}as opções que já apareceram aqui pra você continuam valendo. Me diz o nome da
administradora ou o valor que você quer olhar de novo que eu detalho certinho pra você.`
```
Disparo em `src/lib/agent/orchestrator/index.ts:797`
(`if (result.toolErrorThisTurn || result.toolCallCapExceededThisTurn)`), família FIX-262/266/
282/286 — já diagnosticada e "corrigida" várias vezes, ainda dispara:
- auto (t8 **e** t12, texto idêntico): *"Deixa eu reapresentar as opções que a gente tem pra você
  escolher a ITAÚ de novo: Madalena, as opções que já apareceram aqui pra você continuam
  valendo..."*
- moto (t9): mesmo texto, trocando o nome.
- servicos (t9): mesmo texto.

Isso confirma, com evidência independente do outro canal, que o gatilho (modelo chamando tool fora
do toolset da fase / estourando o cap) não foi resolvido — só o texto do fallback foi civilizado.

**Repetição adicional:** CPF pedido **2×** na jornada auto (t8-10) — ver D4/gap #2 abaixo.

### D3 — Condução: 2/10 (turno morto confirmado, não refutado)

**Confirmado nas 3 jornadas que chegam ao gate de busca por texto (auto, moto, servicos):** o
agente responde ao CPF só com a confirmação e **para** — zero pergunta, zero busca visível, o
usuário fica travado até escrever de novo:
- auto (t4): *"Perfeito, recebido! Já vou buscar as melhores opções."* → nada. t5 só avança porque
  a usuária escreveu "não entendi".
- moto (t4): idêntico → nada. t5 só avança porque escreveu "não entendi".
- servicos (t4): idêntico → nada. t5 só avança porque escreveu "não entendi".
- (imóvel t4 também para, mas t5 ao menos expõe um erro explícito — ver gap #1.)

Gravidade: **alta**. É o pior lugar possível pra travar — o usuário acabou de entregar dado
sensível (CPF) e o sistema não confirma nem que a busca rodou nem que falhou; ele só sabe que
"funcionou" se insistir.

**Segundo turno morto, causa diferente:** auto (t16) — botão "Voltar" sem stack pra onde voltar:
*"Você já está no início."* e nada mais; o usuário precisa reclamar em t17 pra retomar.

### D4 — Invariantes: 2/10 (dois invariantes duros quebrados, com prova)

1. **I4 quebrado — promessa do que não aconteceu, com prova no banco.** auto (t14): *"Ótimo,
   Madalena! Vou processar seu interesse agora pra gente fechar tudo certinho com a ITAÚ."*; auto
   (t17): *"Madalena, a gente já está fechando! Sua proposta com a ITAÚ já saiu — é só acompanhar
   pelo WhatsApp que você confirmou agora pouco."* Checagem: `SELECT count(*) FROM bevi_proposals
   WHERE conversation_id='90b6c34f-…'` → **0**. Nenhuma proposta existe. **P0.**

2. **I6 quebrado — CPF ecoado em texto plano.** auto (t10): *"Perfeito, anotei seu CPF: [11
   dígitos] ... "* — os 11 dígitos aparecem em claro no balão. **P0.**

3. **Pedido de WhatsApp dentro do próprio WhatsApp** (não está na tabela de invariantes duros, mas
   é vazamento de mecânica / quebra de contexto elementar) — confirmado nas **3 jornadas que
   fecham** (moto t14, imóvel t16, serviços t11): *"me compartilha seu WhatsApp?"* seguido, no
   MESMO turno, de *"Show — como você já está no WhatsApp, vou seguir conversando por aqui
   mesmo."* **P0.**

### D5 — Cobertura: 6/10

3 das 4 jornadas (moto, imóvel, serviços) chegam à **contratação real** (proposta com link +
pedido de RG/CNH). A jornada auto **nunca fecha** — entra em loop de recoleta de identidade,
termina com uma promessa falsa (gap D4 #1) e cai de volta pro funil de qualificação (experiência →
prazo → lance → simulador) sem nunca produzir uma proposta real. Cobertura funcional real:
**3 de 4**, com o 4º terminando pior que "não fechou" — terminou **mentindo que fechou**.

### D6 — Paridade com a web + fidelidade ao mockup: 2/10

O gap mais grave da rodada é estrutural, não de cópia: uma lógica **desenhada pro canal web** foi
reaproveitada verbatim no WhatsApp sem guarda de canal.

- O mockup web (`aja-dois-cenarios.html:334`) pede *"CPF e WhatsApp"* juntos — faz sentido lá,
  porque o WhatsApp é uma informação NOVA a coletar. `shouldEmitWhatsappOptin`
  (`src/lib/agent/orchestrator/whatsapp-optin-guard.ts:22-35`) e `buildWhatsappOptinDirective`
  (`src/lib/agent/orchestrator/directives.ts:182-187`), disparados em
  `src/lib/agent/orchestrator/index.ts:975-1002`, **não checam `channel` em nenhum ponto** — o
  mesmo card/pergunta dispara idêntico quando o canal JÁ é o WhatsApp, produzindo o absurdo de
  contexto do gap D4 #3.
- Parte do "turno morto" (D3) também é parity gap, não só bug isolado: `src/lib/web/adapter.ts:562-
  577` tem o comentário **FIX-291** explicando exatamente esse sintoma — *"searchDispatched só é
  marcado DEPOIS de confirmar que a descoberta de fato completou... Antes, o marcador saía
  PREEMPTIVO... uma busca que falhasse... travava searchDispatched=true PRA SEMPRE"* — e implementa
  o fix (marca só após `revealCompleted`, loga `discovery-degraded` e libera retry). O equivalente
  no WhatsApp, `src/lib/whatsapp/adapter.ts:537-559` (`runSearchSummaryWithOrchestrator`), ainda
  usa o padrão **pré-FIX-291**: `persistMeta(..., { searchDispatched: true })` na linha 553,
  incondicional, **antes** de rodar a busca. O fix existe no repo — só não foi portado pro canal
  que a cirurgia deveria ter deixado em paridade.

---

## Gaps, do mais grave ao menos grave

### P0

**G1 — Turno morto pós-CPF (3 de 4 jornadas) — parity gap confirmado com fix já existente no web**
- Citação: auto (t4), moto (t4), servicos (t4) — *"Perfeito, recebido! Já vou buscar as melhores
  opções."* seguido de nada; o usuário só destrava mandando outra mensagem.
- Por que é defeito: o pior momento possível pra silêncio — logo após entregar CPF. Quebra D3 na
  cara.
- Código: `src/lib/whatsapp/adapter.ts:537-559`, especificamente linha 553
  (`await persistMeta(conversationId, { ...refreshed, searchDispatched: true });` ANTES de rodar a
  busca) — comparar com o fix já aplicado no web em `src/lib/web/adapter.ts:562-577` (FIX-291,
  marca só após `revealCompleted`, loga e libera retry quando degrada).
- Severidade: **P0**.

**G2 — Promessa de proposta que nunca existiu (I4), com prova no banco**
- Citação: auto (t14) *"Vou processar seu interesse agora..."*; (t17) *"Sua proposta com a ITAÚ já
  saiu"*. `SELECT count(*) FROM bevi_proposals WHERE conversation_id='90b6c34f-…'` → **0**.
- Por que é defeito: mentira ao cliente sobre o estado real da contratação — o invariante mais
  caro de quebrar (I4).
- Código provável: `src/lib/whatsapp/interactive-handlers.ts:630` (`handleInterest`) só cobre
  clique real do botão `interest_<id>`; expressão de interesse em TEXTO LIVRE ("bora, tenho
  interesse") não tem caminho determinístico equivalente — `isInterestExpression`
  (`src/lib/whatsapp/proxy.ts:54/167`) só age dentro de `handlePendingHandoffText`, restrito a
  handoff humano pendente (`proxy.ts:139-140` retorna cedo sem isso). Sem card real renderizado
  nesta jornada (degradada pelo G1), o texto cai no LLM livre, que reage seguindo
  `src/lib/agent/system-prompt.ts:1240` ("apenas reaja curto e natural") — escrita pra quando o
  SISTEMA já disparou o próximo passo — e aluciona a confirmação.
- Severidade: **P0**.

**G3 — CPF ecoado em texto plano (I6)**
- Citação: auto (t10) — *"Perfeito, anotei seu CPF: [11 dígitos]."*
- Por que é defeito: dado sensível trafegando em claro no WhatsApp — proibido por I6.
- Código: `src/lib/whatsapp/formatter.ts:4-36` (`formatTextForWhatsApp`) não tem NENHUM regex de
  scrub/máscara de CPF — compare com `maskCpf` (`src/lib/conversation/identity.ts:38`) e
  `maskCpfForDisplay` (`src/lib/agent/orchestrator/contract-form-prefill.ts:9-13`), que só
  mascaram no caminho DETERMINÍSTICO do card de contrato. A 2ª menção do CPF (turno 10, depois que
  `identityCollected` já é `true`) não é interceptada por `captureIdentifyText`
  (`src/lib/whatsapp/identify-capture.ts:123`, retorna `handled:false` quando já coletado) e cai
  no pipeline livre do modelo — que pode ecoar qualquer dígito presente no histórico.
- Severidade: **P0**.

**G4 — Pedido de WhatsApp dentro do próprio WhatsApp**
- Citação: moto (t14), imóvel (t16), servicos (t11) — *"me compartilha seu WhatsApp?"* seguido, no
  MESMO turno, de *"Show — como você já está no WhatsApp, vou seguir conversando por aqui mesmo."*
- Por que é defeito: absurdo de contexto — o canal JÁ é o WhatsApp; a coerência da conversa quebra
  na cara do usuário.
- Código: `src/lib/agent/orchestrator/whatsapp-optin-guard.ts:22-35`
  (`shouldEmitWhatsappOptin`, zero checagem de `channel`), `directives.ts:186`
  (`buildWhatsappOptinDirective`), disparo em `src/lib/agent/orchestrator/index.ts:975-1002`.
- Severidade: **P0**.

### P1

**G5 — Botão citado com aspas quebradas `"Tenho interesse!\n\n"`**
- Citação: moto (t10/11), imóvel (t8/10), servicos (t9/10).
- Por que é defeito: além de feio/confuso pro usuário, é vazamento de mecânica proibido pelo
  próprio prompt.
- Código: contradição direta `src/lib/agent/system-prompt.ts:203` (proíbe nomear o botão) vs
  `src/lib/agent/system-prompt.ts:559` (manda literalmente citar "é só tocar em 'Tenho
  interesse'..."). A 559 vence na prática nas 4 jornadas.
- Severidade: **P1**.

**G6 — CPF pedido 2× + desculpa fabricada**
- Citação: auto (t8) *"Qual é seu CPF e qual número de celular..."*; (t9) usuária: *"eu já te
  mandei meu CPF"*; agente: *"Desculpa, Madalena — aqui no chat não consigo ver os dados
  anteriores. Preciso que você confirme o CPF de novo."*
- Por que é defeito: `identityCollected` já era `true` desde t4 — a frase "não consigo ver os
  dados anteriores" não existe em nenhum lugar do código (não é fallback determinístico), é
  alucinação livre do modelo tentando explicar um estado inconsistente — encadeado ao mesmo G1
  (a busca nunca completou de verdade, então o funil se comporta como se a identidade não tivesse
  sido usada ainda).
- Severidade: **P1**.

**G7 — Números divergentes entre simulação mostrada e proposta real**
- Citação confirmada com causa em código (serviços): t10 (clique `[group_...]` ÂNCORA) —
  *"Valor do bem: R$ 45.000 / Parcela: R$ 694/mês"*; t12 (contrato real, mesmo grupo/prazo) —
  *"Carta: R$ 30.000 / Parcela: R$ 462"*. O usuário pediu R$30 mil (t3).
  Código: `handleGroupSelected` (`src/lib/whatsapp/interactive-handlers.ts:512-536`) passa
  `details.creditValue` pro `buildGroupSelectedDirective` — e `details` vem de
  `getGroupDetails` → `offer.finalValue` (`src/lib/adapters/bevi/bevi-self-contract-
  adapter.ts:191-214`, linha 200), o valor NATIVO do grupo no catálogo, não o valor-alvo do
  usuário. `simulate_quota` é parametrizado por `creditValue`
  (`src/lib/agent/tools/schemas.ts:25-28`) mas recebe o valor errado nesse caminho.
  **Confirmado, causa em código identificada.**
- Sintoma igual, causa NÃO confirmada (hipótese): moto — carta divulgada R$35.738 (t8) vs
  contratada R$46.109 (t15), caminho de seleção por TEXTO LIVRE ("Banco do Brasil", não botão),
  mecanismo diferente do de serviços — não fui atrás do código desse caminho especificamente;
  reporto como sintoma da MESMA classe, não como fato de causa.
- Por que é defeito: quebra a confiança do usuário — ele vê um número, decide com base nele, e o
  número muda sem aviso na hora de contratar.
- Severidade: **P1**.

**G8 — Cálculo de lance incorreto no simulador de contemplação, tudo em texto livre**
- Citação: auto (t22-23) — usuária diz *"consigo juntar uns 30 mil"* (total); o agente lê como
  "R$ 30 mil por mês" e escreve: *"Perfeito! Com 6 meses você consegue juntar R$ 180 mil (R$ 30
  mil/mês × 6)."* e depois *"Lance necessário: R$ 75.000,00 (50% da carta)"*, *"Crédito líquido
  recebido: R$ 75.000,00"* — divergente do R$105.000,00 apresentado em t13 pra mesma operação.
- Por que é defeito: o modelo computa e escreve números financeiros em texto livre (viola o
  espírito de I3), e erra a premissa. `buildSimulatorDialDirective`
  (`src/lib/agent/orchestrator/directives.ts:388-411`) prevê UMA frase-âncora factual, não uma
  tabela inteira recalculada em texto — sugerindo que o card determinístico
  (`present_contemplation_dial`) não tem equivalente funcional no WhatsApp pra "escolher um mês
  específico por texto", e o modelo tenta suprir isso sozinho.
- Severidade: **P1**.

### P2

**G9 — Narração do próprio mecanismo ("vou simular", "deixa eu calcular")**
- Citação: auto (t5), moto (t9-10), servicos (t9) — ver D1.
- Código: proibido explicitamente em `directives.ts:197/205`, mas ocorre mesmo assim. Risco de
  tom, não invariante.
- Severidade: **P2**.

**G10 — "Voltar" sem stack termina em beco morto**
- Citação: auto (t16) — *"Você já está no início."* e nada mais.
- Código: `src/lib/whatsapp/processor.ts:23-39` (`handleBackIntent`) não reemite a pergunta/gate
  pendente depois da mensagem — só informa a ausência de stack.
- Severidade: **P2**.

**G11 — Resposta a "não entendi" inconsistente entre jornadas**
- Citação: auto (t5)/servicos (t5) explicam consórcio; moto (t5)/imóvel (t5) reexplicam a
  exigência de CPF já atendida.
- Por que é defeito leve: "não entendi" é ambíguo por natureza (não é hard bug), mas o padrão
  mais comum (reexplicar CPF que já foi dado) é o pior dos dois, e está enredado no mesmo G1/G6.
- Severidade: **P2**.

---

## O que está BOM, com citação

- **Espelho de motivo + objetivo variando por persona** (o núcleo do que a cirurgia queria):
  auto (t3) *"quando o carro dá trabalho, atrapalha tudo"*; imóvel (t2) *"quando você está pagando
  aluguel todo mês pra outra pessoa, essa energia quer estar construindo patrimônio próprio"*.
- **Cadência 2-tempos do identify funciona**: contexto LGPD e pedido do CPF chegam em balões
  separados nas 4 jornadas (t3 de cada dossiê) — sem empilhar duas perguntas no mesmo balão.
- **Máscara de CPF funciona onde o código controla o texto**: *"CPF 028.•••.•••-38"* aparece
  corretamente no card determinístico de contrato em moto (t14), imóvel (t16), serviços (t11) —
  prova que o vazamento do gap G3 é específico do caminho livre do modelo, não da mecânica de
  mascaramento em si.
- **Ressalva de estimativa (I5) presente e correta**: auto (t23) *"Estimativa, claro —
  contemplação não é garantida em mês específico, mas esses são os números reais do grupo."*; e a
  divulgação transparente do ajuste de faixa em moto (t8) e imóvel (t7) — o agente não esconde
  que a carta pedida e a carta real divergem, mesmo quando o número interno também diverge por
  outro motivo (G7).
- **3 de 4 jornadas fecham de ponta a ponta**: moto, imóvel e serviços chegam à contratação real
  (proposta com link válido + pedido opcional de RG/CNH) sem handoff humano — a mecânica de
  fechamento self-service funciona quando o funil não quebra antes.
- **Fallback honesto de falha de busca funciona quando é de fato usado**: imóvel (t5) expõe o erro
  sem jargão técnico (*"não consegui carregar as opções agora — foi coisa da nossa busca aqui, não
  do seu perfil"*, `buildDiscoveryFailedFallback`, `directives.ts:429-437`) e (t6) um simples
  "tenta de novo" resolve — mostra que a saída correta já existe no código; o problema é que ela
  não dispara nas outras 3 jornadas (G1), que ficam em silêncio total em vez de cair nesse
  fallback.

# Veredito — RODADA 4 (8 dossiês: auto/moto/imóvel/serviços × web/whatsapp)

Juiz: Sonnet, contexto fresco, olhar adversarial. Julguei o transcript literal dos 8 arquivos em
`evidencias/rodada-4/{auto,moto,imovel,servicos}-{web,whatsapp}.md` — ignorei toda "Observação"/
"RESUMO" do coletor como veredito (inclusive `RESUMO-TESTES-CRITICOS.md`, que além de tudo só cobre
os 4 dossiês WhatsApp — nenhum web — e não deveria ser lido como cobertura completa da rodada) e
voltei ao código (`src/lib/agent/orchestrator/{sanitizer,directives,index}.ts`,
`src/lib/agent/qualify-state.ts`, `src/lib/chat/empty-turn-guard.ts`,
`src/app/api/chat/route.ts`) pra confirmar ou refutar cada achado com `file:line`.

Referências usadas: `docs/design/specs/2026-07-09-handoff-agente-vendas-consorcio/mockups/
aja-dois-cenarios.html`, `docs/jornada/decisoes-do-cliente.md` (I1-I6),
`veredito-rodada-3.md` (5/10).

---

## NOTAS

| # | Dimensão | Nota |
|---|---|---|
| D1 | Humanização | **7/10** |
| D2 | Não-repetição | **6/10** |
| D3 | Condução | **6/10** |
| D4 | Invariantes | **8/10** |
| D5 | Cobertura | **8/10** |
| D6 | Paridade + fidelidade ao mockup | **5/10** |

## NOTA GERAL: **7/10**

## MATADOR PRA PROD: **NÃO**

O P0 mais grave da rodada 3 — o guard suprimindo o nome de uma administradora VÁLIDA e o modelo
cobrindo com a mentira "tive um probleminha pra renderizar os dados" — **sumiu por completo**: 0/8
dossiês mencionam "problema técnico"/"probleminha pra renderizar", e a administradora recomendada é
nomeada com clareza em pelo menos 6/8 (as outras 2 a apresentam sem a moldura "recomendo", mas
nunca a escondem). A repetição byte-a-byte do formulário ("Você já viu o formulário aqui em cima")
também sumiu (FIX-346 confirmado em código, `index.ts:568-580`) — as duas respostas ao "quero
seguir" repetido divergem em 8/8 dossiês. Isso é progresso real e verificado.

Mas a campanha continua no mesmo padrão da rodada 3: **troca um bug por outro em vez de fechar a
dívida**. Dois achados novos, ambos com evidência direta:
1. **"Acho que me perdi" regrediu** — a rodada 3 relatou 0/8; agora reaparece em 2/8
   (`moto-web` t9, `servicos-web` t10), disparado por respostas afirmativas CLARAS do usuário a
   perguntas que o próprio agente acabou de fazer.
2. **O "reveal em dois tempos, com consentimento" (decisão Rodada 10) migrou o vazamento do canal
   WEB pro WHATSAPP** — rodada 3 achou 1/4 web vazando número antes do consentimento; agora é
   2/4 whatsapp (`imovel-whatsapp` t6, `servicos-whatsapp` t6), sendo que `servicos-whatsapp` nunca
   chega a ter um turno de consentimento explícito pro hero — o número já saiu direto.

Some a isso a meta-narrativa de pipeline empilhada, viva há 3 rodadas seguidas sem correção
definitiva, e o fallback enlatado (`buildToolErrorRecoveryFallback`) ainda disparando na mesma taxa
de antes (1/8) — só que agora em `auto-whatsapp` em vez de `auto-web`. Não é matador — é uma
correção real do pior bug, com o resto da dívida rolando pra frente.

---

## Por dimensão, com evidência

### D1 — Humanização: 7/10

**Grande vitória, confirmada em código e no transcript:** nenhuma das 8 conversas inventa desculpa
técnica. O guard `isHallucinatedAdministradoraClaim` (FIX-345, `sanitizer.ts:493-509`) agora casa
por continência (`shown.some((exibida) => exibida.includes(nomeDeMercado) || ...)`) em vez de
igualdade exata — e o efeito aparece: `servicos-web` t9 nomeia a própria recomendação sem rodeio
("achei uma opção bem interessante pra você, mas preciso ser transparente: você pediu 30 mil, mas
esse grupo da **Âncora** não permite ajuste livre de crédito...").

**Espelho de motivo continua variando de verdade** entre as 8 personas:
- `auto-web` t3: *"quando o carro dá trabalho, atrapalha tudo"*
- `moto-whatsapp` t4: *"quando a grana aperta, uma moto de delivery abre porta"*
- `imovel-web` t3: *"quando você paga aluguel, o dinheiro some e você fica sem patrimônio"*
- `servicos-web` t4: *"quando a casa pede um retoque, muda tudo o clima do lugar"*

**Achado novo, moderado — a SEGUNDA metade da mesma frase é um template fixo, não varia:** em pelo
menos 4/8 dossiês a frase termina identicamente com *"...com tranquilidade e sem juros"*:
`auto-web` t3, `moto-web` t3, `imovel-web` t3, `servicos-web` t4, `auto-whatsapp` t4 — todas
fecham com essa mesma cauda, palavra por palavra, apesar de a primeira metade (o espelho) variar.
Olhado de uma conversa só é invisível; olhado lado a lado nos 8 dossiês (o que esta rubrica pede)
é visivelmente uma template-no-prompt, o oposto do "conversa é do modelo".

**Ruim, ainda vivo (P1.4 da rodada 3, sem correção definitiva):** a meta-narrativa de pipeline
empilhada continua em ~4-5/8, ainda que reduzida:
- `imovel-web` t4: *"Agora vou te mostrar o cenário completo: Pronto, Fernanda."* — anúncio de
  passo seguido do resultado, sem conteúdo entre os dois.
- `servicos-web` t5: *"vou te mostrar a que melhor encaixa no seu perfil. Perfeito, vou te mostrar
  as opções pra você escolher..."* — dois anúncios empilhados.
- `imovel-whatsapp` t6: *"Vou te mostrar a que se destaca melhor... Agora vou te mostrar os números
  exatos dessa opção: Pronto, Fernanda!"*
- `auto-web` t5: um "Perfeito!" solto entre dois parágrafos, artefato do mesmo padrão.
Isso apesar do commit `20ed32f0` ("corta meta-narrativa de pipeline no reveal") já estar presente
no código ANTES da coleta desta rodada (14/07 03:34, evidência coletada a partir de 05:55) — o
guard cobre "agora vou recomendar/destacar/detalhar/aprofundar" mas não "agora vou te mostrar o
cenário completo"/"vou te mostrar as opções", que escapam ao padrão.

### D2 — Não-repetição: 6/10

**Confirmado, FIX-346 funcionou:** `index.ts:568-580` documenta a remoção do intercepto de texto
FIXO ("Você já viu o formulário aqui em cima — é só preencher pra eu seguir!"); nos 8 dossiês, as
duas respostas ao "quero seguir" repetido **divergem em 8/8** (nenhum par idêntico), inclusive nos
2 dossiês que tinham a regressão na rodada 3 (`auto-web`, `imovel-web`).

**Regressão nova — "Acho que me perdi" volta a aparecer, depois de zerado na rodada 3:**
- `moto-web` t9: usuário responde *"sim, mostra pra mim"* à pergunta do próprio agente ("Quer que
  eu detalhe quanto fica de parcela mensal...?") → AGENTE: *"Acho que me perdi por aqui. Pode
  mandar de novo, por favor?"*
- `servicos-web` t10: usuário responde *"quero ver as outras opções"* à pergunta do próprio agente
  ("Quer conferir as outras opções também pra comparar...?") → mesma frase idêntica de novo.
- Fonte: `src/lib/chat/empty-turn-guard.ts:37` (`EMPTY_TURN_FALLBACK = "Acho que me perdi por aqui.
  Pode mandar de novo, por favor?"`), disparado em `src/app/api/chat/route.ts:1568` quando o turno
  fecha sem nenhuma emissão visível — mesma classe do FIX-206/207/208 (`qualify-state.ts:545-565`),
  onde o `turn-analyzer` classifica mal e nenhum gate/directive assume o turno.

**Fallback enlatado ainda dispara — mesma taxa da rodada 3, canal diferente:**
`auto-whatsapp` t21 — usuário confirma *"sim"* a um plano que o próprio agente acabou de detalhar
→ AGENTE: *"Ótimo, Madalena! Então deixa eu confirmar com você: Madalena, as opções que já
apareceram aqui pra você continuam valendo. Me diz o nome da administradora ou o valor que você
quer olhar de novo..."* — texto de `buildToolErrorRecoveryFallback` (`directives.ts:452-459`),
disparado pelo branch `tool-error-recovered` (`index.ts:908-940`) quando uma tool falha e nem
`isExactnessOrCriteriaQuestion` nem `mentionedOffer` resolvem o turno. Era 1/8 na rodada 3
(`auto-web` t15); continua 1/8 agora, só que em `auto-whatsapp` — não foi eliminado, só mudou de
lugar. O usuário precisa repetir "ITAÚ" (t22) mesmo já tendo confirmado a oferta antes.

### D3 — Condução: 6/10

**Chega ao fim em 8/8** (formulário de contrato ou reserva com link) — sem travamento total em
nenhum dossiê.

**Evasão inconsistente a pedido de administradora inexistente — ainda não padronizada:**
- `auto-whatsapp` t8: usuário pergunta *"e a Bradesco?"* → AGENTE responde algo desconexo ("Daí
  você vê os números de parcela, taxa e como funciona a contemplação com lance.") — não nega, não
  confirma, não redireciona pra lista real: um não-sequitur.
- `servicos-web` t8: mesma pergunta, mesma classe de resposta desconexa ("Ou prefere ver todas
  lado a lado pra comparar?") — o próprio coletor registrou "não respondeu Bradesco
  especificamente".
- `imovel-web` t8: AGENTE promete *"Deixa eu simular ela pra você ver como fica"* e depois NÃO
  simula Bradesco — pivota direto pra lista real sem nunca cumprir a promessa nem dizer que não
  cumpriu.
- Em contraste, o padrão CORRETO aparece em `moto-web` t7, `moto-whatsapp` t8, `imovel-whatsapp`
  t8, `servicos-whatsapp` t8: redireciona pra lista real, sem prometer o que não vai entregar.
  4/8 corretos, 3/8 evasivos/desconexos, 1/8 com promessa quebrada — mesmo padrão de
  inconsistência do P1.5 da rodada 3, não resolvido.

### D4 — Invariantes: 8/10

**Maior ganho da rodada — confirmado em código e transcript:**
- **Zero "problema técnico"/"probleminha pra renderizar" em 8/8** — o P0 mais grave da rodada 3
  não se repete.
- **Zero administradora fabricada em 8/8** — nenhuma citação de Bradesco/Caixa/Santander como
  oferta real; todas as respostas, mesmo as evasivas do D3, evitam inventar uma oferta.
- **Administradora recomendada é nomeada** de forma clara em 6/8 (`auto-web`, `auto-whatsapp`,
  `moto-web`, `imovel-web`, `imovel-whatsapp`, `servicos-web`) e apresentada sem framing explícito
  de "recomendo" em 2/8 (`moto-whatsapp`, `servicos-whatsapp`) — mas nunca escondida.
- **CPF mascarado em 4/4 WhatsApp** (`CPF 028.•••.•••-38`) — I6 mantido.
- **Terminologia "reserva/reservada" correta** — `moto-whatsapp` t23, `servicos-whatsapp` t21:
  *"Sua cota da [administradora] está reservada..."*, sempre pós-confirmação, nunca
  "contratado"/"garantido" antes da hora — I4 respeitado.

**Ressalva que impede o 10:** as evasões do D3 (auto-whatsapp t8, servicos-web t8, imovel-web t8)
não são mentira nem invariante quebrado no sentido estrito de I1-I6, mas são parentes da mesma
família — usuário faz pergunta direta, não recebe resposta honesta e completa. Não rebaixei D4 por
isso sozinho (fica em D3), mas ele encosta na fronteira.

### D5 — Cobertura: 8/10

Os 8 dossiês cobrem os 4 tipos × 2 canais, todos chegam ao fim do funil, e os 4 testes-checklist
(não entendi / administradora ausente / nomear administradora / "quero seguir" 2x) foram
executados nos 8. Diferente da rodada 3, os achados não se concentram num canal só — estão
espalhados: `moto-web`/`servicos-web` têm o "me perdi", `auto-whatsapp` tem o fallback enlatado,
`imovel-whatsapp`/`servicos-whatsapp` têm o vazamento de reveal. Nota: `RESUMO-TESTES-CRITICOS.md`
(o resumo do próprio coletor) só cobre os 4 dossiês WhatsApp — quem ler só esse resumo erra ao
achar que a rodada inteira foi coberta; os 4 web só existem nos arquivos brutos.

### D6 — Paridade + fidelidade ao mockup: 5/10

**Meta-narrativa de pipeline segue viva há 3 rodadas (ver D1)** — regra-no-prompt não segura,
guard em código (`sanitizer.ts` `PRODUCT_STEP_ANNOUNCEMENT_PATTERNS`, FIX-335) cobre só um
subconjunto dos padrões ("vou recomendar/destacar/detalhar/aprofundar"), não "vou te mostrar o
cenário completo"/"vou te mostrar as opções", que continuam escapando.

**Achado novo — "reveal em dois tempos, com consentimento" (decisão Rodada 10, 2026-07-12) migrou
o vazamento pro canal WHATSAPP:**
- `imovel-whatsapp` t6: a resposta já nomeia *"Você tem a opção ITAÚ em destaque com a melhor
  combinação de taxa de administração (16,04%)..."* — administradora + número específico, ANTES
  de qualquer pergunta de consentimento. O gate `reco-consent` ("Posso te mostrar a opção que eu
  recomendo?") só aparece DEPOIS, em t9 — post-hoc, teatro do consentimento igual ao que o FIX-333
  já descreve no código (`sanitizer.ts:421-431`), só que o guard `isPrematureTopOfferClaim`
  (`sanitizer.ts:517-530`) não pegou esse segmento.
- `servicos-whatsapp` t6: pior ainda — a resposta já entrega parcela (R$ 693,54), prazo (97
  meses) e valor de lance (R$ 18.000) da ÂNCORA logo após o `identify`, e **não existe, em turno
  nenhum do transcript inteiro, uma pergunta de consentimento tipo "Posso te mostrar a opção que eu
  recomendo?"** antes do hero — o passo de consentimento nem chega a ocorrer nesse canal.
- Contraste: `moto-whatsapp` t6 é limpo (convite neutro, sem nome nem número), `auto-whatsapp` t6
  nomeia a administradora mas retém o número e pergunta consentimento antes de dar mais detalhe —
  os 4 dossiês WEB desta rodada são todos limpos (número só sai quando o usuário pergunta
  explicitamente "qual é a melhor pra mim?"). Isso inverte o padrão da rodada 3 (que via o vazamento
  concentrado no web) — a dívida trocou de canal, não fechou.
- **Ressalva epistêmica:** não tracei em runtime se `recoConsentPending`/`pendingTopOffer`
  (`sanitizer.ts:379-393`) chegam corretamente populados nesses dois turnos WhatsApp — é a leitura
  mais bem sustentada pelo código + transcript disponíveis (o guard FIX-333 foi documentado e
  testado só em termos de "4/4 dossiês WEB", nunca menciona WhatsApp), não um fato fechado sem log
  de produção.

**"Quem recusa lance pula o hero" — parcialmente exercitado, ainda não confirmável.**
`moto-web` (lance=no, lance-embutido=no) e `servicos-web` (lance=no, lance-embutido=no) são os
primeiros dossiês em 3 rodadas a exercitar a recusa de lance — mas nenhum dos dois lista
`recommendation_card`/`simulation_result` nas anotações de CARDS, enquanto a narrativa em texto
livre já deu a recomendação e os números. Não dá pra confirmar se o hero foi de fato suprimido
(comportamento correto) ou se a anotação do coletor só não capturou o card — fica como lacuna de
instrumentação, não fato resolvido.

---

## Gaps, do mais grave ao menos grave

### P0 — bloqueia prod

**Nenhum identificado nesta rodada.** O P0 da rodada 3 (guard suprimindo administradora válida +
mentira de "problema técnico") está confirmadamente corrigido em código e no transcript, 0/8.

### P1 — grave

**P1.1 — "Acho que me perdi" regrediu (era 0/8 na rodada 3, agora 2/8) — `moto-web` t9,
`servicos-web` t10.**
- Citação: usuário responde diretamente a uma pergunta que o PRÓPRIO agente fez ("sim, mostra pra
  mim" / "quero ver as outras opções") e recebe *"Acho que me perdi por aqui. Pode mandar de novo,
  por favor?"*
- Onde mexe: `src/lib/chat/empty-turn-guard.ts:37` (a string), disparo em
  `src/app/api/chat/route.ts:1568`; causa-raiz provável na classificação do `turn-analyzer` fora
  dos `COLLECTION_GATES` (`qualify-state.ts:555-565`) — mesma família FIX-206/207/208, agora
  aparecendo num ponto do funil (pós-recomendação, turno livre) que os guards anteriores não
  cobriam.
- Severidade: **P1** — não trava o funil (usuário reformula e segue), mas é uma regressão
  explícita de uma correção já dada como fechada.

**P1.2 — Reveal em dois tempos com consentimento (decisão Rodada 10) vazado no canal WHATSAPP —
`imovel-whatsapp` t6, `servicos-whatsapp` t6.**
- Citação: *"Você tem a opção ITAÚ em destaque com a melhor combinação de taxa de administração
  (16,04%)..."* (`imovel-whatsapp` t6) — antes de qualquer gate de consentimento;
  `servicos-whatsapp` nunca chega a ter um gate de consentimento pro hero em todo o transcript.
- Onde mexe: `src/lib/agent/orchestrator/sanitizer.ts:517-530` (`isPrematureTopOfferClaim`,
  FIX-333) — guard só documentado/testado contra dossiês WEB; precisa de cobertura de teste
  explícita pro canal WhatsApp pra confirmar se `recoConsentPending`/`pendingTopOffer` chegam
  populados corretamente nesse fluxo.
- Severidade: **P1** — contraria decisão explícita do cliente (Rodada 10, "reveal em dois tempos,
  com consentimento"); inverte o padrão da rodada 3 (era o web que vazava) sem fechar a dívida.

**P1.3 — Fallback enlatado (`buildToolErrorRecoveryFallback`) ainda dispara na mesma taxa — agora
em `auto-whatsapp` t21.**
- Citação: *"as opções que já apareceram aqui pra você continuam valendo. Me diz o nome da
  administradora ou o valor que você quer olhar de novo..."* — em resposta a um "sim" que confirma
  um plano já detalhado.
- Onde mexe: `src/lib/agent/orchestrator/directives.ts:452-459`; disparo em
  `src/lib/agent/orchestrator/index.ts:908-940` (branch `tool-error-recovered`).
- Severidade: **P1** — mesma taxa de 1/8 da rodada 3, migrou de canal; a causa (tool error real
  disfarçado de recuperação genérica) não foi endereçada, só mascarada melhor quando repete
  (`buildToolErrorRecoveryFallbackRepeat`).

**P1.4 — Meta-narrativa de pipeline empilhada, ~4-5 de 8 dossiês, terceira rodada seguida sem
correção definitiva.**
- Citação: `imovel-web.md` t4 ("Agora vou te mostrar o cenário completo: Pronto, Fernanda.");
  `servicos-web.md` t5; `imovel-whatsapp.md` t6; `auto-web.md` t5.
- Onde mexe: `src/lib/agent/orchestrator/sanitizer.ts` (`PRODUCT_STEP_ANNOUNCEMENT_PATTERNS`,
  FIX-335) — cobre "vou recomendar/destacar/detalhar/aprofundar" mas não "vou te mostrar o cenário
  completo"/"vou te mostrar as opções pra você escolher", que continuam passando.
- Severidade: **P1** — mesmo achado reportado há 3 rodadas (era P1.7 na rodada 2, P1.4 na rodada
  3); guard em código já existe mas com cobertura de padrão incompleta.

**P1.5 — Evasão inconsistente a pedido de administradora inexistente, 3/8 (`auto-whatsapp` t8,
`servicos-web` t8, `imovel-web` t8 com promessa quebrada).**
- Citação: `auto-whatsapp` t8 — pergunta sobre Bradesco recebe resposta desconexa ("Daí você vê os
  números de parcela, taxa..."); `imovel-web` t8 — promete *"Deixa eu simular ela pra você ver como
  fica"* e não simula.
- Contraste correto: `moto-web` t7, `moto-whatsapp` t8, `imovel-whatsapp` t8, `servicos-whatsapp`
  t8 — redirecionam pra lista real sem prometer o que não entregam.
- Severidade: **P1** — mesmo padrão de inconsistência do P1.5 da rodada 3, sem correção.

### P2 — polimento

**P2.1 — "Então o objetivo já fica claro: te colocar em [bem], com tranquilidade e sem juros" é
template fixo repetido em pelo menos 4/8 jornadas** (`auto-web`, `moto-web`, `imovel-web`,
`servicos-web`) — a primeira metade da frase (espelho de motivo) varia de verdade, mas essa cauda
não varia nunca. Invisível numa conversa isolada, mas visível side-by-side (o que a rubrica D1
pede) e é sinal de copy fixa, não de "conversa do modelo".

**P2.2 — "Quem recusa lance pula o hero" segue não confirmável** — `moto-web` e `servicos-web`
exercitaram a recusa (lance=no + lance-embutido=no) pela primeira vez em 3 rodadas, mas a anotação
de CARDS não permite confirmar se o hero foi de fato suprimido. Recomendo instrumentar o log de
cards emitidos/suprimidos por turno na próxima coleta, não só a narrativa.

**P2.3 — `RESUMO-TESTES-CRITICOS.md` (documento do coletor) cobre só os 4 dossiês WhatsApp, zero
web** — não é defeito do agente, mas risco de leitura errada de quem só ler o resumo achando que a
rodada inteira foi auditada ali.

---

## O que MELHOROU vs. a rodada 3 (sem gentileza, mas honesto)

- **A mentira de "problema técnico"/"probleminha pra renderizar" sumiu — 0/8.** Era o P0 mais grave
  da rodada anterior; `sanitizer.ts:493-509` (FIX-345, casamento por continência) resolve a causa
  raiz confirmada em código.
- **Administradora recomendada é nomeada em 6/8 explicitamente, nunca escondida em nenhum dos 8** —
  bug oposto (ficar mudo sobre a própria recomendação) não se repete.
- **Repetição byte-a-byte "Você já viu o formulário..." sumiu — 8/8 respostas ao "quero seguir"
  repetido divergem** (era regressão P1.3 na rodada 3, 2/8). FIX-346 confirmado em código
  (`index.ts:568-580`).
- **Nenhuma administradora fabricada em 8/8** — mantido desde a rodada 2.
- **CPF mascarado em 4/4 WhatsApp, terminologia "reserva" correta** — sem regressão.

## O que ainda está ruim (ou é novo e pior)

- **"Acho que me perdi" regrediu** — zerado na rodada 3, de volta em 2/8.
- **O vazamento de reveal-antes-do-consentimento não fechou — trocou de canal** (era 1/4 web na
  rodada 3, agora 2/4 whatsapp, um deles sem gate de consentimento nenhum).
- **Fallback enlatado (`buildToolErrorRecoveryFallback`) na mesma taxa — só mudou de canal.**
- **Meta-narrativa de pipeline empilhada, terceira rodada seguida sem fechamento definitivo.**
- **Evasão inconsistente a pedido de administradora inexistente, sem padronização.**

---

## O que falta pro 10/10 (específico e acionável)

1. **Cobrir o gap de instrumentação do `turn-analyzer`/`EMPTY_TURN_FALLBACK` fora dos
   `COLLECTION_GATES`** (`qualify-state.ts:555-565`) — o "me perdi" está voltando em pontos do
   funil (pós-recomendação, turno livre) que os fixes anteriores (FIX-206/207/208) não cobriam;
   escrever teste de regressão específico pros 2 casos exatos (`moto-web` t9, `servicos-web` t10)
   antes de mexer no código.
2. **Estender `isPrematureTopOfferClaim` (`sanitizer.ts:517-530`) e confirmar
   `recoConsentPending`/`pendingTopOffer` no fluxo WhatsApp** — o guard FIX-333 foi validado e
   testado só contra dossiês web; precisa de teste de integração explícito pro canal WhatsApp
   (`imovel-whatsapp`/`servicos-whatsapp` como fixture) antes de declarar paridade.
3. **Fechar a causa-raiz do fallback enlatado**, não só variar o texto no repeat — investigar POR
   QUE a tool falha nesse ponto exato (`auto-whatsapp` t21, resposta "sim" a um plano já detalhado)
   em vez de só polir a mensagem de recuperação.
4. **Ampliar `PRODUCT_STEP_ANNOUNCEMENT_PATTERNS` (sanitizer.ts, FIX-335)** pra cobrir "vou te
   mostrar o cenário completo"/"vou te mostrar as opções pra você escolher" — mesma família dos
   padrões já bloqueados, só que com objeto diferente.
5. **Padronizar em CÓDIGO a resposta a administradora inexistente** — sempre redireciona pra lista
   real (padrão `moto-web`/`moto-whatsapp`/`imovel-whatsapp`/`servicos-whatsapp`), nunca desconexo
   (`auto-whatsapp`/`servicos-web`) nem com promessa quebrada (`imovel-web`).
6. **Variar a cauda fixa "...com tranquilidade e sem juros"** — ou remover a instrução-no-prompt que
   a fixa (se existir) e deixar o modelo compor a frase inteira, não só a primeira metade.
7. **Instrumentar log de cards emitidos/suprimidos por turno** (não só a narrativa) pra finalmente
   confirmar ou refutar "quem recusa lance pula o hero" — 3 rodadas sem conseguir fechar essa
   checagem por falta de dado, não por falta de teste.

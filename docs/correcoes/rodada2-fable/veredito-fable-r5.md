# VEREDITO r5 — Verificador independente (Fable) · JUNÇÃO r1..r5 na DEVELOP · 2026-07-10

Método: condução adaptativa própria via `POST /api/chat` em `http://aja-develop.orb.local`
(develop `7716ead6` ⊇ `f8a55d01`, app de pé, pg saudável), **4 conversas ao vivo** (B-Mario:
espiral + seam até real_offer + 2 contestações; A-Madalena: rawCreditValue no hero;
C-Carla e D-Dora: caminho feliz por cliques até o FECHO COMPLETO), leitura dos diffs
FIX-257..261, `tool-io`/`turn-trace` do `aja-app-develop`, meta inspecionado DIRETO no pg,
testes novos re-executados no container (FIX-257 17/17 ✓; FIX-258/259/260 49/49 ✓).
**Nenhuma nota depende de self-report.** 3 propostas reais criadas na Bevi
(`6a51355e…` RODOBENS, `6a513b83…` ITAÚ, + 1 rejeitada 400 LGPD).

## Nota final: **5/10** (mínimo das dimensões) — os 2 P1 fecharam PELA METADE; NÃO é matador pra prod

| D | Dimensão | r2 | r3 | r4 | **r5** | Resumo |
|---|---|---|---|---|---|---|
| D1 | Motor/agulha | 9 | 8 | 8 | **7** | Intacto no núcleo; dial com âncora de lance declarado ✓; MAS snapshot derivou pra simulação what-if de 161.258 que NINGUÉM pediu (pedido 100k) — educação do embutido e dial falam "sua carta de R$ 161.258" |
| D2 | Cards | 4 | 6 | 8 | **7** | Server-side nos 2 caminhos mantido ✓; `rawCreditValue` no hero PROVADO ao vivo ✓; MAS payload×fio contradiz: scarcity/decision_prompt/dial pra ÂNCORA enquanto o texto fecha ITAÚ; embedded_bid com carta divergente da confirmada; dial dup CROSS-turn |
| D3 | Funil/ordem | 5 | 4 | 5 | **5** | Gates por texto CONSUMIDOS ✓, dial por texto ✓, funil completo até o fecho ✓ (1ª vez); MAS contestação da troca de marca = turno de **34 tool-calls / 593s / 4 fallbacks repetidos**, e re-abre contract_form da marca indisponível |
| D4 | Voz/cadência | 6 | 6 | 6 | **5** | Acentos ok na descoberta; **"ITAU" sem acento 3× na copy do fecho** (nome do catálogo parceiro não normalizado); educação do embutido 2× no mesmo turno (persiste); "Tive um problema…" 4× num turno; "reserva" vivo na fala e nos guards |
| D5 | Compliance | 6 | 5 | 6 | **5** | Aviso de troca de marca DISPAROU ✓ (determinístico, 2 canais); aviso de ajuste do hero ✓; posição de lance honesta ✓; MAS sob contestação o agente **negou a proposta registrada (RODOBENS) e AFIRMOU falsamente que a ITAÚ estava registrada**; o aviso nomeia a marca "anterior" ERRADA (ÂNCORA, não a ITAÚ confirmada); "te mandei WhatsApp" quando só enfileirou (dev) |
| D6 | Fecho WhatsApp/assinatura | 9 | 9 | 8* | **8** | **EXERCITADO ao vivo pela 1ª vez desde r3**: real_offer → offer-confirm (1 timeout externo, retry passou) → signature_handoff com LINK REAL + document_upload + Parabéns + 2 templates enfileirados; copy de retry honesta |

**FINAL = MIN = 5/10.**

---

## Os 2 P1 do r4 + rota + regressões — status com evidência ao vivo

### P1 #1 — Espiral de negação (FIX-257 coerce + erro barulhento; FIX-258 rota nome→grupo): **PARCIAL**

**O que fechou (provado ao vivo):**
- Menção única/inequívoca resolve DETERMINISTICAMENTE: "Me explica melhor a da ITAÚ, a de 92 mil"
  → tool-io mostra `simulate_quota {groupId: "6a3e6cec419653c0a999379e", creditValue: 92902}` +
  `get_group_details` no MESMO id — groupId literal da tabela, **sem re-busca, sem sentinela,
  sem negação**, números certos na fala (92.902/2.182,01/51m). A diretiva FIX-258 funciona
  quando o resolver acha match.
- Coerção `z.coerce.number()`: 17/17 testes verdes no container (schemas + ai-sdk + tool-io-log).

**O que NÃO fechou (3 reproduções de negação ao vivo, mesma conversa):**
1. Comparação de 2 marcas ("Compara a RODOBENS com a ITAÚ") → resolver devolve null (2 nomes =
   ambíguo, por design) → LLM chama `simulate_quota {groupId:"RODOBENS"}` (guard barulhento ok)
   e depois `search_groups` → **`output: null` MUDO** → *"não tenho essa opção da RODOBENS aberta
   aqui"* — a RODOBENS 90.000/1.218,92 estava na comparison_table NA TELA.
2. Marca + valor compartilhado ("A RODOBENS de 90 mil… tá na tabela que VOCÊ me mostrou") →
   **bug de design do resolver**: nameMatch único (RODOBENS) mas `valueMatch` elege a PRIMEIRA
   oferta com diff 0 (ÂNCORA, mesmo crédito 90.000) → "nome × valor discordam" → null → não resolve.
   `resolveOfferByMention` guarda só UM best valueMatch em vez do CONJUNTO (choose-offer.ts:214-227).
3. Menção negada + valor único ("Deixa a Rodobens pra lá. Me fala da de 110 mil") → "Rodobens"
   ainda conta como nameMatch → conflita com valueMatch CANOPUS 110k → null → *"não tenho opções
   de R$ 110.000 abertas aqui"* — CANOPUS 110.000 estava na tabela.

**Causa-raiz do buraco mudo (NOVA, mapeada):** as chamadas que falham NÃO caem no Zod — o LLM
chama `search_groups` FORA do toolset da fase (`reveal`/`closing` excluem descoberta,
tool-policy.ts) → AI SDK v6 emite chunk **`tool-error`** (NoSuchToolError) → o runner só trata
`tool-input-error` (FIX-257) — **`tool-error` não tem case** (runner.ts:315-383) → tool-io loga
`output: null`, zero `invalid_input` em TODA a sessão (grep = 0). O erro barulhento do FIX-257
mira a modalidade errada: nunca disparou ao vivo.

**Forma nova e mais cara da espiral:** contestação da troca de marca → turno com **34 tool-calls,
593 segundos** (turn-trace), ~20× `search_groups` mudos + 8× sentinelas (`placeholder`,
`__search__`) + 4× o MESMO fallback "Tive um problema…" costurado no texto + **re-apresenta o
contract_form da ITAÚ 2×** com proposta RODOBENS já registrada. Custo + latência + promessa
impossível num turno só.

### P1 #2 — Seam do fechamento troca a marca (FIX-259): **PARCIAL**

**O que fechou (provado ao vivo):** submit com âncora ÂNCORA e catálogo do fechamento sem ela →
copy determinística **"A ÂNCORA não tem grupo disponível nessa faixa agora — a opção equivalente
é a RODOBENS, com parcela de R$ 1.213,85. Essa é a carta real — confere e decide se quer
seguir:"** ANTES do card (proposta real `6a51355e…`). Zero silêncio. Paridade WhatsApp wired
(contract-capture.ts → formatter.ts `previousAdministradora`; teste verde). E a **1ª resposta** à
contestação começou EXATAMENTE como prescrito: explica a troca, "não é algo que eu troco
reprocessando", oferece os 2 caminhos reais.

**O que NÃO fechou:**
- **A marca "anterior" do aviso é a ERRADA.** O usuário confirmou ITAÚ 92.902 por texto 3×, o
  contract_form saiu ITAÚ — mas `administradoraPreferida` ficou ÂNCORA (hero stale). Causa: a
  confirmação TEXTUAL nunca re-ancora `recommendedOffer` (só o clique choose_offer), e o
  re-âncora FIX-251 falha porque `findOfferByAdministradora` exige match ÚNICO — havia 2 ITAÚ
  exibidas (92.902 e 100.000) → null → nenhum log `[ancora-fechamento]` no fechamento. O fio
  inteiro contradiz: dial ÂNCORA, scarcity ÂNCORA, decision ÂNCORA, aviso "A ÂNCORA não tem…"
  pra quem só falou em ITAÚ.
- **Anti-negação/anti-refazer é regra-no-prompt e FALHOU ao vivo (Lei 4).** 2ª contestação: o
  agente **negou a proposta RODOBENS registrada** (*"Não existe nenhuma proposta ativa da
  RODOBENS aqui; se ela apareceu, foi uma tentativa que não vingou"*) e **afirmou que a ITAÚ
  estava registrada** (falso — `check_proposal_status` NUNCA foi chamado, violação do FIX-14).
  Nas 2 contestações re-apresentou o contract_form da ITAÚ — o "refazer impossível" vivo, agora
  a um clique de criar uma 2ª proposta real (CPF + bureau).

### Rota nome/valor→grupo (FIX-258): **PARCIAL** — funciona no caso único (evidência acima); falha nos 3 padrões de menção listados; a diretiva não participa da ancoragem do fechamento.

### Regressões do r4 (re-teste):

| Item r4 | Status r5 | Evidência ao vivo |
|---|---|---|
| R3 gate lance-embutido por TEXTO não consumido | **CORRIGIDO** ✓ | "Sim, pode considerar o lance embutido" → consumido, sem re-emissão de card/educação, funil avançou |
| R4 simulator-offer "Quero ver sim!" por texto pulava o dial | **CORRIGIDO** ✓ | Texto afirmativo → `contemplation_dial` emitido no turno, com moneyAnchor |
| R5 dial duplicado no mesmo turno | **PARCIAL** | Guard `dial-dup-intraturn` em código (0 hits — nada pra suprimir ao vivo); MAS dup **CROSS-turn** novo: clique "Quero ver!" não seta `simulatorOfferAnswered` (route.ts:1103-1127) → 1º texto afirmativo seguinte ("quero seguir e fechar") re-emite o dial. Repete só 1× (o intercept marca a flag) |
| R7 hero +25% sem aviso | **CORRIGIDO** ✓ | Pedido "por volta de 120 mil" → hero ITAÚ 150.000 com `"rawCreditValue": 120000` no payload (aviso renderizável) |
| R6 truncamento "Perfeito, Madal" | não reproduzido | 0 finishReason anômalo na sessão; log enriquecido com cauda (FIX-261) pronto pra próxima |
| Residuais "reserva" | **NÃO** | `route.ts:628/648` intactos + "Pra confirmar sua reserva" dito ao vivo pelo LLM (conv D) |

## Achados novos da r5

| # | P | Achado | Evidência |
|---|---|---|---|
| N1 | **P1** | Runner sem case pra `tool-error` (AI SDK v6): tool fora do toolset da fase → silêncio total → é ESTE o caminho da espiral (não o Zod). `invalid_input` = 0 hits na sessão inteira | tool-io `output:null` 6×; runner.ts cases; dist do ai@6.0.158 tem `type: 'tool-error'` |
| N2 | **P1** | Contestação → turno de 34 tool-calls/593s/4 fallbacks repetidos + re-abre contract_form de marca indisponível pós-proposta (risco de 2ª proposta real) | turn-trace `toolCount:34, durationMs:592991`; 2ª contestação `toolCount:7` idem |
| N3 | P2 | Confirmação textual de oferta NUNCA re-ancora (dial/scarcity/decision/preferida stale); FIX-251 impotente com 2+ ofertas da mesma marca exibidas | conv B: fio ITAÚ, artifacts ÂNCORA; sem log `[ancora-fechamento]` |
| N4 | P2 | Clique simulator-offer não marca `simulatorOfferAnswered` → dial re-emitido no 1º afirmativo seguinte | conv D ao vivo + route.ts:1103 |
| N5 | P3 | "ITAU" sem acento na copy do fecho (3×: intro, reforço, Parabéns) — nome do catálogo parceiro não passa por normalização de acento | real_offer payload `"administradora": "ITAU"` |
| N6 | P3 | Snapshot âncora aceita simulação what-if não pedida: pedido 100k → `simulation_result` 161.258 no reveal → embedded_bid + dial falam "carta de R$ 161.258" | artifacts conv D no pg |
| N7 | P3 | Pós-fecho afirma "acabei de te mandar uma mensagenzinha no seu WhatsApp" mas o envio só foi ENFILEIRADO (`outbound_queued_pending_template`) — em dev é mentira observável | log template-dispatch |
| N8 | P3 | Guard FIX-180 responde "O grupo RODOBENS nao foi exibido em tela" quando o LLM manda a MARCA como groupId — mensagem falsa (a marca ESTÁ em tela), alimenta a confusão do modelo | tool-io do turno da negação |
| — | retratado | "Loop lance-value↔lance-embutido" que reproduzi 2× era **action malformada do MEU driver** (`value:"20000"` em vez de `{lanceValue:20000}` que a UI real manda, gate-quick-reply.tsx:43) — com o shape correto o caminho é limpo | conv D: lanceValue 20000 persistido no pg, funil avançou |

## Confirmações (não regrediu)
- Fecho completo ao vivo (D6): real_offer → confirm → assinatura (uselink real) + documentos + Parabéns; retry honesto no timeout externo da Bevi (choose_offer 15s, 1/2 tentativas).
- Cards server-side nos 2 caminhos; decision/scarcity/embedded_bid sem tool-call do LLM; guard reveal-loop suprimindo re-emissão ✓.
- Proposta sem LGPD → Bevi 400 → copy honesta ("Tive um problema… tenta de novo"), sem estado fantasma.
- Identidade por canal ✓ ("Me manda seu CPF e celular, só os números"), pré-cadastro/"não paga nada agora" ✓, zero emoji, zero "taxa de contemplação", valores com centavos ✓.
- Reveal direto quando o lead dá tudo numa frase ✓; acentos ÍNTEGROS na descoberta (ITAÚ/ÂNCORA/TRADIÇÃO) ✓.
- Testes: FIX-257 17/17; FIX-258/259/260 + fulfillment 49/49 (container).

## O que falta pro teto (10/10 matador pra prod)
1. **Case `tool-error` no runner** (log estruturado + resultado de erro INSTRUTIVO pro modelo) — é o buraco mudo real; com ele, o modelo recebe "essa tool não está disponível nesta fase; use os dados JÁ exibidos" em vez de silêncio.
2. **`resolveOfferByMention` v2**: valueMatch como CONJUNTO (nome único vence se o valor também bate na oferta nomeada); ignorar menção negada ("deixa X pra lá"); comparação A×B vira caso válido (2 resoluções).
3. **Confirmação textual re-ancora** (mesma rota determinística do FIX-258 gravando `recommendedOffer`) + FIX-251 desambiguando por valor quando há 2+ da marca — mata o aviso com marca errada E o fio ÂNCORA/ITAÚ.
4. **Anti-refazer em CÓDIGO**: pós-proposta registrada, `present_contract_form` de administradora ≠ registrada bloqueado (action/tool-policy) e contestação força `check_proposal_status` — a regra-no-prompt provou 2× que não segura (Lei 4).
5. **Cap de loop**: limite duro de steps/turno (34 calls/10min é DoS de si mesmo) + colapsar fallbacks repetidos.
6. `simulatorOfferAnswered` também no CLIQUE; acento nos nomes do catálogo parceiro; educação do embutido 1×; varrer "reserva" (route.ts:628/648 + fala); "te mandei WhatsApp" só após envio real.

## TL;DR
**5/10** (r2 3 → r3 4 → r4 4→5 → r5 5). **Os 2 P1 fecharam pela metade**: a rota
determinística de menção FUNCIONA no caso inequívoco (groupId literal provado no tool-io) e o
aviso de troca de marca DISPAROU ao vivo com copy determinística — mas a espiral de negação
sobrevive por um buraco NOVO mapeado (chunk `tool-error` sem case no runner + resolver que
desiste em menção composta), o aviso nomeia a marca anterior ERRADA (confirmação textual nunca
re-ancora), e sob contestação o agente negou a proposta registrada, inventou uma ITAÚ
inexistente e queimou 34 tool-calls/10min num turno. Ganhos REAIS e provados: gates por texto,
dial por texto, rawCreditValue no hero, e o FECHO COMPLETO (assinatura+documentos+Parabéns)
exercitado ao vivo pela primeira vez. Pro teto: os 6 itens acima — 1 a 4 são os matadores.

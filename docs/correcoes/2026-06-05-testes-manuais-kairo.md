# ATA — rodada de testes manuais do Kairo (2026-06-05, manhã)

> **Controle vivo migrou pro fluxo TODO → DONE** ([`README.md`](./README.md)):
> cada fix desta rodada tem arquivo próprio em [`done/`](./done/) com o commit da
> execução. Este arquivo permanece como ata da sessão (citações, decisões, status-log).

> Fila de correções apontadas pelo Kairo testando a jornada em tela
> (ambiente local, branch `feat/jornada-bevi-lance-embutido`, app em
> http://aja-feat-jornada-bevi-lance-embutido.orb.local).
>
> **Status: EXECUTADO (2026-06-05).** Bloco A (FIX-1,2,4,5,6,7,8,9,10) +
> Bloco B (FIX-3) implementados com TDD strict — 1 commit `test+fix:`/
> `test+feat:` por correção, Camadas 1+2 verdes em todos.
>
> ⚠️ **Blocker externo registrado:** a cota mensal do workspace Anthropic
> esgotou DURANTE a sessão (volta 2026-07-01) — Camada 3 (eval LLM real),
> E2E conversacional em tela e o próprio chat local ficaram indisponíveis.
> Evals pulam como INCONCLUSIVOS (probe em tests/eval/anthropic-availability.ts);
> re-rodar Camada 3 + E2E quando a cota voltar (ou subir o limite no console).

## Decisões aprovadas (rodada de design 2026-06-05)

1. **Dados do componente do passo 2 (FIX-3):** heurísticas documentadas do
   dial em modo "estimativa de mercado", com selo claro "estimativa —
   valores reais virão da busca". NUNCA chamar Bevi pré-identify (ela exige
   CPF+LGPD) e NUNCA exibir estimativa como se fosse dado real.
2. **Simulador do passo 4 (FIX-6): PERMANECE** — passo 2 = expectativa
   (estimativa), passo 4 = realidade (números 100% da oferta ativa,
   payload server-side). Segue docx + conceito do Bernardo (aval final
   dele segue pendente — registrar no CONTEXT.md).
3. **Gates × componente (FIX-3): HÍBRIDO VENDEDOR** — o componente
   preenche `qualifyAnswers` conforme o usuário mexe; `nextGate()` pula o
   que já está preenchido; o agente passa pelos steps EM CONVERSA como
   vendedor proativo que CONFIRMA em vez de re-perguntar ("Vi que você
   quer a moto em ~6 meses e consegue uns R$ 4 mil de lance — boa
   estratégia. Fechado assim?"). Preencheu parcial → gates restantes
   perguntam normal. Ramo educativo do lance embutido sobrevive sempre.
   Tom: comercial, persuasivo, humano.
4. **Badge de score (FIX-7):** rótulo qualitativo ("Boa compatibilidade")
   no card; % numérico só em contexto comparativo (comparison table);
   breakdown continua no expansível "Por que esta recomendação?".

**Ordem de execução:** Bloco A (FIX-1, 2, 4, 5, 6, 8, 9, 10, 7 — TDD,
commits individuais) → Bloco B (FIX-3, `test+feat:`) → rubric/eval + QA
E2E + done report.
>
> Regras que valem pra TODA correção desta lista:
> - TDD strict — teste falhante primeiro (Camada 1 estrutural + Camada 2
>   cassette quando for comportamento de agent), depois o fix.
> - `jornada-canonica.md` (docx) é a REGRA — toda copy se valida contra ela.
> - Atualizar `jornada-rubric.ts` quando a correção mudar o que o judge cobra.

---

## FIX-1 — Explicação de "primeira vez" incompleta: falta o papel da Aja Agora + tom com mais afinidade

**Onde acontece:** Passo 1 da jornada. Usuário clica **"É a primeira vez"**
no gate `experience` → agente explica o que é consórcio.

**O que o agente fala HOJE (print do chat):**

> "Show, primeira vez é com a gente!
>
> Consórcio é basicamente um grupo de pessoas que pagam parcelas mensais
> juntas — sem juros. Todo mês tem uma assembleia e alguém do grupo é
> contemplado por sorteio ou lance pra receber a carta de crédito e
> comprar a moto.
>
> É diferente do financiamento justamente porque não tem juros — você paga
> só uma taxa de administração, que é bem menor.
>
> Posso te fazer 3 perguntinhas rápidas pra entender seu perfil?"

**O que o docx exige (jornada-canonica.md, passo 1, ramo "se não fez consórcio"):**

| Bullet do docx | Coberto hoje? |
|---|---|
| Explicação rápida: "Consórcio é uma forma de juntar com outras pessoas para comprar um bem sem juros, com parcelas mensais. Você é contemplado por sorteio ou lance (um valor a mais que você oferece)." | ✅ coberto (com outras palavras) |
| "Todo mês você participa de sorteios e também pode antecipar sua contemplação com um lance." | ✅ coberto |
| "É bem diferente de financiamento: no financiamento você paga juros e recebe o crédito na hora. No consórcio você paga só a taxa de administração, que é bem menor, mas espera ser contemplado." | ✅ coberto |
| **"Nosso papel na Aja Agora é encontrar o grupo com maior chance de atender seu objetivo no prazo que você deseja."** | ❌ **FALTANDO — ponto principal apontado** |
| Botão: "Entendi, pode continuar" | ✅ coberto |

**Correção:**
1. Incluir o ponto do **papel da Aja Agora** na explicação de primeira vez
   ("Nosso papel na Aja Agora é encontrar o grupo com maior chance de
   atender seu objetivo no prazo que você deseja").
2. Direção de tom (pedido do cliente): **mais afinidade, mais comunicação
   com o cliente** — a explicação atual está tecnicamente correta mas seca.

**Onde mexer (provável):** diretiva/system prompt da explicação de primeira
vez (`src/lib/agent/orchestrator/directives.ts` ou system-prompt do agente).

**Regressão:** Camada 1 (âncora "papel" / "encontrar o grupo" no prompt) +
Camada 2 (cassette do turno de explicação). Rubric: criterio de fidelidade
do passo 1 já cobra os bullets — conferir se cobra o do papel da Aja Agora.

---

## FIX-2 — Linguagem amigável: eliminar jargão "crédito" / "carta de crédito" da copy visível

**Onde acontece:** Em toda a jornada — evidência no print do gate `credit`:

> Pergunta do agente: "Qual faixa de **crédito** faz mais sentido pra você?"
>
> Label do slider: "**Crédito** — R$ 20 mil" (artifact com sliders
> Crédito/Parcela mensal + botão "Buscar opções").

**Pedido (veio do cliente também — o docx já usa "valor do bem"):**

1. **"crédito"** quando se refere ao valor que o usuário quer → trocar por
   **"valor do bem"**. Vale pra pergunta do gate, label do slider e
   qualquer outra menção.
2. **"carta de crédito"** → termo mais amigável que um leigo entenda.
   Kairo pediu sugestão. Propostas (decidir na execução):
   - **1ª menção (explicativa):** "a carta de crédito — o valor que você
     recebe pra comprar o seu bem"
   - **Menções seguintes:** "valor do bem" / "valor liberado" / "o valor
     que você recebe"
   - Padrão: nunca usar o jargão SECO em pergunta/label; quando o termo
     aparecer (ex.: explicação de primeira vez), acoplar a explicação.

**Escopo do replace (só copy visível ao usuário):**
- Perguntas de gates (`gate-questions.ts` — gate credit e outros)
- Label do slider do artifact de crédito (componente web)
- Recommendation card (passo 3/4), simulador (passo 4)
- Fechamento passo 5 (`closing-presentation.ts`), resumo WhatsApp
  (`contract-summary.ts`)
- WhatsApp formatter (`src/lib/whatsapp/formatter.ts`)
- System prompt / diretivas do agente

**⚠️ NÃO tocar:** código interno, schema do DB, payloads da API Bevi
(`creditValue`, `creditMin`/`creditMax` etc.) — só o que o usuário lê.

**Regressão:** Camada 1 (asserts das âncoras novas; assert NEGATIVO de que
pergunta/label não contêm o jargão seco) + atualizar `jornada-rubric.ts`
se citar "crédito" como âncora. Camada 2 se houver cassette afetado.

---

## FIX-3 — Gate de crédito deve virar o componente dinâmico do Bernardo (4 indicadores) — e o simulador NUNCA apareceu na jornada

**Onde acontece:** Passo 2, gate `credit`. Hoje aparece um artifact pobre:
2 sliders (Crédito R$ 20 mil / Parcela mensal R$ 500) + botão "Buscar opções".

**Problema duplo (palavras do Kairo):**
1. "Esse componente aí do crédito e da parcela mensal deveria ser o
   componente lá do Bernardo" — o slider simples de 2 linhas não é o
   conceito aprovado.
2. **"Esse outro componente do Bernardo nunca apareceu — até agora pra mim
   ele não apareceu ainda."** → o simulador dinâmico (proposta-simulador /
   simulator-offer) não surgiu em NENHUM momento da jornada no teste
   manual. Pode ser bug real de fluxo, não só questão de design —
   **investigar o porquê**.

**O que o componente deve ter (visão do Kairo, a estudar/refinar):**

4 indicadores interligados, dinâmicos:

| # | Indicador | Observação |
|---|---|---|
| 1 | **Valor do bem** | não "crédito" (ver FIX-2) |
| 2 | **Quando pretende usar o valor** | segunda linha, como um range de datas — estratégia de tempo até contemplação |
| 3 | **Parcela mensal** | |
| 4 | **Valor do lance que consegue fornecer** | |
| +5 | **Lance embutido** (talvez) | "também deveria ser um dos indicadores" — entra junto com a estratégia do tempo de contemplação |

**Comportamento:** mexeu em um indicador → os outros se movimentam juntos
("com a inteligência que você vai criar desse componente"). O lance
embutido interage com o tempo que ele quer ser contemplado.

**Posição na jornada:** "ele tem que vir AQUI, nesse momento" — ou seja, no
gate `credit` do passo 2, substituindo os 2 sliders atuais.

**Ação na execução:**
1. Estudar o componente do Bernardo já implementado (simulador do passo 4 —
   `contemplation-dial`, artifact `simulator-offer`,
   `docs/jornada/proposta-simulador.md`).
2. **Investigar por que o simulator-offer nunca apareceu** na jornada do
   teste manual (bug de trigger/gate? condição nunca satisfeita em uso
   real?). Se for bug, é fix à parte com TDD.
3. Redesenhar o artifact do gate credit nessa direção (4-5 indicadores
   dinâmicos).

**⚠️ Constraint de produto (CLAUDE.md):** o simulador é conceito do
**Bernardo** — não implementar versão FINAL sem aval dele. A sugestão do
Kairo estende o conceito; implementar como proposta e deixar registrado
que o aval do Bernardo segue pendente.

**🔄 ATUALIZAÇÃO (mesma sessão):** o componente do Bernardo **apareceu**
mais tarde na jornada — depois do detalhamento da oferta (pós-reveal,
oferta CANOPUS). Ou seja: ele existe e renderiza, mas no **lugar errado**
e com **valores suspeitos** → ver FIX-6, que detalha o reposicionamento.

---

## FIX-4 — Pergunta "Você sabe o que é lance embutido?" + explicação não apareceram

**Onde acontece:** Passo 2, gate `lance-embutido`.

**O que o docx exige (print do docx anexado pelo Kairo):**

1. **Pergunta de checagem de conhecimento:**
   > "Você sabe o que é lance embutido? Fique tranquilo, a gente te ajuda!"
   — dá ao usuário a chance de dizer se sabe ou não o que é.
2. **Explicação (pra quem não sabe):**
   > "O lance embutido permite usar parte da própria carta de crédito como
   > lance, por exemplo: em uma carta de R$ 100 mil, você pode usar parte
   > desse valor para aumentar suas chances de contemplação. Isso pode
   > ajudar quem não possui todo o valor do lance disponível hoje."

**O que aconteceu no teste manual:** NENHUM dos dois apareceu — nem a
pergunta, nem a explicação. O gate atual provavelmente vai direto ao
"quer considerar?" sem o ramo educativo.

**Ação na execução:**
1. Verificar `gate-questions`/diretivas do gate `lance-embutido`: existe o
   ramo "sabe o que é?" → explicação → só então o opt-in?
2. Conferir o trecho contra `jornada-canonica.md` (se o ramo não estiver
   transcrito lá, atualizar a partir do docx).
3. **Interação com FIX-2:** a explicação do docx usa "carta de crédito" —
   aplicar o padrão de linguagem amigável (explicação acoplada na 1ª menção).
4. **Interação com FIX-3:** se o lance embutido virar indicador do
   componente dinâmico, o ramo educativo continua necessário ANTES/JUNTO
   do componente.

**Regressão:** Camada 1 (âncoras da pergunta + explicação) + Camada 2
(cassette do gate) + rubric cobrando o ramo educativo do lance embutido.

**🔄 ATUALIZAÇÃO (mesma sessão de teste):** em rodada seguinte o ramo
**apareceu corretamente** — print mostra:

> "Você sabe o que é lance embutido? Fica tranquilo, a gente te ajuda!
>
> Ele permite usar parte da própria carta de crédito como lance — numa
> carta de R$ 100 mil, por exemplo, você usa uma fatia desse valor pra
> aumentar suas chances de contemplação, sem precisar ter todo o lance em
> dinheiro hoje.
>
> Quer considerar esse tipo de lance nas suas simulações?"
> [Sim, considerar lance embutido] [Não, lance com recursos próprios]

→ Reclassificar: o problema é **intermitência** (na primeira jornada do
Kairo o ramo não apareceu; nesta apareceu). Investigar em qual condição o
gate pula a explicação (ordem dos gates? resposta anterior? variação do
modelo?). O fix deve tornar o ramo educativo DETERMINÍSTICO, não
probabilístico. Atenção FIX-2: "carta de crédito" na explicação.

---

## FIX-5 — Opt-in de WhatsApp perdido no meio do turno: 2 perguntas numa mensagem, sem como responder

**Onde acontece:** Qualificação (entre gate `lance` e `lance-value`),
canal web.

**O que o agente despejou num ÚNICO turno (print):**

> "Boa, lance acelera bastante a contemplação!
>
> Kairo, pra eu conseguir puxar as opções reais de grupo pra você, o
> sistema precisa confirmar sua identidade antes.
>
> Posso anotar seu WhatsApp? Assim a gente já garante seu acesso e eu te
> mando as opções na hora.   ← PERGUNTA 1 — sem chip/botão pra responder
>
> Boa! E qual valor aproximado você pensa em dar de lance?"  ← PERGUNTA 2
> [Até R$ 2 mil] [Uns R$ 4 mil] [Uns R$ 6 mil] [R$ 8 mil ou mais]

**Problemas (palavras do Kairo: "ficou perdida, meio que deu 2 perguntas
numa mesma, sem opção do cara responder, ficou meio estranho"):**

1. **Duas perguntas no mesmo turno** — a do WhatsApp fica órfã: os chips
   renderizados são do gate `lance-value`, o usuário não tem como
   responder o opt-in.
2. **"Boa!" emendado** — o agente parece responder a si mesmo entre as
   duas perguntas.
3. **Meta-narrativa fora de hora** — "o sistema precisa confirmar sua
   identidade antes" no meio da qualificação, adiantando assunto do
   `identify` sem concluir nada.
4. **Suspeita de regressão/variante do BUG-OPTIN-ENGOLE-GATES** — o guard
   (`whatsapp-optin-guard`, `meta.revealCompleted !== true`) deveria
   suprimir opt-in pré-reveal; aqui o TEXTO do opt-in vazou no meio do
   turno do gate (o guard segura o artifact, mas não o texto?).

**Regra a estabelecer:** 1 turno = 1 pergunta acionável. Opt-in de
WhatsApp tem hora certa (pós-reveal, conforme guard) e quando aparecer
precisa de UI própria de resposta.

**Ação na execução:**
1. Cassette (Camada 2) com detector: turno de gate contendo "Posso anotar
   seu WhatsApp?" (ou >1 pergunta) = FAIL.
2. Investigar por que o texto vazou apesar do guard (guard atua no
   artifact/optin estruturado, mas o modelo improvisou em texto livre?).
3. Fix provável: regra no prompt ("NUNCA pedir WhatsApp junto de outra
   pergunta / antes do reveal") + verificação determinística se couber.
4. Camada 1: assert da regra no system prompt.

---

## FIX-6 — Componente do Bernardo no lugar errado (pós-detalhamento Bevi) e com valores inconsistentes

**Onde acontece:** Passo 4, DEPOIS do detalhamento da oferta real
(CANOPUS, via Bevi). O agente oferece: "Se quiser, temos o nosso simulador
pra ver como ficariam as suas parcelas, caso você seja contemplado em 3, 6
ou 12 meses — que tal?" → "Quero ver!" → renderiza o contemplation-dial.

**Problema 1 — posição (palavras do Kairo):** "ele NÃO deve ficar depois
que mostra ali a integração com a Bevi. Ele tem que ficar naquele momento
inicial" (= gate `credit` do passo 2 — ver FIX-3). "Aqui nesse momento não
faz tanto sentido (...) não tem nada a ver com isso daqui."

**Problema 2 — valores errados/inconsistentes (prints):**

| Fonte | Valor |
|---|---|
| Simulação Bevi (CANOPUS) | crédito **R$ 35.000,00**, parcela **R$ 475,93**/mês, 96 meses |
| Dial logo abaixo | crédito que você recebe **R$ 17.600**, parcela estimada **R$ 419**, lance embutido R$ 2.400, lance necessário 12%, 51 meses "chance alta" |

O dial parece calcular sobre a carta de R$ 20 mil do slider inicial
(20.000 − 12% embutido = 17.600), IGNORANDO a oferta real de R$ 35 mil que
acabou de ser confirmada na tela acima. Números lado a lado se contradizem
— quebra confiança. (Kairo mencionou também "parcela de R$ 80" na fala —
conferir na execução se existe cenário rendendo esse valor.)

**Decisões anotadas:**
1. Rever o componente inteiro (posição + cálculo) junto com FIX-3 — o
   destino dele é o momento do gate `credit`, não pós-reveal.
2. **Kairo pediu minha opinião crítica** sobre por que o componente foi
   posto pós-detalhamento (a racional original: docx passo 4 prevê o
   simulador DEPOIS da recomendação, sobre a oferta escolhida — "3, 6 ou
   12 meses" é cenário de contemplação da carta já recomendada). **Discutir
   na fase de estruturação do plano, NÃO agora** — ele quer ouvir a defesa
   antes de bater o martelo de mover/matar a instância pós-reveal.
3. Se o dial permanecer em algum lugar pós-reveal, TEM que usar os números
   da oferta REAL (creditValue da CANOPUS), nunca os do slider inicial.

**Regressão:** teste de consistência (payload do dial == valores da oferta
ativa) + cassette do turno do simulador.

---

## FIX-7 — Reveal com 1 opção: carrossel de card único + repetição do mesmo grupo logo abaixo

**Onde acontece:** Passo 3/4, reveal das opções. Busca retornou **só 1
opção** (CANOPUS) e a tela ficou:

1. Texto: "Encontrei boas opções na sua faixa, Kairo. Agora vou te mostrar
   a mais adequada pro seu perfil:" (plural "boas opções" + promessa de
   curadoria — mas só existe 1)
2. Card **Recomendação** CANOPUS (43% compatível, R$ 475,93/mês, R$ 35.000,
   96 meses, "Tenho interesse")
3. Logo abaixo, card **Simulação · CANOPUS** — o MESMO grupo repetido com
   detalhamento (custo total, taxa efetiva, cenário com lance, lance
   embutido 30%...)

**Palavras do Kairo:** "Quando só tem uma opção, obviamente essa única
opção vai ser a preferencial. Essa dinâmica ficou ruim porque ficam os
cards ali em cima que seria o carrossel — só que só tem um — e aí embaixo
repete ele de novo. Ajustar essa experiência quando tiver dois."

**Direção da correção:**
- O layout "carrossel em cima + recomendação destacada embaixo" só faz
  sentido com **≥2 opções**.
- Com **1 opção**: consolidar num card único (recomendação + detalhamento
  juntos), sem narrativa de comparação/curadoria ("a mais adequada" implica
  escolha entre várias).
- Ajustar também o texto do agente pra não prometer "boas opçõeS" no plural
  quando só há 1.

**Observação minha (validar na execução, mesma área):** CTAs duplicados no
card de simulação — botão "Tenho interesse" dentro do card + chips "Tenho
interesse!" / "Ajustar valor" / "Ver outras opções" logo abaixo. Redundante.

**Possível bug de produto por trás:** a regra de ≥3 opções
(`recommendWithFallback`, expansão ±20%/±50%, flag `insufficientOptions`)
deveria ter buscado alternativas — por que só veio 1 opção pra moto R$ 20k?
Investigar se o fallback rodou e se o agente comunicou a escassez como
manda o contrato (`insufficientOptions=true` → comunicar).

**Regressão:** teste de render condicional (1 opção = card único; ≥2 =
carrossel + destaque) + cassette do texto do reveal com 1 opção (sem
plural enganoso) + verificação do caminho insufficientOptions.

---

## FIX-8 — "Lance estimado p/ contemplar" = R$ 0,00 — cálculo errado, informação enganosa

**Onde acontece:** Card "Simulação · CANOPUS" (R$ 475,93/mês, 96 meses,
crédito R$ 35.000), bloco **COM LANCE EMBUTIDO (30%)**:

| Linha | Valor exibido |
|---|---|
| Crédito líquido recebido | R$ 24.500,00 |
| **Lance estimado p/ contemplar** | **R$ 0,00** ← ERRADO |

Acima, o "CENÁRIO COM LANCE" diz: "Com lance de 30% do crédito,
expectativa de contemplação em ~6 meses".

**Palavras do Kairo:** "o lance estimado para contemplar está ficando
zero... o cálculo pelo visto não está sendo feito correto. A gente tem que
revisar isso daí e **não dar uma informação errada de forma alguma**."

**Hipótese de causa:** a lógica parece fazer
`lance_total_necessário (30%) − lance_embutido (30%) = 0` → exibe R$ 0,00.
Mesmo que a conta interna "feche", apresentar "R$ 0,00 pra contemplar" é
enganoso — sugere contemplação garantida sem desembolso. E se a conta não
for essa, está duplamente errado.

**Ação na execução:**
1. Revisar a matemática do bloco lance embutido no componente de simulação
   — de onde vem "lance estimado p/ contemplar"? Heurística local ou dado
   da oferta Bevi?
2. Definir o cálculo correto com fonte real. Se o lance embutido cobre o
   lance todo, comunicar EXPLICITAMENTE ("seu lance pode sair 100% da
   carta — sem dinheiro do bolso; em troca o crédito líquido cai pra X"),
   nunca "R$ 0,00" seco.
3. **Regra de produto:** nenhum número exibido pode vir de heurística
   furada — na dúvida, OMITIR o campo em vez de exibir errado.

**Regressão:** unit test do cálculo (casos: embutido 30/lance 30, lance >
embutido, sem embutido) + teste de render (nunca "R$ 0,00" nesse campo sem
explicação).

**Cruzamentos:** FIX-6 (valores do dial) e FIX-3 (componente dinâmico) —
mesma família "matemática do simulador". Revisar os três juntos.

---

## FIX-9 — Passo 5 re-pede CPF e celular que já foram informados no identify

**Onde acontece:** Passo 5, fechamento. Usuário clica **"Sim, quero
contratar agora"** → agente: "Boa! Pra fechar, só preciso de uns dados
rápidos:" → artifact `contract_form` ("Vamos fechar sua proposta",
Administradora: CANOPUS) com:

- Campo **CPF** — VAZIO (placeholder 000.000.000-00)
- Campo **Celular** — VAZIO (placeholder (11) 99999-9999)
- Checkbox LGPD + botão "Continuar com segurança"

**Problema (palavras do Kairo):** "Ele está pedindo novamente aqui, depois
que eu falei que quero fechar, de novo o CPF e o celular. Está **totalmente
incorreto**, uma vez que já foi informado."

CPF e celular JÁ foram coletados no gate `identify` (pré-reveal,
obrigatório — o tripwire `IdentityNotCollectedError` garante; identidade
salva cifrada via `storeIdentity`/`loadIdentity`). Esse gap já estava no
done report de 2026-06-04 como follow-up de UX — agora é correção oficial.

**Direção do fix:**
1. `contract_form` **pré-preenchido** com os dados do identify — CPF
   mascarado (028.\*\*\*.\*\*\*-38), celular formatado. Usuário só confere,
   marca LGPD e confirma.
2. Alternativa mais curta: identidade completa + consentimento já dado →
   reduzir a 1 clique de confirmação, sem form.
3. Avaliar o que o gate `consent` do início já cobre vs o checkbox LGPD do
   create-proposal Bevi (`termoLgpd`/`consultaDados`) — o checkbox pode ter
   que ficar; os CAMPOS de dados, nunca.
4. **Segurança:** CPF nunca em claro no payload do artifact — mascarar na
   UI, manter cifrado no backend (AES-256-GCM, IDENTITY_ENC_KEY).

**Regressão:** integration test (identidade presente → contract_form
pré-preenchido/mascarado) + Camadas 1/2.

---

## Observações colaterais minhas (dos prints — validar com Kairo na estruturação)

> Itens que EU notei nos prints mas o Kairo não apontou explicitamente.
> Não viram FIX sem validação.

1. **Copy emendada no reveal** (print do FIX-9): "…Quer ajustar a carta de
   crédito?**Show**, esse plano encaixa bem no que você pediu!" — frases
   coladas sem espaço/quebra, parecendo o agente respondendo a si mesmo
   (mesma família do "Boa!" do FIX-5).
2. **"Deixa eu buscar as melhores opções pra você, Kairo!"** seguido
   imediatamente do detalhamento completo — promessa de busca + resultado
   no mesmo turno soa estranho.
3. **CTAs duplicados** no card de simulação (já anotado no FIX-7): botão
   "Tenho interesse" do card + chips "Tenho interesse!" / "Ajustar valor" /
   "Ver outras opções".
4. **Badge "43% compatível"** no card de recomendação único (FIX-7): score
   baixo exposto ao usuário na ÚNICA opção mostrada — vender "a mais
   adequada pro seu perfil" com 43% mina a confiança. Rever se o score
   deve aparecer e como.

---

## FIX-10 — Upload de documento dispara "Enviei meu documento" no 1º arquivo, sem esperar o verso

**Onde acontece:** Passo 5, artifact `document_upload` — card "Envie seu
documento (RG ou CNH)" / "Frente e verso. É opcional — você pode enviar
depois." com slots **RG/CNH — frente** e **RG/CNH — verso** + "Pular por
agora".

**O que acontece hoje (print):** Kairo subiu SÓ a frente da CNH → na hora,
o componente auto-enviou a mensagem **"Enviei meu documento"** e o bot já
começou a responder (typing) — sem dar chance de subir o verso. (No print:
slot frente com spinner, verso vazio, "Enviei meu documento" já postado.)

**Palavras do Kairo:** "aquele botão ali não pode responder exatamente
quando enviou o documento. Tem que ser uma dinâmica melhor, pra dar tempo
do cara, dar a oportunidade de preencher a frente e o verso."

**Direção do fix (decidir na execução):**
1. Upload de cada slot NÃO dispara mensagem ao agente — cada slot mostra
   estado próprio (✓ enviado).
2. "Enviei meu documento" só com ação EXPLÍCITA (botão "Pronto, enviei
   tudo") **ou** quando ambos os slots completarem.
3. Se o usuário concluir só com a frente, o agente pergunta gentilmente do
   verso (sem bloquear — docs são opcionais por contrato).
4. "Pular por agora" permanece como está.

**Regressão:** teste de componente (upload da frente → NENHUMA mensagem
auto-enviada; ambos os slots ou botão explícito → mensagem única) + E2E do
fluxo de upload.

---

*(próximas correções entram abaixo conforme o Kairo for apontando)*

---
data: 2026-06-15
bloco: bloco-a-polir-funil-retorno
escopo: FIX-51 — popup "voltar à conversa ou começar nova"
autor: executor do bloco (decisão autônoma — operador autorizou no _prompt.md passo 2)
---

# ADR — Decisões de design do popup de retomada (FIX-51)

Contexto: hoje (FIX-46) o retorno same-device hidrata a conversa anterior
**automaticamente, sem perguntar** (`theater-chat.tsx`: `messages.length > 0` →
monta o `ChatProvider` já hidratado). Quem queria recomeçar do zero não tem
saída; quem queria continuar não recebe confirmação de que voltou. O operador
pediu: *"algum popup perguntando se quer voltar para a conversa anterior ou
começar uma nova (sempre seguindo o design system)."*

As decisões abaixo foram tomadas com o raciocínio da skill `brainstorming`
(explorar contexto, levantar 2-3 abordagens, pesar trade-offs, YAGNI), mas o
executor é o decisor — sem perguntas, best practice + design system do projeto.

---

## Decisão 1 — Quando mostrar o popup (limiar de progresso)

**O que decidir:** mostrar o popup sempre que houver conversa retomável, ou só
quando há progresso real?

**Opções consideradas:**
- (a) Sempre que existir conversa retomável (qualquer 1 fala).
- (b) Só com **progresso significativo** (limiar mínimo de mensagens e/ou raia).

**Escolhida: (b) — limiar mínimo.** Mostrar popup numa conversa de 1-2 falas é
ruído puro (o usuário mal começou; perguntar "voltar ou nova?" é fricção sem
ganho). Abaixo do limiar, mantém-se o comportamento atual: **hidrata direto, sem
perguntar** (continuidade silenciosa, zero atrito — regra de ouro do FIX-46).

**Limiar:** o resume passa a expor um booleano derivado no servidor —
`meaningfulProgress` — verdadeiro quando **`messageCount >= 4`** (≈2 trocas
reais) **OU** a conversa passou da qualificação (`metadata.revealCompleted` ou
`maxStageReached` em `qualificado`+). O sinal de raia cobre o caso de poucas
mensagens-texto mas muito progresso por cards (gates/artifacts não contam como
mensagem-texto). Combinar os dois evita tanto o falso-positivo (saudação) quanto
o falso-negativo (avançou via cards). Constante única e nomeada
(`RESUME_MIN_MESSAGES = 4`) pra teste determinístico.

**Por quê:** o limiar é a diferença entre "popup útil" e "popup chato". Stage +
contagem são derivações baratas e já disponíveis no servidor; não exigem novo
estado. YAGNI: nada de configuração de limiar por persona/canal agora.

---

## Decisão 2 — "Começar nova" e o destino da conversa anterior

**O que decidir:** ao escolher "Começar nova", o que acontece com a conversa
anterior? Apaga? Arquiva? Continua sendo oferecida na próxima volta?

**Opções consideradas:**
- (a) Apagar a conversa anterior.
- (b) Preservar e **continuar oferecendo** indefinidamente.
- (c) Preservar (histórico intacto) e deixar a **recência** supersedê-la: a nova
  conversa, com a mesma identidade/cookie, vira o alvo de retomada.

**Escolhida: (c).** A conversa anterior **NUNCA é apagada** — coerente com a
visão consolidada do contato (FIX-45) e a regra de produto de preservar
histórico. "Começar nova" apenas monta o `ChatProvider` **sem `initialMessages`
e sem `initialConversationId`**, criando uma thread limpa. O `POST /api/chat`
vincula essa nova conversa ao **mesmo cookie `aja_uid`** (identidade/contato
preservados — não vira lead órfão, mesmo agente Letta). Como o resume busca a
conversa web mais recente por cookie (`order by updatedAt desc`), assim que a
nova recebe a 1ª mensagem ela passa a ser o alvo natural de retomada e a antiga
deixa de ser oferecida — **sem flag de arquivamento** (a recência já resolve).

**Por quê:** apagar destrói histórico de produto (proibido pela regra). Oferecer
a antiga pra sempre confundiria ("de qual conversa estamos falando?"). Deixar a
recência mandar é o caminho mais simples que satisfaz "não perde o contato" e
"não re-oferece a abandonada" — sem novo endpoint, sem nova coluna (YAGNI). O
cookie NÃO é limpo em "Começar nova" (limpar viraria lead órfão).

---

## Decisão 3 — Componente: Dialog (design system) vs banner inline

**O que decidir:** popup bloqueante (Dialog centrado) ou banner inline menos
intrusivo?

**Opções consideradas:**
- (a) `Dialog` do design system (`src/components/ui/dialog.tsx`, base-ui),
  bloqueante e centrado.
- (b) Banner inline no topo do palco.

**Escolhida: (a) — Dialog do design system.** O operador pediu "popup"
explicitamente, e a decisão "voltar vs nova" é um **gate de entrada** (precisa
ser resolvida antes de o chat montar) → bloqueante é o comportamento correto. Usa
o `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogDescription`/
`DialogFooter` já existentes (zero componente de UI do zero — regra do projeto).

**Mobile-first** (o teatro é mobile-first): botões empilhados em coluna no mobile
(o `DialogFooter` já faz `flex-col-reverse` → `sm:flex-row`), alvos de toque
confortáveis (botões `size` padrão, ≥44px de altura efetiva), `max-w` do Dialog
já respeita a margem da tela. O Dialog **não** mostra o "X" de fechar nem fecha
por clique no overlay/Esc sem escolha — fechar sem decidir é ambíguo; as duas
ações (Voltar / Começar nova) são as únicas saídas (decisão explícita do
usuário). `showCloseButton={false}` + `dismissible` desligado.

**Por quê:** reaproveitar o design system é regra dura do projeto; bloquear é
semanticamente correto pra um gate de entrada; o Dialog base-ui já entrega
acessibilidade (foco, `role=dialog`, título/descrição) e responsividade.

---

## Decisão 4 — Cópia (PT-BR, sem cara de IA)

**O que decidir:** o texto do popup.

**Opções consideradas:** tom robótico/assistente ("Olá! Detectei uma conversa
anterior. Como posso ajudar?") vs tom de consultor próximo, direto, sem clichê
de IA e sem travessão de IA.

**Escolhida:** tom de consultor próximo, frases curtas, zero clichê de IA:

- **Título:** "Continuar de onde você parou?"
- **Descrição:** "Você tem uma conversa em andamento por aqui. Quer voltar pra
  ela ou começar do zero?" — quando houver `lastActivityAt`, acrescenta uma linha
  discreta: "Última atividade: há {tempo relativo}." (date-fns + locale pt-BR).
- **Ação primária:** "Voltar à conversa"
- **Ação secundária:** "Começar nova"

**Por quê:** segue o tom do chat (consultor, não robô), respeita a regra de
"texto sem cara de IA" (sem "Olá! Eu sou", sem "Como posso ajudar", sem
travessão de IA, sem emoji decorativo). "Começar do zero" é mais humano que
"iniciar nova sessão". O tempo relativo dá pista útil sem vazar conteúdo
sensível (nada de CPF/valor/objetivo no popup — só recência).

---

## Encadeamento com FIX-49

O popup é o **gate de entrada** da volta. Ao escolher "Voltar à conversa", a
hidratação acontece e o **FIX-49** cuida de *como* a volta se apresenta (âncora
"Você voltou", scroll no último ponto acionável, pill suprimida, artifacts/gates
do histórico selados). FIX-49 estabelece a flag `resumed`; FIX-51 a consome no
gate. Mesmos arquivos de retomada → executados em sequência pelo mesmo dev.

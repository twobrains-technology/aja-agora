# Proposta — Funil acionável + Cliente unificado + Retorno na web

> **Status:** PROPOSTA DE DESIGN · 2026-06-14 · **AGUARDA AVAL DO KAIRO**
> antes de virar implementação. Nada aqui vai pra código sem a revisão dele —
> mesmo espírito de [`proposta-simulador.md`](./proposta-simulador.md).
>
> Cobre duas features grandes que **compartilham um alicerce** (a entidade
> `contacts`):
> - **F1 — Funil refatorado + visão de contatos do cliente** ("propor e revisar
>   as raias, deixar o funil mover sozinho, e ter uma visão excelente de todos
>   os contatos do cliente — web e WhatsApp").
> - **F2 — Retorno do usuário na web** (mesmo device retoma o contexto; outro
>   device recupera por telefone/CPF; sem atrapalhar a primeira vez).
>
> Execução anotada em `docs/correcoes/todo/bloco-{a,b,c}-*` (FIX-41 a FIX-47).

---

## Palavras do Kairo (o pedido, literal)

**F1:** *"refatorar o funil dado o novo cenário — propor e revisar os passos do
funil (as raias), fazer com que ele funcione (que a cada parte da jornada ele
seja movido automaticamente), e que tenha todos os dados de contato do cliente
de uma forma muito excelente dentro da plataforma — além da visão da intenção
dele, adicionar uma visão de todos os contatos que ele fez, seja por whatsapp ou
web. Olhe para a nossa jornada perfeita e monte uma feature exclusiva para essa
refatoração."*

Sobre as raias: *"pode olhar para os passos da jornada mas faça algo que faz
sentido a nível de mercado também e de acionamento. não sou especialista disso,
você tem que me ajudar."*

**F2:** *"o usuário voltar pela web... se for pelo mesmo computador / mesmo
dispositivo, ele vai conseguir voltar exatamente com o contexto que ele estava.
Agora se não fosse essa história, a gente tem que realmente tratar ele como se
fosse a primeira vez — não dá pra prejudicar a experiência da primeira vez. Mas
ao mesmo tempo precisa ter uma forma de buscar, com base no telefone do usuário,
talvez, as propostas dele e tudo que ele já fez. Mas isso não pode atrapalhar a
experiência."*

**Identidade:** *"além do telefone temos também o CPF."* · *"eu preciso do CPF,
não tem problema estar raw por hora."*

---

## Diagnóstico (o que o código mostra hoje)

| Tema | Hoje | Evidência |
|---|---|---|
| Entidade "cliente" | **Não existe.** `leads` é 1:1 com `conversation`. Mesmo telefone em web+WhatsApp = **leads duplicados** no kanban. | `schema.ts:201-218` (sem índice em `phone`/`email`) |
| Visão cross-channel | Só a **IA** vê (Letta unifica por identidade). **Admin vê silos** — `lead-detail` mostra UMA conversa. | `letta-adapter.ts:257-260` (`channels[]`), `api/admin/leads/[id]/conversation` (singular) |
| CPF | Cifrado AES-256-GCM em `conversations.metadata.identityEnc` — **não pesquisável** sem decifrar a base toda. | `conversation/identity.ts:64-108` |
| Funil — automação | **Híbrido.** Automático até `qualificado` (tools) e `em_negociacao` (handoff WhatsApp). `proposta_enviada` e `fechado_ganho` são **100% manuais** (drag-and-drop). | `runner.ts:39-41`, `whatsapp/proxy.ts`, `kanban-board.tsx:60-96` |
| Funil — regressão | Drag-and-drop **permite regredir** (rota não usa `onlyAdvance`). | `api/admin/leads/[id]/stage/route.ts` |
| Auditoria | `lead_events` registra cada transição (quem/quando/de-onde) mas **nunca é exibida na UI**. | `schema.ts:221-232` |
| Sinais de fechamento | `bevi_proposals` tem `proposalStatus` (`simulacao`→`documentos`), links de PDF, `leadId`. **Sinal pronto** pra automatizar as raias finais. | `schema.ts:239-276` |
| Retorno same-device | **Não retoma.** `conversationId` é **gerado novo a cada visita**; cookie não é vinculado à conversa no banco. | `chat/provider.tsx:80-81`, `api/chat/route.ts:230-273` |
| Retorno cross-device | **Zero ponte** na web. Só o WhatsApp reconhece (via `waId`). | (sem rota `resume`/lookup por telefone) |
| Base reaproveitável | Cookie `aja_uid` 90d HttpOnly · reconciliação cookie→telefone no Letta · gate de CPF cifrado · `loadConversationHistory()`. | `identity.ts:11-12`, `reconciler.ts:32-78` |

---

## Parte 1 — Cliente unificado (a entidade `contacts`)

O alicerce das duas features. Um **cliente** passa a ser uma entidade própria,
resolvida por **telefone, CPF ou e-mail**, agregando N conversas/leads/propostas
de qualquer canal.

### Schema proposto

```
contacts
  id            uuid PK
  phone         text  (E.164, nullable, index)      -- normalizePhoneBR
  cpf           text  (11 dígitos, nullable, index)  -- RAW por hora (decisão Kairo)
  email         text  (nullable, index)
  name          text  (melhor nome conhecido)
  createdAt / updatedAt
  -- invariante: pelo menos um de (phone, cpf, email) presente

conversations.contactId  uuid FK → contacts.id  (nullable até resolver identidade)
leads.contactId          uuid FK → contacts.id
bevi_proposals.contactId uuid FK → contacts.id  (denormaliza pra consulta direta)
```

### CPF raw — decisão e dívida técnica

> Kairo (2026-06-14): *"preciso do CPF, não tem problema estar raw por hora."*

`contacts.cpf` em texto puro, índice direto, busca trivial. **Registrado como
dívida técnica de segurança** (`DES-CPF-RAW`): pós-piloto, endurecer pra hash
determinístico (HMAC-SHA256 com chave dedicada) ou manter cifrado + coluna de
hash pesquisável. Mitigações que **valem mesmo raw** e entram já: nunca logar
CPF, nunca injetar no prompt do LLM (já há `maskCpf`), exibir mascarado na UI
admin por padrão (revelar sob ação explícita), acesso à coluna restrito.

### Resolução e dedup

- `resolveContact({ phone?, cpf?, email? })` — encontra ou cria o contato,
  fazendo merge quando dois identificadores apontam pro mesmo cliente (ex.:
  telefone já existia, chega o CPF → consolida no mesmo `contacts.id`).
- Pontos de captura que já existem passam a alimentar `resolveContact`:
  contact-capture (nome/telefone), gate identify (CPF+celular), webhook
  WhatsApp (`waId`→telefone), lead form.
- **Migração/backfill** (dentro do container, `migrate-guard`): agrupa
  `leads`/`conversations` existentes por telefone normalizado; decifra
  `identityEnc` pra popular `contacts.cpf` raw; cria 1 contato por cliente real
  e religa as FKs. Leads anônimos (sem telefone/CPF) ficam sem `contactId` —
  não viram contato até se identificarem.

---

## Parte 2 — As raias do funil (a síntese que você pediu)

Princípio: **cada raia tem um gatilho de entrada automático (evento concreto da
jornada), um sinal rastreável no código, e uma próxima-ação óbvia pro time.**
Vocabulário comercial (o time entende), ancorado na jornada canônica, e
inteiramente movido por eventos — o admin não precisa arrastar nada no caminho
feliz.

| # | Raia | Significado (jornada canônica) | Gatilho de ENTRADA (automático) | Sinal no código | Próxima ação do time |
|---|---|---|---|---|---|
| 1 | **Novo** | Entrou, ainda não disse o objetivo (passo 1) | Conversa criada (web/WhatsApp) | insert em `conversations` | Nenhuma — IA conduz |
| 2 | **Engajado** | Declarou objetivo + perfil; respondendo qualificação (passo 1-2) | Capturou tipo+valor do bem **ou** nome **ou** rodou `simulate_quota` | contact-capture / `simulate_quota` | Nenhuma — IA qualifica |
| 3 | **Qualificado** | Recebeu as recomendações de grupo (passo 3-4) | tool `recommend_groups` | `runner.ts` LEAD_STAGE_BY_TOOL | Acompanhar; intervir se a IA travar |
| 4 | **Em negociação** | Decidindo: simulando cenários, abriu card de decisão, ou pediu especialista (passo 4) | Card de decisão aberto · `simulate_quota` repetida pós-recomendação · **handoff** humano | artifacts + `whatsapp/proxy` | Abordar quem pediu especialista / reaquecer quem esfriou |
| 5 | **Proposta enviada** | Proposta Bevi gerada, em coleta de documentos/assinatura (passo 5) | **`bevi_proposals` criada** / `proposalStatus` avança | `proposal-repo` create/update | Acompanhar documentos e assinatura |
| 6 | **Fechado — ganho** | Contrato efetivado (passo 5-6) | `proposalStatus = documentos`/assinado **ou** `confirmOffer` | `fulfillment.confirmOffer` | Onboarding pós-venda (passo 7) |
| — | **Perdido** | Desistiu ou esfriou | Inatividade > N dias (job) **ou** admin marca manual | job de inatividade / ação admin | Reengajar (campanha/retomada) |

### O que muda em relação a hoje

1. **Fecha os dois buracos de automação:** `proposta_enviada` passa a entrar
   sozinha quando a proposta Bevi nasce; `fechado_ganho` quando o status avança.
   Hoje os dois são 100% manuais.
2. **"Em negociação" deixa de depender só do handoff WhatsApp** — passa a captar
   também quem está decidendo no chat (card de decisão / simulações repetidas).
3. **Forward-only por padrão:** a automação nunca regride. O admin ainda pode
   mover manualmente (inclusive marcar `Perdido`), mas o drag passa a registrar
   intenção e a UI sinaliza regressões em vez de permiti-las em silêncio.
4. **`Perdido` deixa de ser só botão:** ganha gatilho por inatividade (lead
   parado há N dias sem fechar) — abre trabalho de reengajamento pro time.

> Os **nomes** das raias podem mudar na sua revisão — a tabela é proposta. O que
> defendo é a **mecânica**: 1 raia = 1 gatilho automático + 1 ação de time.

---

## Parte 3 — Visão "excelente" do contato (além da intenção)

Substituir o `lead-detail-panel` (uma conversa) por um **`contact-detail`** que
mostra o cliente inteiro:

- **Cabeçalho:** nome, telefone, CPF (mascarado, revela sob ação), e-mail, raia
  atual, valor do bem, canais usados (web/WhatsApp).
- **Timeline unificada cross-channel:** todas as mensagens de **todas** as
  conversas do contato (web + WhatsApp) numa linha do tempo única, com selo de
  canal por mensagem. É a "visão de todos os contatos que ele fez" pedida.
- **Intenção (mantém):** os insights LLM que já existem (intenção, orçamento,
  objeções, próxima ação).
- **Histórico do que fez:** simulações (`simulation_result`), recomendações
  (`recommendation_card`) e **propostas** (`bevi_proposals`: valor, parcela,
  prazo, administradora, status, link do PDF).
- **Histórico de movimentação no funil:** `lead_events` finalmente exibido —
  quando e por quê o cliente mudou de raia (quem moveu: sistema ou admin).

---

## Parte 4 — Retorno do usuário na web (F2)

Três cenários, do mais seguro pro mais sensível:

### 4.1 Mesmo dispositivo — retoma sem fricção *(seguro)*

O cookie `aja_uid` (HttpOnly, 90d) **já prova posse do device**. Falta a ponte:

- **Vincular** a conversa web ao cookie no banco (hoje são ortogonais).
- `GET /api/chat/resume` → devolve a última conversa web ativa daquele cookie
  (id + mensagens + meta), sem cache.
- O `ChatProvider` hidrata com `initialConversationId` + `initialMessages` em
  vez de gerar UUID novo. O cliente **volta exatamente onde estava.**

### 4.2 Outro dispositivo — primeira vez intacta, recuperação sob demanda

Sem o cookie, **trata como primeira vez** (zero atrito, exatamente como você
pediu). A recuperação é **opt-in**, oferecida só quando faz sentido (ex.: o
cliente diz "já comecei isso antes" / informa telefone na qualificação):

- **Contexto leve** (a IA "lembra" o objetivo e o rumo, via memória Letta por
  telefone/CPF): **liberado sem verificação** — é o que a pessoa já contou.
- **Dado sensível** (CPF, PDF de proposta, documentos, valores fechados): ver
  4.3.

### 4.3 ⚠️ DECISÃO PENDENTE — segurança da recuperação cross-device

**Telefone não é segredo, CPF também não.** "Digite o telefone → veja suas
propostas" deixa qualquer um que saiba o número ver os dados de outra pessoa
(e tem o caso real do **casal com o mesmo WhatsApp**). Precisa da sua decisão:

- **(A) Recomendado — verificação de posse pra dado sensível.** Contexto leve
  livre; pra revelar CPF/PDF/documentos de uma sessão anterior em device novo,
  um **OTP via WhatsApp/SMS** pro próprio número. Fricção cirúrgica (só nesse
  momento), não toca a primeira vez nem o same-device.
- **(B) Modo piloto — sem OTP, com aviso.** Recupera tudo só com telefone/CPF,
  mais rápido de entregar, **com o risco explícito acima**. Coerente com o
  "raw por hora" se você aceitar o mesmo risco aqui e endurecer depois
  (`DES-CPF-RAW` cobre o armazenamento; isto cobre a autorização).

Minha recomendação: **(A)**. Marque (B) se quiser destravar o piloto e endurecer
junto com o CPF depois — mas aí fica registrado como risco aceito.

---

## Plano de execução — 3 blocos, 2 ondas

A entidade `contacts` é fundação compartilhada: altera `schema.ts` e cria
migração que **F1 e F2 dependem**. Por isso vai primeiro (serializar aqui é a
exceção justificada — paralelo geraria 3 migrações concorrentes no mesmo schema,
conflito estrutural duro). Depois, funil e retorno rodam **em paralelo**.

| Onda | Bloco | Feature | Itens |
|---|---|---|---|
| 1 | **A — Identidade unificada** | alicerce | FIX-41 (tabela `contacts` + FKs + índices), FIX-42 (migração/backfill + `resolveContact`) |
| 2 | **B — Funil acionável** | F1 | FIX-43 (raias + máquina forward-only), FIX-44 (automação das transições faltantes), FIX-45 (visão consolidada do contato) |
| 2 | **C — Retorno na web** | F2 | FIX-46 (retomada same-device), FIX-47 (recuperação cross-device + verificação) |

B e C são **paralelos** entre si (admin-side × chat-side, arquivos disjuntos).

---

## Decisões que dependem de você (antes de lançar)

1. **Raias** — aprova a tabela da Parte 2 (mecânica + nomes) ou ajusta?
2. **Recuperação cross-device** — opção **(A)** verificação de posse ou **(B)**
   modo piloto sem OTP? (Parte 4.3)
3. **`Perdido` por inatividade** — qual N de dias sem avanço marca como perdido?
   (sugiro 14; trivial de ajustar)

Resolvido isso, os blocos viram spec de implementação com plano de teste e
critérios de aceite por cenário, e seguem pro Superset.

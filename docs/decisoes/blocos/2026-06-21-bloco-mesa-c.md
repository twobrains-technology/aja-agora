---
data: 2026-06-21
bloco: bloco-mesa-c-copiloto
escopo: FIX-66 (roteamento inbound + persistência) + FIX-67 (agente copiloto + injeção do PDF)
autor: executor do bloco (decisão autônoma — operador autorizou no _prompt.md passo 2)
spec: docs/visao/mesa-de-operacao.md §5 (o copiloto) + §8 (sem colisão de canal) + DEC-C (PDF full-text)
---

# ADR — Decisões de design do copiloto de mesa (FIX-66 + FIX-67)

Contexto: a mesa de operação Aja Agora (spec `mesa-de-operacao.md`) tem um **agente
copiloto** que orienta o **atendente de mesa** (não o cliente) a formalizar o contrato
na administradora, com o **PDF de procedimento daquela administradora injetado** no
contexto. A fundação (schema das 5 entidades + migration 0026) e o transbordo já existem
(blocos mesa-A/mesa-B). Este bloco entrega a **camada de agente**: roteamento inbound por
número (mensagem do WhatsApp de um atendente de mesa → copiloto, nunca vendas) e o builder
do system prompt do copiloto com injeção do `administradora_docs.texto_extraido`.

As decisões abaixo foram tomadas com o raciocínio da skill `brainstorming` (explorar
contexto, levantar 2-3 abordagens, pesar trade-offs, YAGNI), mas o executor é o decisor —
sem perguntas, best practice + padrões do repo (`src/lib/agent/`, `src/lib/whatsapp/proxy.ts`).

---

## Decisão 1 — Shape do system prompt do copiloto (stable × dynamic)

**O que decidir:** como estruturar o prompt pra (a) maximizar prompt cache e (b) injetar o
PDF + dados do caso.

**Decisão:** dois blocos, espelhando o padrão do agente principal (`buildSpecialistPrompt`
→ `{ stable, dynamic }` consumido por `builder.ts`):

- **`stable`** (cacheável — `cacheControl: ephemeral`): persona + regras invioláveis +
  **o(s) manual(is) full-text da administradora** (`<manual_administradora>`). Dentro de um
  mesmo handoff a administradora é fixa → o manual é byte-idêntico entre turnos → o cache da
  Anthropic dá hit (TTL 5 min). O manual é o maior pedaço do prompt e o que muda menos — é
  exatamente o que DEC-C manda cachear.
- **`dynamic`** (NÃO cacheado): dados do caso — cota/oferta escolhida (administradora, grupo,
  crédito, parcela, prazo, link da proposta Bevi) + dados mínimos do cliente (primeiro nome,
  contato). Muda por handoff; fica fora do bloco cacheado pra não invalidar o cache.

**Por quê não um bloco só:** com o PDF (grande, estável) junto dos dados do caso (pequenos,
voláteis), qualquer mudança de caso invalidaria o cache do PDF inteiro. Separar preserva o
hit. Mesmo trade-off que o agente principal já adota (`builder.prompt-cache.test.ts`).

## Decisão 2 — Como cachear o PDF

**Decisão:** `providerOptions.anthropic.cacheControl.type: "ephemeral"` no bloco system
`stable`, idêntico ao `builder.ts:200`. O `streamText` recebe os blocos como **mensagens
system** (não como `system: string`) — só assim dá pra anexar `providerOptions` por bloco.
A data corrente, se injetada, fica em precisão de dia (`slice(0,10)`) dentro do stable, pelo
mesmo motivo do agente principal (timestamp com hora invalidaria o cache a cada request).

## Decisão 3 — Multi-doc por administradora

**Decisão:** o copiloto injeta **todos os docs ativos** (`is_active = true`) da administradora
do handoff que tenham `texto_extraido` não-nulo, concatenados, cada um numa seção rotulada
`<documento titulo="..." tipo="...">...</documento>`, ordenados por `tipo` e depois `versao`
desc. Cobre o caso da spec ("manual + tabela + anexos", §3.2). Doc sem `texto_extraido` (PDF
ainda não processado) é **pulado** — não entra texto vazio no prompt.

**Edge — administradora sem nenhum doc com texto:** o prompt ainda é montado, mas o bloco do
manual diz explicitamente "nenhum manual processado disponível para esta administradora —
oriente com base no procedimento geral de consórcio e peça ao admin para subir o manual". O
copiloto não inventa procedimento específico que não tem.

## Decisão 4 — O que fazer se NÃO há handoff aberto pro número

**Decisão:** o número é de um atendente de mesa cadastrado, mas sem `mesa_handoffs` em status
`aberto`/`em_andamento`. Responde com mensagem amigável ("Nenhum caso aberto na sua mesa
agora. Assim que um cliente for transbordado pra você, te mando o resumo por aqui.") e
**retorna** — não cai em vendas, não chama o LLM (não há contexto de caso pra orientar).
Espelha o ack do `processor.ts:61` pro atendente-com-login sem conversa ativa.

**Múltiplos handoffs abertos pro mesmo atendente:** pega o **mais recente** (`created_at`
desc) entre os abertos/em andamento. É o default sensato — o atendente normalmente está
operando o último caso recebido. (Evolução possível: o atendente escolher o caso por comando;
fora do corte inicial.)

## Decisão 5 — Precedência de roteamento (anti-colisão de canal, spec §8)

**Decisão:** o check `isMesaAttendantPhone(from)` é o **primeiro** early-return do
`processTextMessage` (logo após `/reset`), **antes** do `isAttendantPhone` (atendente de chat).
Número de atendente de mesa → **sempre** entra no caminho do copiloto e retorna; **nunca** cai
no agente de vendas, com ou sem handoff aberto. Essa é a garantia mais forte da regra
inviolável §8 ("o número de um atendente de mesa nunca pode cair no agente de vendas") — a
colisão de canal já causou bug no projeto (FIX-31/FIX-35), então o roteamento por número é
binário: é mesa → é copiloto.

A nuance da spec ("mesa tem precedência quando há handoff aberto") trata mesa-vs-atendente-de-
chat: como mesa vem primeiro, um número que fosse ambos resolve pra mesa. Sem handoff aberto,
ainda assim trata como mesa (ack "nenhum caso aberto"), não como cliente — porque o número
está cadastrado como operador, não como lead.

## Decisão 6 — streamText (não generateText) + sem tools

**Decisão:** o copiloto é Q&A textual one-shot (orienta/tira dúvida), **sem tool calling** —
não há ação a executar, só orientação. Usa `streamText` (SDK único do projeto) e coleta o
texto completo (`await result.text`) pra enviar como uma mensagem de WhatsApp. `streamText`
(vs `generateText`) mantém consistência com o runner e com a infra de cassette
(`MockLanguageModelV3 + doStream`) já usada em `tests/regression/agent-trajectory.test.ts`.
O `model` é injetável por parâmetro (default `anthropic(process.env.AI_MODEL ?? sonnet)`) pra
o cassette plugar o mock determinístico.

## Decisão 7 — Histórico da conversa copiloto↔atendente

**Decisão:** persistência em `mesa_copilot_messages` (tabela dedicada do schema, role
`attendant`/`assistant`). A cada turno: persiste a msg do atendente (role `attendant`) →
carrega o histórico do handoff ordenado por `created_at` → mapeia pro formato do SDK
(`attendant`→`user`, `assistant`→`assistant`) → chama o copiloto → persiste a resposta (role
`assistant`) → envia via `sendTextMessage`. Não reusa `conversations`/`messages` (essas são do
fluxo cliente↔vendas; misturar arriscaria a colisão de canal que a spec §8 proíbe).

---

## Regressão (CLAUDE.md — agente: 3 camadas)

- **Camada 1 (structural):** `system-prompt.test.ts` do copiloto (builder injeta o
  `texto_extraido` da administradora certa, marca o bloco stable como cacheável, persona não
  vaza stack/meta) + assert estrutural de que `isMesaAttendantPhone` consulta `mesa_attendants`
  e o hook está no `processor.ts`.
- **Camada 2 (cassette):** `describe` novo append-only em
  `tests/regression/agent-trajectory.test.ts` — (1) builder injeta o PDF da administradora
  certa; (2) número de mesa roteia pro copiloto, não vendas; (3) resposta limpa não casa
  detectores de meta-narrativa/stack.
- **Integration (DB real):** `routing.integration.test.ts` — msg de número de atendente de
  mesa com handoff aberto persiste em `mesa_copilot_messages` (attendant + assistant) e nunca
  chama o orchestrator de vendas.

## Atrito de flow observado (anotado, não bloqueante)

O `bootstrap-workspace.sh` gera o `.env.local` a partir de `.env.example`, mas o
`docker-compose.yml` exige (`:?`) `BETTER_AUTH_SECRET`, `ADMIN_EMAIL` e `ADMIN_PASSWORD`, que
**não constam no `.env.example`** — todo workspace novo quebra no `compose up`. Destravado
nesta sessão exportando os três no shell (não tocam `.env*`, valores dev). Fix de fonte
sugerido: o `.env.example` do projeto declarar os três com valores dev, ou o compose dar
`:-default` local. Não aplicado aqui pra não poluir a branch da feature com mudança de infra
não relacionada — registrado no resumo final.

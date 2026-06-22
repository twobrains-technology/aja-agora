# Decisões de design — Bloco Mesa-B (transbordo no kanban → WhatsApp do atendente)

> Data: 2026-06-21 · Autor: execução autônoma (worktree `feat/mesa-transbordo`)
> Itens: FIX-64 (botão + registro do handoff) · FIX-65 (outbound do dossiê)
> Régua: `docs/visao/mesa-de-operacao.md` §4-5 (fluxo), §8 (PII/LGPD), DEC-B (gatilho manual).

Decisões tomadas com autonomia (passo 2 do fluxo) — nenhuma trava o corte inicial. Onde há
trade-off, está marcado **revisável**.

## 1. O que vai no dossiê (campos) — FIX-65

A régua (§4) pede "dossiê mínimo do caso". §8 exige **minimização de PII** ("só o necessário
pra contratar"). O dossiê montado contém **apenas**:

| Campo | Fonte | Por quê entra |
|---|---|---|
| Nome do cliente | `leads.name` (fallback `contacts.name`) | O atendente precisa saber quem é pra contratar. |
| Contato (telefone E.164) | `leads.phone` (fallback `contacts.phone`) | Canal pra falar com o cliente durante a contratação. |
| Segmento | `bevi_proposals.segmento` | Identifica o tipo da cota (imóvel/auto/...). |
| Administradora | `bevi_proposals.administradora` | Define ONDE o contrato é feito. |
| Grupo | `bevi_proposals.grupo` | Identificador da cota na administradora. |
| Crédito (carta) | `bevi_proposals.credit_value` | Valor da carta contratada. |
| Parcela | `bevi_proposals.monthly_payment` | Valor mensal acordado. |
| Prazo (meses) | `bevi_proposals.term_months` | Prazo da oferta. |
| Link da proposta Bevi | `bevi_proposals.consortium_proposal_link` | Onde o atendente abre a proposta real. |

**NUNCA entram no dossiê (PII fora do necessário):**

- **CPF** — nem cru, nem mascarado. A régra do projeto (`contacts.cpf` DES-CPF-RAW) é
  explícita: "NUNCA logar, NUNCA injetar no prompt do LLM". WhatsApp de atendente é canal
  externo → CPF não trafega. O atendente acessa o CPF **no painel admin**, não pelo WhatsApp.
- **E-mail** do cliente — não é necessário pra contratar via administradora; reduz superfície
  de PII. (Revisável se a administradora exigir e-mail no cadastro.)
- **Links de documentos** (`documents_link_*`), endereço, qualquer dado sensível extra.

O dossiê fecha com um **ponteiro** ("Dados sensíveis como CPF ficam no painel — não trafegam
aqui") pra deixar claro pro atendente onde achar o que falta, sem expor.

## 2. Formato da mensagem — FIX-65

- **Texto plano** (`sendTextMessage`), PT-BR, otimizado pra leitura no WhatsApp (sem markdown
  pesado — WhatsApp não renderiza `**`/tabelas). Usa bullets `•` e um emoji de cabeçalho.
- Cabeçalho identifica a origem ("Novo caso na mesa — Aja Agora") pra o atendente saber o
  contexto sem ambiguidade.
- Campos ausentes (cota ainda não fechada, link faltando) são **omitidos** linha a linha — a
  mensagem nunca mostra "null"/"undefined". Se não há cota resolvida, o dossiê diz "Cota ainda
  não definida" e segue.
- A **orientação passo-a-passo** (com o PDF da administradora injetado) é do **bloco C**
  (copiloto). FIX-65 envia só o **dossiê do caso**; o gancho do copiloto fica marcado
  `TODO(bloco-c)` na API.

## 3. Idempotência (transbordar 2×) — FIX-64

**Um lead tem no máximo UM handoff ATIVO por vez** (status `aberto` ou `em_andamento`).

- `POST /transbordo` quando já existe handoff ativo pro lead → **409** com
  `{ error: "handoff_ativo_existe", handoffId }`. Não cria segundo registro, **não dispara
  segundo WhatsApp**.
- Motivo: protege contra double-submit (clique duplo) e modela a realidade — um caso está com
  **um** atendente por vez. Evita PII duplicada saindo no WhatsApp.
- Re-transbordo (trocar de atendente) exige **fechar/cancelar** o handoff atual primeiro —
  fluxo de reassign fica como **evolução** (revisável). O corte inicial é "abrir o caso na
  mesa", não "gerenciar reatribuição".

## 4. Resolução da administradora — FIX-64

`bevi_proposals.administradora` é `varchar(60)` (ex.: `CANOPUS`). Casa com a entidade
`administradoras` por, em ordem:

1. **`codigo_bevi`** (se setado na entidade e igual ao varchar) — match mais forte.
2. **`nome`** case-insensitive (`lower(nome) = lower(proposal.administradora)`).
3. **`slug`** case-insensitive (defensivo).

Sem match → `administradora_id = null`. **O handoff é criado mesmo assim** — o copiloto (bloco
C) trata a ausência de dossiê. A resolução **não bloqueia** o transbordo: registrar o caso na
mesa é o que importa; o dossiê PDF é enriquecimento.

## 5. Qual cota/proposta (beviProposalId) — FIX-64

- A API aceita `beviProposalId` **opcional** no body (forward-compatible pra seleção explícita
  de cota quando há múltiplas propostas).
- Quando omitido, resolve a **proposta mais recente do lead** (por `lead_id`; fallback por
  `conversation_id`) como a "cota escolhida". Caso comum: 1 proposta = a cota fechada.
- Lead **sem** proposta → handoff criado **sem** `bevi_proposal_id`/`administradora_id`
  (transbordo "frio" — o admin pode transbordar antes da cota fechar). Dossiê mostra "Cota
  ainda não definida". Revisável.
- O **dialog não expõe seleção de cota** no corte inicial (a maioria dos leads tem uma só);
  seleção multi-proposta = evolução. Mantém a superfície do bloco B dentro do escopo (sem
  endpoint novo de listagem de propostas, que arriscaria overlap com outros blocos).

## 6. Outbound é best-effort, mas reportado — FIX-64/65

- A API cria o handoff e **depois** dispara `sendCaseToAttendant`. Se o envio falhar (erro da
  Meta API), o handoff **permanece criado** (não há rollback) — a fonte de verdade é o
  registro. A resposta inclui `outboundError` pra UI sinalizar "registrado, mas o WhatsApp
  falhou". Caso humano não se perde por falha de canal externo.

## 7. Lista de atendentes no dialog — contrato com bloco A

- O dialog lista os `mesa_attendants` **ativos** consumindo `GET /api/admin/mesa-attendants`
  (endpoint do **bloco A** — `escopo_arquivos` de A inclui `src/app/api/admin/mesa-attendants/**`).
- É um contrato **de runtime via URL** (não import de código) → respeita "B não depende do
  código de A". O dialog é **tolerante**: aceita resposta `[...]` ou `{ attendants: [...] }`,
  filtra `isActive`. Marcado `TODO(bloco-a)` com o shape esperado
  (`{ id, nome, whatsapp, isActive }`). Em paralelo, se o endpoint ainda não existe, o dialog
  mostra "nenhum atendente" — o orquestrador mescla A+B+C e o endpoint passa a existir.
- Os **testes** de B semeiam `mesa_attendants` por insert direto (sem o CRUD de A em runtime),
  como manda o manifesto.

## 8. Camadas de regressão entregues (CLAUDE.md)

- **Camada 1 (structural, `test:unit`)**:
  - `src/lib/mesa/handoff.guard.test.ts` — a rota `transbordo/route.ts` chama
    `requireRole("admin")`; `handoff.ts` resolve a administradora pela proposta.
  - `src/lib/whatsapp/mesa/outbound.test.ts` — `buildDossierMessage` **não** contém CPF
    (assert sobre a string) e respeita a minimização (sem e-mail/docs).
- **Integration-db (`test:integration`)**:
  - `src/lib/mesa/handoff.integration.test.ts` — `createMesaHandoff` insere linha em
    `mesa_handoffs` com os FKs certos (assert de valor: lead, attendant, proposal,
    administradora resolvida, status, createdBy) + idempotência (2º POST → 409).
  - `src/lib/whatsapp/mesa/outbound.integration.test.ts` — `sendCaseToAttendant` chama
    `sendTextMessage` com o **número do atendente** (mock só a fronteira Meta API).
</content>

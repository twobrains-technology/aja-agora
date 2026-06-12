---
id: FIX-17
titulo: "Gate do nome ('como posso te chamar?') deve pedir o nome em CARD com input focado, não texto livre"
status: done
bloco: bloco-m-ux-funil
commit: cd159bc
executado_em: 2026-06-11
arquivos:
  - src/lib/chat/ui-message.ts (part data novo, ex: NameGatePartData)
  - src/components/chat/artifacts/name-prompt.tsx (componente novo: input + submit, autofocus)
  - src/components/chat/artifacts/name-prompt.test.tsx (Camada 1)
  - src/lib/web/adapter.ts (emissão do part no turno do nome)
  - src/lib/agent/orchestrator/detect-name-turn.ts (gancho de disparo determinístico)
  - src/lib/agent/system-prompt.ts (instrução: não repetir a pergunta em texto após o card)
  - src/lib/whatsapp/formatter.ts (WhatsApp degrada pra texto — sem card)
  - tests/regression/agent-trajectory.test.ts (Camada 2, cassette)
rodada: 2026-06-11 (teste manual do Kairo durante smoke do FIX-16)
anotado_em: 2026-06-11
---

# FIX-17 — Gate do nome em card com input focado

### O que o Kairo viu (palavras dele)

> "aqui no como posso te chamar acho que teriamos que pedir aqui ja o nome do
> cara em card, ja focado para facilitar a usabilidade. anota ai para depois que
> terminar a tarefa atual, conversarmos"

Screenshot: Rafael entra na conversa → "Boa, carro novo é sempre uma boa decisão!
/ Antes de eu te ajudar a achar a melhor opção, como posso te chamar?" — e o
usuário precisa digitar no input genérico do chat.

### Cenário exato / estado atual (investigado)

- A pergunta do nome é induzida pelo `SPECIALIST_BASE_PROMPT` ("REGRA DURA —
  captura de nome via save_contact_name OBRIGATORIA", `system-prompt.ts:64`).
- O usuário responde por **texto livre** no input do chat; a LLM extrai e chama
  `save_contact_name`. O orchestrator tem `detect-name-turn.ts` pra reconhecer o
  turno do nome.
- **É a ÚNICA coleta texto-livre do funil**: todos os outros passos têm UI
  dedicada (chips dos gates experience/timeframe/lance, sliders do
  plan-estimate, form do identify com CPF/celular, lead form). Inconsistência de
  UX — e no mobile (maioria do público, CLAUDE.md "Mobile-first") o teclado nem
  abre sozinho: o usuário precisa tocar no input do chat antes de digitar.

### Root cause

Não é bug — é lacuna de design herdada: a captura do nome nasceu conversacional
(Phase 3, antes do padrão de artifacts interativos dos gates). Os gates
estruturados vieram depois e o nome nunca foi migrado pro padrão.

### Correção proposta (rascunho pra conversa — NÃO implementar antes de alinhar)

| O quê | Onde |
|---|---|
| Part data `name` no stream do gate (mesmo padrão do `PlanGatePartData`) | `src/lib/chat/ui-message.ts` |
| Card com input de nome **autofocus** + botão (estilo identify/lead form), submit → mesma rota do texto (LLM chama `save_contact_name`) ou action direta de gate | `src/components/chat/artifacts/name-prompt.tsx` |
| Disparo determinístico do card no turno do nome (não depender da LLM "lembrar") | `detect-name-turn.ts` / `web/adapter.ts` |
| Agent não repete a pergunta em texto após o card (mesma regra do value_picker) | `system-prompt.ts` |
| WhatsApp segue 100% textual (card não existe lá) | `formatter.ts` — provavelmente zero mudança |

**Pontos pra conversa com o Kairo:**
1. Autofocus no input do card rouba o foco do input do chat — ok? (no mobile é
   exatamente o que ele quer: teclado já aberto no lugar certo)
2. O usuário ainda pode responder por texto livre no chat (os dois caminhos
   coexistem) ou o card vira o único caminho?
3. Vale aproveitar e padronizar o autofocus nos outros forms (identify/lead)?

### Regressão exigida (3 camadas, padrão do projeto)

- Camada 1: componente renderiza input autofocus + submit chama a action certa;
  prompt instrui a não repetir a pergunta.
- Camada 2: cassette — turno do nome emite o card e `save_contact_name` é
  chamada UMA vez com o valor do card.
- Camada 3: cenário de eval já cobre captura de nome (EVAL-SAVE-CONTACT-NAME-
  CIRURGICO) — estender pro card.

### Decisão (Kairo, registrada 2026-06-11)

Conversa alinhada e inlined no prompt de lançamento do workspace 3:

1. **Autofocus em TODOS os forms do funil** (não só o do nome). Padronizado:
   `name-prompt` (novo), `gate-identity-form` (CPF) e `contract-form` (CPF);
   `lead-form` já tinha. Mobile-first — o teclado abre no lugar certo. Roubar
   o foco do input do chat é o comportamento DESEJADO no mobile.
2. **Coexistência card/texto.** O card NÃO vira caminho único — o usuário pode
   digitar no card OU responder por texto livre no chat. Os dois convergem em
   `conversations.contactName` (card → route persiste direto; texto → o
   `save_contact_name` forçado via toolChoice, caminho intacto).

### O que mudou vs. o rascunho (paths reais)

- **Disparo determinístico**: em vez de mexer em `detect-name-turn.ts`, o gate
  virou um `Gate` de verdade (`"name"`) — `nextGate` retorna `"name"` enquanto
  o nome não foi capturado (antes era o no-op `"doubts-wait"`). O `runner` emite
  o gate; `gateQuestion("name")=null` evita duplicar a pergunta (que já sai no
  texto do directive de 1o contato).
- **WhatsApp degrada pra texto**: tratado em `whatsapp/adapter.ts`
  (`gateInteractive("name") → null`), não no `formatter.ts` — e o `runner` não
  seta `prefix` pro gate `name` pra não descartar o texto da pergunta no canal.
- **Submit do card**: handler `action.gate === "name"` em `route.ts` →
  `saveContactName` + `buildNameCapturedDirective` (saúda) → orchestrator dispara
  o gate de experience.
- `formatter.ts` (`contractFormToWhatsApp`) **não foi tocado** (bloco K paralelo).

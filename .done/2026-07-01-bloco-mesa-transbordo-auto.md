---
titulo: Transbordo automático da mesa — broadcast + claim (Vou atender)
data: 2026-07-01
status: testing
projeto: aja-agora · branch: feat/mesa-transbordo-auto
jornadas_afetadas: [jornada-canonica]
tags: [mesa, transbordo, whatsapp, kanban]
---
# Transbordo automático da mesa — broadcast + "Vou atender" + claim

## 1. Pitch
Quando a proposta do cliente chega na administradora, a mesa é acionada **sozinha**: o caso
é oferecido a **todos os atendentes** no WhatsApp e o **primeiro que toca em "Vou atender"
assume**. Acabou o gargalo do admin escolhendo atendente a dedo no kanban.

## 2. Problema que resolveu
A jornada canônica (Parte 2) manda o transbordo ser automático, por broadcast, com o
primeiro a clicar assumindo o caso. O código real fazia o oposto: transbordo 100% **manual**
(um botão no kanban), com o admin **escolhendo um único** atendente num dropdown, e o dossiê
indo em **texto plano** pra esse único número. Não havia estado "sem dono", nem competição,
nem o lead mudava de fase ao ser assumido. O caso ficava invisível pra mesa até alguém abrir
o kanban — e o roteamento dependia de um humano no meio.

## 3. Solução entregue
- **Transbordo automático (D14):** ao a proposta entrar em "Na administradora", o sistema
  cria o caso e dispara o broadcast — sem clique.
- **Broadcast a todos (D15):** o dossiê do caso vai pra **todos** os atendentes de mesa, cada
  um com um botão **"Vou atender"** no WhatsApp (não mais texto pra um só).
- **Primeiro que assume, leva (D16):** o clique reivindica o caso com **trava atômica** — um
  vencedor garantido mesmo se dois clicam ao mesmo tempo; os demais recebem "já foi assumido".
- **Muda de fase ao assumir (D17):** o lead entra numa raia nova **"Em atendimento"** no
  kanban, deixando claro que um humano já está tocando o caso.
- Reaproveita a mecânica que **já funcionava** no chat de vendas (`proxy.ts`), com o mesmo
  padrão de broadcast + claim — só que com a trava atômica que o chat ainda não tem.

## 4. Por que importa
Tira o admin do caminho crítico: a mesa reage no instante em que o caso fica pronto, e o
primeiro atendente livre pega. Menos espera, menos caso esquecido, zero roteamento manual —
exatamente o que a jornada canônica define como a experiência da mesa.

## 5. Arquitetura — visão de 1 minuto
- **Estado "sem dono":** `mesa_handoffs.mesa_attendant_id` virou nullable (migration 0029),
  espelhando `conversations.handedOffUserId` do chat de vendas.
- **Gatilho:** o worker de status (`proposal-status-poll`) chama `dispatchAutoTransbordo` ao
  aplicar a raia `na_administradora` (best-effort — falha não derruba o polling).
- **Broadcast:** `broadcastCaseToAttendants` itera `getMesaAttendantList` e manda
  `sendReplyButtons("Vou atender", id=mesa_claim:<handoffId>)` a cada atendente.
- **Claim atômico:** `claimMesaHandoff` faz `UPDATE ... WHERE mesa_attendant_id IS NULL` — o
  banco serializa a linha, 1 vencedor. O dispatch do clique entra pela precedência de mesa no
  caminho interativo do `processor` (nunca cai no funil de cliente).
- **Muda de fase:** o claim transiciona `na_administradora → em_atendimento` (forward-only),
  raia nova posicionada **depois** de `na_administradora` (migration 0030) pra não regredir.

## 6. Qualidade entregue
- **TDD strict** em todos os 4 itens (teste falha antes do fix, visto vermelho→verde).
- **3 camadas** onde cabe: structural (source), cassette (agent-trajectory FIX-124),
  integration com DB real (a **corrida** de 2 cliques → 1 vencedor; não-vazamento pro
  copiloto de quem não assumiu).
- **Gate:** `pnpm test:unit` = **209 arquivos / 2133 testes** verdes. Integração da mesa +
  worker + rota = **54** verdes. App compila e serve (HTTP 200).
- Migrations 0029/0030 geradas por `drizzle-kit` e aplicadas **no container** (nunca na mão).

## 7. Decisões registradas
`docs/correcoes/decisions/2026-07-01-bloco-mesa-transbordo-auto.md` — as 2 decisões de
produto (gatilho = só `na_administradora`; raia nova `em_atendimento` **após**
`na_administradora`) confirmadas pelo Kairo via seleção; inclui a reconciliação da tensão
forward-only que o card original teria quebrado.

## 8. Riscos e tratamento
- **Enum ADD VALUE:** a migration do enum roda BEFORE `aguardando_pagamento`; só adiciona o
  valor (não usa na mesma transação) → aplica limpo. Verificado no container.
- **Broadcast externo (WhatsApp):** best-effort por destinatário — falha de um envio não
  derruba os demais nem o registro do caso (fonte de verdade no DB).
- **Corrida de claim:** coberta por integration com `Promise.all` de 2 claims concorrentes.
- **Ciclo de import:** o contrato do botão vive em `claim.ts` (módulo sem deps) pra evitar
  ciclo `outbound ↔ routing`.

## 9. Gaps honestos
- O `proxy.ts` (chat de vendas) ainda tem o find-then-update **sem guard atômico** (TOCTOU
  latente) — deliberadamente fora do escopo deste bloco; a mesa nasceu com o guard correto.
- Kanban: adicionei label/cor da raia `em_atendimento`; não revisei drag-and-drop manual
  para/da nova coluna além do que o funil forward-only já garante.
- Sem E2E Playwright do fluxo WhatsApp real (broadcast→clique→claim) — coberto por integration
  determinística; E2E de canal externo fica pra validação com número real.

## 10. Próximos passos
- Integração na base é do **orquestrador** (merge-wave). Não abri PR nem fiz merge.
- Sugestão pós-merge: fechar o TOCTOU do `proxy.ts` com o mesmo guard atômico (paridade).

## 11. Métricas da sessão
- **13** arquivos de produção + **2** migrations; **10** commits (4 `test+feat`/`test+fix`
  por item + docs de decisão/moves).
- Ordem executada: FIX-125 (base "sem dono") → FIX-123 (gatilho) → FIX-124 (broadcast+claim)
  → FIX-126 (muda de fase).

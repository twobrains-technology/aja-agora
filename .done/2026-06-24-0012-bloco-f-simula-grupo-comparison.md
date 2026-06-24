# Bloco F — Simular o grupo escolhido da comparação (FIX-71)

**Data:** 2026-06-24 · **Branch:** `fix/simula-grupo-comparison` · **Commit:** `9334d21`

## O problema (na voz do operador)

> "lança a correção desse bug novo que você encontrou"

Bug achado no smoke ao vivo da jornada (2026-06-23), conduzido pelo Claude como o
cliente. É o **irmão do FIX-68**: o FIX-68 destravou a troca de **faixa de valor**;
este cobre o gesto que sobrou — **escolher um grupo específico** da comparação.

Cenário: depois do reveal, o usuário vê 3 grupos (~R$ 200 mil: Banco do Brasil /
Itaú / Rodobens) e escolhe **por texto** — "Gostei do Banco do Brasil, quero seguir
com ele". O agente respondia *"esse grupo deu um problema agora — mas tenho as
outras opções"* e **a simulação do grupo que o usuário escolheu nunca acontecia**.
Ponto positivo do estado anterior: o agente **degradava com elegância** (oferecia a
2ª opção), sem cair no loop de "instabilidade" — isso foi **preservado**.

## A causa

Cada grupo tem um identificador **real e opaco** (um hash da administradora, ex.
`6a0ca9ca…`) que a descoberta devolve e que o card carrega. Quando o usuário **clica**
no card, a plataforma já manda esse identificador verdadeiro — caminho robusto. Mas
quando o usuário **escolhe por texto**, o agente precisa lembrar esse hash de turnos
atrás e, em vez de copiá-lo, **fabricava** um código no formato
`banco-categoria-valor-prazo` — `bb-auto-200k-72m`. Esse código não existe na
descoberta, a plataforma recusa, e a simulação do grupo escolhido morre. É o mesmo
padrão do FIX-68 (o modelo inventa um id), só que no caminho da **seleção**.

## A correção

Três reforços, mantendo a degradação graciosa (nunca travar o usuário):

- **O agente é instruído a copiar o identificador literal** do grupo escolhido — que
  já está no histórico — e **proibido de fabricar** o formato
  `banco-categoria-valor-prazo`. A regra cita o contra-exemplo real `bb-auto-200k-72m`
  (espelha o FIX-68, que cita `auto-130k-60m`).
- **Os cards passam a descrever explicitamente** que o `id` é o hash opaco vindo da
  busca e que **não pode ser derivado** de banco/valor/prazo.
- **A plataforma detecta o código fabricado no servidor** e, em vez de gastar uma ida
  à administradora e o erro virar "instabilidade" genérica, devolve uma **orientação
  acionável** ("use o id real do grupo escolhido ou refaça a busca"). Zero risco de
  simular o grupo errado — apenas detecta e orienta, nunca adivinha.

**Decisão consciente:** não foi adicionada resolução "por aproximação" no servidor
(adivinhar o grupo a partir do código fabricado). Em fintech, **simular o grupo
errado é pior que degradar**. O caminho do clique já resolve com o id verdadeiro; o
caminho do texto fica coberto por instrução + schema + detector + degradação.

## Qualidade entregue (anti-regressão de 3 camadas — padrão do projeto)

- **Camada 1 (estrutural):** `system-prompt.fix-71.test.ts` (a regra existe e cita o
  contra-exemplo) + `ai-sdk.fix-71.test.ts` (os cards exigem o id literal e o detector
  `looksLikeFabricatedGroupId` reconhece o slug fabricado sem confundir com o hash real).
- **Camada 2 (cassette determinístico):** `agent-trajectory.test.ts` — reproduz
  "escolhe grupo da comparação → `simulate_quota` com `bb-auto-200k-72m`" como
  assinatura do bug, e prova a trajetória correta (simula com o id literal de um grupo
  que ele acabou de apresentar). Cobre também o acoplamento prompt + detector.
- **Camada 3 (eval IA real):** nightly cobre — sem cassette manual exigido.
- **Suíte inteira:** **1903 testes verdes, zero regressão**. O positivo da degradação
  graciosa continua válido (o bug original da Maria segue verde).

TDD strict: os testes foram escritos primeiro, **vistos falhar** com a assinatura
exata (`bb-auto-200k-72m` / exports ausentes) e só então o código foi corrigido — 1
commit `test+fix:`.

## Arquivos tocados

| Arquivo | Papel |
|---|---|
| `system-prompt.ts` | Regra dura: usar id literal do grupo escolhido, nunca fabricar slug |
| `tools/ai-sdk.ts` | `describe` do `id` reforçado + `looksLikeFabricatedGroupId` + curto-circuito server-side em `executeSimulateQuota`; schemas exportados |
| `system-prompt.fix-71.test.ts` | Camada 1 (prompt) |
| `tools/ai-sdk.fix-71.test.ts` | Camada 1 (schema + detector) |
| `agent-trajectory.test.ts` | Camada 2 (cassette) |

## Gaps honestos

- **Caminho de clique já era robusto** — o bug e o fix valem para a seleção **por
  texto**. Na prática a maioria dos usuários clica; o texto é a borda que faltava
  fechar. Confirmado lendo `comparison-table.tsx` (`select-group` → id real) e
  `buildGroupSelectedDirective` (injeta o id literal).
- **Sem passada E2E no browser real** nesta sessão autônoma: o ambiente isolado subiu
  só o Postgres migrado pra rodar a suíte (a app não foi levantada — regra do bloco:
  sem deploy/restart). O comportamento está coberto pelas 3 camadas determinísticas.
- O detector server-side é **conservador de propósito** (só o padrão `…-NNNk-NNm`).
  Se um dia a LLM inventar um formato diferente de id, o detector não pega — mas aí cai
  no caminho antigo (a administradora recusa e o agente degrada/re-busca), nunca um
  grupo errado.

# Transbordo pra mesa de operação: validado ponta-a-ponta e DESTRAVADO

> QA noturno autônomo · 2026-06-22 · branch `qa-base/2026-06-22-transbordo-mesa-whatsapp` (fork de develop)
> Pedido do Kairo: *"todo o fluxo validado de ponta a ponta, principalmente a coerência do transbordo
> para a mesa administradora via kanban e isso sendo recebido pelo WhatsApp e no WhatsApp orientar o operador."*

## O que estava em jogo

A "mesa de operação" é o time humano que assume um caso (transbordo a partir do kanban) e formaliza o
contrato na administradora, orientado por um **copiloto** que conhece o manual (PDF) de cada administradora,
pelo WhatsApp. O fluxo tinha sido construído em 3 blocos (cadastros, copiloto, transbordo) e mergeado na
develop — mas **ninguém tinha validado a costura ponta-a-ponta**, nem que o operador de fato consegue
disparar o transbordo pela tela.

## O que entregamos

**A coerência ponta-a-ponta está provada — e um bug que deixava a feature inutilizável foi corrigido.**

### 🔴→🟢 Bug crítico destravado: o transbordo via kanban não funcionava

Dirigindo o navegador de verdade, descobrimos que **o admin nunca conseguia transbordar pelo kanban**: o
seletor de atendente vinha sempre vazio ("Nenhum atendente de mesa ativo cadastrado"), mesmo com atendentes
ativos. Causa: a tela lia a chave errada da resposta da API (`attendants` em vez de `mesaAttendants`). Um
detalhe de contrato entre dois blocos que os testes isolados não pegavam — e que tornava a feature de venda
**inoperante na prática**. Corrigido, com teste de regressão em dois níveis (componente + jornada no
navegador). Validado ao vivo: caso transbordado, atendente escolhido, registro criado.

### ✅ Coerência ponta-a-ponta validada

- **Via kanban → mesa:** clicar "Transbordar" no card → escolher atendente → o caso vira um handoff com a
  **administradora certa resolvida pela cota do cliente** (não vaza para outra administradora).
- **Recebido no WhatsApp:** o dossiê do caso (cliente, cota, administradora, link) é enviado ao WhatsApp do
  **atendente escolhido** — nunca ao cliente — e **sem expor CPF** (minimização de PII).
- **Copiloto orienta o operador:** quando o atendente responde no WhatsApp, o copiloto orienta usando o
  **manual da administradora daquele caso** — e provamos que, com duas administradoras cadastradas, ele
  **nunca usa o manual da outra** (anti-vazamento).

### 🔒 Robustez: remover atendente que já trabalhou um caso

Remover um atendente com histórico de casos dava erro 500. Agora bloqueia com mensagem clara ("desative em
vez de remover") e **preserva o histórico** — auditoria intacta.

## Qualidade entregue

- **9 cenários** cobertos por testes de integração contra banco real + **jornada E2E no navegador**
  (re-rodável) + teste de componente. Suíte da mesa: 51 testes verdes.
- **3 bugs corrigidos** com teste primeiro (TDD): transbordo via kanban quebrado, DELETE com 500, colisão de
  teste no banco compartilhado.
- Ambiente de dev reparado na fonte (apontava para um workspace morto — travava testes e commits).

## Honestidade sobre o que falta

- **Promoção para a develop é decisão do Kairo** — a rodada vive numa branch própria (`qa-base/...`), pronta
  para revisão. Não promovi (blast radius).
- **1 teste fora do escopo falha** (`letta-adapter`, busca semântica): a memória Letta compartilhada está
  com timeout no archival hoje — ambiental, não tocado por este trabalho.
- **Dívidas anotadas** (blocos próprios): isolamento de teste por schema efêmero (sistêmico), 5 erros de
  typecheck pré-existentes, e investigar a lentidão do archival do Letta.

## Onde olhar

- Ledger: `.qa-loop/2026-06-22-0000-ledger.md` · Diário de decisões: `.away/2026-06-22-0000-qa-noturno-transbordo-mesa-whatsapp.md`
- Fix do kanban: `src/components/admin/pipeline/mesa-transbordo-dialog.tsx` (+ `.test.tsx`)
- Coerência E2E: `src/app/api/admin/leads/[id]/transbordo/route.integration.test.ts`
- Jornada no navegador: `tests/e2e/specs/admin-mesa-transbordo/golden-path.spec.ts`

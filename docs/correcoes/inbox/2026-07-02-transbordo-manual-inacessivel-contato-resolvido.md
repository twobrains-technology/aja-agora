---
data: 2026-07-02
origem: QA dono-de-produto (Parte 2 — Mesa de operação, PRODUÇÃO)
severidade: media
status: resolvido (2026-07-02 — aba "Atendimento" no ContactDetailPanel)
area: admin/pipeline (kanban) — transbordo mesa
verificado_contra: origin/main (deployado); worktree estava 517 commits atrás
---

# Botão "Transbordar para a mesa" inacessível para leads com contato resolvido

## Palavras do cenário (como reproduzir)

1. `/admin/pipeline` (prod), clicar em QUALQUER lead que já tem contato resolvido (nome/telefone/CPF)
   — na prática, todo lead que chegou perto do fechamento. Ex.: lead de teste **Mirella** (`d77dc604-…`).
2. Abre o painel de detalhe do lead.

## Esperado × Atual

- **Esperado (visão `mesa-de-operacao.md` §4 / M6 do roteiro):** o card do lead expõe a ação
  **"Transbordar para a mesa"** (fallback manual do transbordo).
- **Atual:** o painel aberto é a **visão consolidada do contato** (`ContactDetailPanel`, abas
  Timeline/Propostas/Funil) que **NÃO tem** nenhuma ação de transbordo. O botão só existe no
  `LeadDetailPanel`.

## Causa-raiz (verificada em `origin/main`)

`src/components/admin/pipeline/kanban-board.tsx` (main, ~linha 140):

```tsx
{selectedLead?.contactId ? (
  <ContactDetailPanel .../>   // consolidada (FIX-45) — SEM botão de transbordo
) : (
  <LeadDetailPanel .../>      // ÚNICO com "Transbordar para a mesa" (lead-detail-panel.tsx:143)
)}
```

O `LeadDetailPanel` (que contém o botão + `MesaTransbordoDialog`) só é renderizado para leads
**sem `contactId`** (anônimos). Como todo lead que chega ao ponto de transbordo tem contato
resolvido, o botão manual fica **inalcançável** — o `ContactDetailPanel` (introduzido pelo FIX-45,
visão consolidada) não portou a ação de transbordo.

## Evidência

- Live em prod: clicar no lead Mirella (contactId presente) abriu o `ContactDetailPanel`; varredura
  do DOM do dialog → nenhum botão casando `/transbord|mesa|atende/i`.
- `git grep "Transbordar" origin/main -- 'src/**/*.tsx'` → só `lead-detail-panel.tsx` e `mesa-transbordo-dialog.tsx`.
- `ContactDetailPanel` em main → zero ocorrências de `Transbordar|MesaTransbordo|Headset`.

## Severidade: MÉDIA (não P0)

O transbordo **primário** em prod é **AUTOMÁTICO** (FIX-123: worker `proposal-status-poll` → `dispatchAutoTransbordo`
ao entrar em `na_administradora`), então a mesa não fica 100% sem gatilho. Mas o **fallback manual**
documentado está morto para os leads que realmente importam — e não há como o admin forçar o
transbordo de um caso que ainda não chegou (ou não vai chegar por poll) a `na_administradora`.

## Onde provavelmente mexe

Portar a ação "Transbordar para a mesa" (+ `MesaTransbordoDialog`) para dentro do
`ContactDetailPanel`, OU renderizar o botão no kanban independentemente de qual painel abre.
Confirmar com o Kairo se o fallback manual ainda é desejado dado o auto-transbordo.

## Regressão (CLAUDE.md — não-agêntico puro, Camada 1 basta)

Teste estrutural: montar `ContactDetailPanel` de um lead com contactId e afirmar que expõe a ação
de transbordo (ou que o kanban a renderiza). Sem cassette (não é comportamento de LLM).

## Resolução (2026-07-02)

Portadas as ações do `LeadDetailPanel` pro `ContactDetailPanel` numa aba **"Atendimento"** —
**Transbordar para a mesa** (`MesaTransbordoDialog`) + **Chat com o cliente** (a mesma caixa do
FIX-87, que sofria do MESMO sombreamento). O `kanban-board.tsx` passa `leadId`/`leadName`/
`conversationId` do card selecionado. Regressão Camada 1 em
`src/components/admin/pipeline/contact-detail-panel.atendimento.test.tsx` (5 testes: aba existe,
botão de transbordo, caixa de chat, POST na conversa certa, wiring do kanban) + assert de source
que o board fia os ids. Resolve também o "não achei a mensagem via Kanban" (era o mesmo bug).

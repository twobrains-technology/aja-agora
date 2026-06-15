---
id: FIX-50
titulo: "Card do contato não destaca proposta vigente nem conversa ativa — vários itens iguais, sem 'onde ele está agora'"
status: todo
bloco: bloco-a-polir-funil-retorno
arquivos:
  - src/components/admin/pipeline/contact-detail-panel.tsx
  - src/lib/admin/contact-detail.ts
rodada: 2026-06-15 — sessão de levantamento (PO crítico) Kairo+Claude sobre funil/retorno
---

# FIX-50 — Visão do contato mostra tudo, mas não diz o presente

## Palavras do operador

> "como foi pensado a UI do funil para quando tem várias iterações do mesmo
> usuário" · "o que podemos melhorar para ficar mais refinado? pense como um PO
> crítico dono do produto." — Kairo, 2026-06-15

## Cenário exato

Cliente que itera (várias simulações, 2+ propostas, conversas em web e
WhatsApp) colapsa em **um card** no kanban (`dedupLeadsByContact`), e o
`ContactDetailPanel` abre a visão consolidada (FIX-45). As 3 abas (Timeline,
Propostas, Funil) listam **tudo cronologicamente** — mas sem hierarquia:

- **Propostas** (`contact-detail-panel.tsx:166-188`): se há proposta perdida +
  ativa + aceita, as 3 aparecem iguais; **nada marca qual está vigente**. O
  comercial tem que inferir pelo status.
- **Timeline** (`:148-163`): mensagens de conversa encerrada e conversa ativa
  vêm misturadas; **nenhum sinal de qual conversa ainda está rodando**.

## Root cause — observado no código

- `src/lib/admin/contact-detail.ts:70-74` — `proposals: contact.beviProposals`
  retorna o array cru, **sem derivar qual é a vigente** (nem ordenação explícita
  por recência/status).
- `src/lib/admin/contact-detail.ts:40-52` — `timeline` faz `flatMap` de todas
  as conversas **sem anexar o status da conversa** (ativa/encerrada/handed_off).
- `src/components/admin/pipeline/contact-detail-panel.tsx` — renderiza as listas
  sem destaque de "vigente"/"ativa".

## Correção proposta

| O quê | Onde |
|---|---|
| Derivar a **proposta vigente** (regra: status mais avançado não-terminal, desempate por recência) e marcá-la no payload | `src/lib/admin/contact-detail.ts` |
| Destacar a proposta vigente no topo (badge "Atual"); colapsar/secundarizar as superadas | `src/components/admin/pipeline/contact-detail-panel.tsx` |
| Anexar `conversationStatus` a cada bloco da timeline; sinalizar a conversa **ativa** (selo "Em andamento") | `src/lib/admin/contact-detail.ts`, `contact-detail-panel.tsx` |
| (Opcional, decidir na execução) Cabeçalho com "resumo do agora": raia atual + proposta vigente + última interação em 1 linha | `contact-detail-panel.tsx` |

> Princípio de produto: a visão consolidada acertou em **preservar** o histórico
> (não esconder nada). O que falta é **hierarquizar o presente** — o time precisa
> de uma resposta única: "onde esse cliente está agora e qual proposta importa".

## Regressão exigida

UI React + agregação não-agêntica → **sem cassette**. Cobertura:

- **Unit/integration (`contact-detail.ts`):** dado um contato com N propostas
  (perdida/ativa/aceita) → assert que a derivação de "vigente" escolhe a certa;
  dado conversas com status distintos → assert flag de "ativa" correta.
- **Component test (`contact-detail-panel`):** renderiza badge "Atual" só na
  vigente; selo "Em andamento" só na conversa ativa.
- **Camada 1 (structural):** assert que o payload de `getContactDetail` expõe
  `currentProposalId`/`activeConversationId` (ou equivalente).

Ver falhar primeiro (nenhuma proposta marcada como vigente), depois corrigir.

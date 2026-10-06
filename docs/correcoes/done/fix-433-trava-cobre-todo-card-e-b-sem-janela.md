---
id: FIX-433
titulo: "A trava cobre todo card que revela número e o braço B não fica legível"
status: done
bloco: trava-total-e-b-sem-janela
commit: 7577c489
arquivos:
  - src/lib/chat/desbloqueio-do-telefone.ts
  - src/lib/chat/types.ts
  - src/lib/web/adapter.ts
  - src/lib/web/adapter.desbloqueio-b.integration.test.ts
  - src/components/chat/chat-message.tsx
  - src/components/chat/chat-message.desbloqueio-telefone.test.ts
  - src/components/chat/artifacts/telefone-do-desbloqueio.variante-b.test.tsx
rodada: 2026-10-02
executado_em: 2026-10-02
---
## Palavras do operador
> "Esse é o B só tem que reduzir esse tempo." (Bruna, 11:44:38)
> "mostra a borrada e só desbloqueia quando der o telefone." (Bruna, 11:39:05)

## O que estava no ar (medido no código)
- A lista de travas estava **duplicada** e cada cópia era incompleta: a do servidor (`adapter.ts`,
  `REVEAL_TYPES`) e a do cliente (`chat-message.tsx`, `REVELAM_OFERTA`) só cobriam parte dos tipos —
  `simulation_result` e `group_card` **passavam legíveis** antes do telefone nos dois braços.
- No braço **B**, o card do telefone só saía **no fim do turno** (`adapter.ts:653-672`); até lá os cards de
  oferta ficavam **legíveis** — a "janela legível" que anulava o borrão. No A o card saía junto do primeiro
  card de oferta; no B, não.

## O que mudou
1. **Lista única** `CARDS_QUE_REVELAM_OFERTA` exportada de `src/lib/chat/desbloqueio-do-telefone.ts`, com os
   **6** tipos: `comparison_table`, `recommendation_card`, `simulation_result`, `group_card`,
   `financing_comparison`, `scenarios`. Servidor (`adapter.ts`) e cliente (`chat-message.tsx`) passam a ler a
   MESMA fonte; as duas cópias locais foram removidas.
2. **B sem janela legível (D3):** o card do telefone sai **antes do primeiro card de oferta**, nos dois
   braços. No A o reveal é retido; no B o cliente embaça. O fecho de turno que emitia o card em `borrado`
   (agora inalcançável) saiu, junto com `viuReveal`, `melhorOpcao`, `MelhorOpcaoDoDesbloqueio` e
   `melhorOpcaoDoCard` (órfãos, conferidos por `grep`). O campo legado `melhorOpcao` em `types.ts` ganhou
   comentário de LEGADO.

## Provado
- Teste novo `adapter.desbloqueio-b.integration.test.ts` (writer falso + banco real): B sem lead ⇒ o card do
  telefone **antes** do primeiro card de oferta; A sem lead ⇒ `simulation_result`/`group_card` retidos; os
  **6** tipos obedecem; com telefone no lead ⇒ todos livres e sem card de telefone.
- `chat-message.desbloqueio-telefone.test.ts` (novo `describe` FIX-433): braço A tira os 6 do render, braço B
  marca os 6 como `embacada`.
- `pnpm -s vitest run src/lib/web src/components/chat src/lib/chat/desbloqueio-do-telefone` → **86 arquivos /
  449 testes verdes** (na conferência do gerente: 90 arquivos / **517 testes verdes**); `typecheck` exit 0.
- TDD: com o adapter no estado da base, 5 testes do bloco falharam antes do fix.
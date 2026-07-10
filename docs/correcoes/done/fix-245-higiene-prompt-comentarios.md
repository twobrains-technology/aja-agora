---
id: FIX-245
titulo: "Higiene: contradição tripla de emoji no prompt + comentário FIX-C4 stale + exemplo genérico"
status: done
bloco: bloco-r2-valor-compliance
arquivos:
  - src/lib/agent/system-prompt.ts
  - src/lib/consorcio/contemplation-dial.ts
  - src/lib/agent/orchestrator/gate-questions.ts
  - src/lib/web/adapter.ts
  - src/lib/whatsapp/adapter.ts
  - src/lib/agent/gate-reengage.ts
  - src/app/api/chat/route.ts
rodada: 2026-07-10 rodada 2 (Fable r1, gap P3 #10)
commit: 44750f8
executado_em: "2026-07-10"
nota: >
  Escopo estendido além dos 2 arquivos declarados no card (system-prompt.ts +
  contemplation-dial.ts) — o item 3 (exemplo genérico) exigiu parametrizar
  gateQuestion/lanceEmbutidoEdu e repassar creditValue em 6 call sites (web/whatsapp
  adapter, gate-reengage, route.ts) pra fechar o ciclo captura→uso real.
---

## Gap (veredito Fable §D4.e + gap #10)
1. Contradição TRIPLA de emoji no `system-prompt.ts`: `:21` "NUNCA use emoji,
   nenhum" × `:126`/`:1166` "Emoji com PARCIMÔNIA... não é proibição total" (com
   ratios DIVERGENTES: 1 a cada 3-4 vs 1 a cada 2-3).
2. Comentário `contemplation-dial.ts:70-73` (FIX-C4) dizia "só dinheiro abate" mas
   o código AMORTIZA tudo (FIX-221) — stale, enganoso.
3. Educação de embutido usa exemplo genérico "numa carta de R$ 100 mil" quando a
   carta do cliente está na tela (ex. 92.902/150.000) — consultor usaria o número real.

## Correção
1. **Emoji — fonte única (decisão vigente, per card): parcimônia, 1 a cada 3-4
   balões.** `system-prompt.ts:21` (proibição total) reescrito pra parcimônia,
   igual à regra do FIX-234 (`:126`). `:1166` (concierge, "1 a cada 2-3 mensagens")
   alinhado pro mesmo ratio (3-4). `:1059` (regra estreita "nunca ao lado do
   nome/assinatura") preservada — não conflita com parcimônia.
2. **Comentário FIX-C4 atualizado** pra refletir o FIX-221 (AMORTIZA): o lance
   TOTAL (dinheiro + embutido) abate o saldo, não só o dinheiro.
3. **`lanceEmbutidoEdu(creditValue?)`** (nova função, substitui a const
   `LANCE_EMBUTIDO_EDU` — mantida como `@deprecated` fallback genérico pra
   compat): usa a carta REAL do cliente (`meta.recommendedOffer.creditValue`,
   disponível desde que o gate `lance-embutido` roda PÓS-reveal, FIX-215) quando
   presente; cai no exemplo genérico "R$ 100 mil" honestamente quando ausente
   (D11: nunca fabrica). `gateQuestion` ganhou o 3º parâmetro `creditValue?` e
   repassa pros 6 call sites: `web/adapter.ts` (×2), `whatsapp/adapter.ts`
   (`gateTextPrompt` + `gateContextBeat`, que precisou de `conversationId` novo),
   `gate-reengage.ts` (`reengageQuestionForGate`), `route.ts` (rede final de
   turno mudo).

## Regressão (grep + TDD)
- `system-prompt.fix-245.test.ts`: nenhuma linha proíbe emoji totalmente
  (marcador "em hipótese alguma" — discrimina da regra estreita legítima "nunca
  ao lado do nome"); todo ratio "1 a cada N" no prompt usa o MESMO N.
- `contemplation-dial.test.ts` (bloco FIX-245): comentário NÃO diz mais "só o
  lance em dinheiro abate" (regex tolerante a quebra de linha JSDoc); documenta
  FIX-221 + "dinheiro + embutido"/"total".
- `gate-questions.fix-245.test.ts`: `lanceEmbutidoEdu(92_902)` usa o número real
  e NÃO menciona "100 mil"; sem valor (ou valor inválido: 0/negativo/NaN) cai no
  fallback genérico; resto da explicação preservado; `gateQuestion` repassa
  corretamente com e sem `creditValue`.

## Achados extras corrigidos de quebra (consequência direta e esperada do fix)
- `no-emoji-fix212.test.ts` (teste #4): cobrava a regra DURA original do FIX-212
  ("nunca use emoji"), já SUPERADA pelo FIX-234 (parcimônia) — o próprio contexto
  do item 1 acima. Testava uma regra que o produto já não seguia mais (a
  contradição do veredito). Atualizado pra exigir a regra VIGENTE (parcimônia +
  ratio único "3-4"), preservando as 3 varreduras de emoji literal em copy fixa
  (essas continuam válidas e intocadas).
- `tests/regression/agent-trajectory.test.ts`: cassette estrutural checava o
  nome literal da const `LANCE_EMBUTIDO_EDU` no `whatsapp/adapter.ts` —
  atualizado pro novo nome `lanceEmbutidoEdu` (mesmo mecanismo de beat de
  contexto, agora parametrizado com a carta real).

## Verificação de ambiente (não é bug do produto)
Rodei `pnpm test:integration` (mudança tocou `route.ts`/`whatsapp/adapter.ts`) com
`IDENTITY_ENC_KEY` exportado no shell (achado já registrado no FIX-244 done/) — 61
suites, 268 testes, 5 skips esperados, tudo verde.

---
id: FIX-277
titulo: "Agente afirma falsa exatidão do valor da carta pós-reveal (hero com aviso invertido + fala sem invariante)"
status: done
severidade: alta
projeto: aja-agora
bloco: bloco-r9-compliance-copy
arquivos:
  - src/components/chat/artifacts/recommendation-card.tsx
  - src/lib/agent/system-prompt.ts
  - src/lib/chat/types.ts
  - src/components/chat/artifacts/credit-adjustment-notice.fix-197.test.tsx
  - src/lib/agent/system-prompt.fix-277-falsa-exatidao.test.ts
rodada: "2026-07-12 loop r9 onda 1 (baseline Sonnet 3/10)"
commit: PENDING
executado_em: "2026-07-12"
---
## Palavras do juiz (veredito r9, Sonnet 5 — G1, UI/Compliance 3/10)
> "o agente afirma falsamente que a carta bate 'exatamente'/'o mesmo'/'sem ajuste nenhum' com
> o valor pedido em 4 dos 5 cenários, quando o `creditValue` real diverge do `rawCreditValue`
> pedido em 1,5%–6,7% — isso é o núcleo da sonda I2, e reproduz pior do que a hipótese
> original."
>
> Turno 8 (probe-i2): *"Sim, Rafael — é exatamente R$ 120.000,00, o mesmo valor que você
> pediu, **sem ajuste nenhum**."* — real: `creditValue: 124.599`.

## Cenário exato
- **Rota/tela:** chat web, turno de confirmação pós-reveal (usuário pergunta se a carta bate
  com o que pediu).
- **Dados (probe-i2-justificativa):** pedido R$ 120.000 (`rawCreditValue`), carta real
  R$ 124.599 (`creditValue`) — diverge 3,8%.
- **Mesmo padrão em mais 3/5 dossiês:** mario-sem-lance (70.000→71.043, +1,5%,
  *"o valor já é esse mesmo"*), probe-i1 (80.000→81.973, +2,5%, *"mantendo os R$ 80.000,00
  mesmo"*), probe-i3 (150.000→160.000, +6,7%, *"exatamente o valor que já usei"*).

## Esperado × Atual
- **Esperado:** ao ser perguntado se a carta bate com o pedido, o agente reconhece a
  divergência real quando ela existir — aviso honesto de ajuste (CDC art. 30/37).
- **Atual:** afirma exatidão falsa em 4 de 5 dossiês, mesmo com `creditValue` real diferente
  de `rawCreditValue`.

## Root cause (INVESTIGADO — provado no código)
Duas causas compostas:

1. **Copy do card hero invertida.** `recommendation-payload.ts:130-168`
   (`coerceRecommendationPayload`) confirma a semântica: `rawCreditValue` é o valor **PEDIDO**
   (`requestedCreditValue`, o `creditMax`/`creditClampedFrom` do usuário — linha 134-138 e
   159-166); `creditValue` é a **carta REAL** do grupo (`group.creditValue`, coagida
   server-side, linha 114). Só que `recommendation-card.tsx:264-274` (aviso
   `credit-adjustment-notice`, do FIX-197) renderiza:
   > "Ajustamos essa carta de `{rawCreditValue}` pra sua faixa de ~`{creditValue}`."

   Isso chama o valor **pedido** de "essa carta" e trata a carta **real** como "sua faixa"
   ajustada — semanticamente invertido: dá a entender que existia uma carta com o valor do
   pedido que foi "ajustada" para uma faixa, quando na verdade o pedido nunca foi uma carta —
   a carta sempre foi `creditValue`. O padrão CORRETO já existe e foi corrigido no
   **fechamento** (mesma classe de bug): `real-offer.tsx:100-102` e `formatter.ts:1027-1032`
   dizem *"Você pediu uma carta de ~`{rawCreditValue}` — a carta real ficou em
   `{creditValue}`."* — o comentário em `real-offer.tsx:84-88` confirma explicitamente que a
   copy antiga (a MESMA que ainda está viva no hero) "estava semanticamente INVERTIDA —
   corrigido pra 'pedido × carta real'" (FIX-197/240/247), mas essa correção nunca chegou ao
   hero (achado também confirmado pelo crítico estático r9,
   `.processo/loop/2026-07-09-agente-vendas-consorcio.md:179`).

2. **Fala do agente sem invariante.** A confirmação em texto livre ("bate?", "é exato?") não
   tem NENHUMA regra em `system-prompt.ts` que force comparar `rawCreditValue` × `creditValue`
   antes de responder. As únicas regras de valor existentes (system-prompt.ts:585-596 "nunca
   arredonde", :566-568 "taxa sem fonte") cobrem parcela/taxa, não a pergunta "a carta bate com
   o que eu pedi". Sem invariante — e vendo um card cuja própria copy já está invertida (item
   1) — o LLM reforça a falsa exatidão.

## Correção proposta (o quê × onde)
| O quê | Onde |
|---|---|
| Corrigir a copy do aviso do hero pra paridade com o padrão já correto do fechamento ("Você pediu ~X — a carta real ficou em Y") | `recommendation-card.tsx:264-274` |
| Adicionar REGRA DURA no `system-prompt.ts`: ao ser perguntado se o valor/a carta "bate"/é "exata"/"sem ajuste", comparar `rawCreditValue` × `creditValue` (quando ambos existirem) e nunca afirmar exatidão se divergirem — reconhecer o ajuste com uma frase honesta (mesmo padrão do `real_offer`) | `system-prompt.ts` (nova seção, perto de "Valores monetários — NUNCA arredonde") |
| Avaliar (fora do escopo mínimo, decisão do executor) expor `rawCreditValue`/`creditValue` no contexto textual do turno de confirmação, não só no payload do card, reduzindo dependência de o LLM "lembrar" do card anterior | `system-prompt.ts` / `runner.ts` |

## Regressão exigida
- **Componente:** dado `rawCreditValue=120000` e `creditValue=124599`, o texto renderizado
  deve dizer o equivalente a "Você pediu ~R$ 120.000 — a carta real ficou em R$ 124.599",
  NUNCA "ajustamos essa carta de 120.000 pra sua faixa de 124.599". O teste existente
  `credit-adjustment-notice.fix-197.test.ts` só checa PRESENÇA do aviso — adicionar/reforçar
  assertion de DIREÇÃO (falha com a copy atual, passa com a corrigida).
- **Camada 2/3 (cassette ou eval dirigida):** turno perguntando diretamente "o valor bate com
  o que eu pedi?" quando `rawCreditValue ≠ creditValue` — resposta deve mencionar o ajuste,
  nunca "sem ajuste nenhum"/"exatamente"/"o mesmo".

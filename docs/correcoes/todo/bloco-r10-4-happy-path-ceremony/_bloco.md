---
bloco: bloco-r10-4-happy-path-ceremony
branch: fix/r10-4-happy-path-ceremony
workspace: fix-r10-4-happy-path-ceremony
onda: 4
depends_on: [bloco-r10-1-funil-reveal, bloco-r10-2-bakeoff-regua, bloco-r10-3-timeframe-stuck]
paralelo_com: [bloco-r10-4-credit-deadlock, bloco-r10-4-reco-consent-hero, bloco-r10-4-topic-picker-serverside]
itens: [FIX-311]
escopo_arquivos:
  - src/app/api/chat/route.ts
conflitos_esperados: "nenhum — único bloco da onda 4 tocando route.ts, sem sobreposição com os outros 3."
---
# Bloco r10-4 — happy-path-ceremony (FIX-311)

Onda 4 — 1 dos 7 fixes da investigação de causa-raiz da Etapa A. `scarcity` e `decision_prompt`
nunca aparecem em nenhum dos dois dossiês limpos (Madalena, Mario) — o funil pula direto pro fecho
sempre que o usuário demonstra interesse claro (ramo feliz), e a cerimônia completa hoje só existe
no ramo de recusa/ambiguidade do simulador — o inverso do que o produto quer (quem aceita de cara
merece a mesma cerimônia de segurança/urgência de quem hesitou, não menos).

## Decisão já resolvida (não re-perguntar)
A abordagem já foi decidida via investigação de causa-raiz direta desta sessão: extrair a
cerimônia `scarcity`→`decision_prompt` (hoje só implementada no ramo de recusa,
`route.ts:1147-1189`) pra um passo comum do funil, e fazer os dois fast-paths do ramo feliz
(`508-522` ação `interest`, `1125-1145` aceite do simulador) passarem por ela antes do fecho. Não
re-discuta o "se" — só a forma exata da extração (função helper vs. função dedicada), se houver
ambiguidade real.

## Referências obrigatórias
- `.processo/loop/2026-07-09-agente-vendas-consorcio.md` (seção Rodada 10 → investigação de
  causa-raiz → família happy-path/cerimônia).
- `.processo/loop/evidencias-r10/dossies/madalena-junta-v2/dossie.json` e
  `mario-sem-lance-v2/dossie.json` (grep por `scarcity`/`decision_prompt` = zero em ambos).
- `docs/correcoes/todo/bloco-r10-4-happy-path-ceremony/fix-311-*.md` (root cause file:line
  completo, incluindo a região `route.ts:1147-1189` que JÁ implementa a cerimônia corretamente —
  use como referência de comportamento esperado, não reescreva do zero).

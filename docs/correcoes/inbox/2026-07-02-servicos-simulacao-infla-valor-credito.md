---
slug: servicos-simulacao-infla-valor-credito
titulo: "Alinhar valor do crédito entre simulação (nominal do grupo) e card/carta/PDF (valor pedido) — hoje mostra 3 números conflitantes"
status: inbox
severidade: alta
projeto: aja-agora
rodada: 2026-07-02 — QA dono-de-produto, jornada SERVIÇOS (viagem R$ 25 mil), canal WEB, produção (ajaagora.com.br), conta CONTA2 (Mirella)
evidencia:
  - _evidencia/servicos-proposta-conexia.pdf       # PDF oficial: Valor do crédito R$ 25.000,00 / parcela R$ 385,30
  - _evidencia/servicos-recomendacao-simulacao.png # tela: card R$ 385,30 vs simulação R$ 554,83 / R$ 36.000
  - _evidencia/servicos-carta-real-conflito.png    # carta "confirmada" R$ 25.000 / R$ 385,30
mexe_em:
  - src/lib/agent/tools/ai-sdk.ts        # simulate_quota: usa creditValue NOMINAL do grupo (Bv2-08), gera R$ 36.000 / R$ 554,83
  - src/lib/agent/system-prompt.ts       # regra Bv2-08 (linha ~463): "creditValue NOMINAL DO GRUPO"
  - src/lib/agent/orchestrator/directives.ts  # present_simulation_result
  # recommendation_card / offer_confirm / geração da proposta usam o VALOR PEDIDO (R$ 25.000) — sem coerção alinhada
---

## Palavras do operador
> (QA autônomo, jornada de serviços em produção) "A simulação e o simulador do meio dizem que o valor real do grupo é R$ 36.000 e a parcela R$ 554,83. Mas o card de recomendação, a carta 'confirmada com a administradora' e o PDF oficial da Conexia dizem R$ 25.000 e parcela R$ 385,30. São três números pra mesma coisa — e o texto da simulação afirma que R$ 25.000 é aproximação, contradizendo o PDF."

## Cenário
- **Rota/tela:** https://ajaagora.com.br — chat da jornada, segmento Serviços (persona Camila)
- **Passos:** 1) "Quero uma viagem de R$ 25 mil, ~R$ 500/mês" 2) primeira vez → educação → CPF/celular (Mirella) 3) lance "Sim / R$ 5 mil / lance embutido sim" 4) recomendação ÂNCORA 5) expande "Por que" → simulação detalhada + simulador interativo 6) "quero contratar" → carta real → confirmar → PDF
- **Dados usados:** CONTA2 Mirella (CPF 037.802.511-24); grupo ÂNCORA 313

## Esperado × Atual
- **Esperado:** o valor do crédito e a parcela são CONSISTENTES em todos os blocos da jornada (card de recomendação, simulação detalhada, simulador interativo, carta de confirmação, PDF). Um único número que o cliente pode confiar.
- **Atual:** dois mundos de números conflitantes na MESMA jornada:
  - **Mundo A (valor pedido):** card de recomendação, carta "confirmada com a ANCORA" e PDF Conexia → **Valor R$ 25.000,00 / parcela R$ 385,30 / 97 meses**.
  - **Mundo B (nominal do grupo, Bv2-08):** simulação detalhada e simulador interativo → **R$ 36.000,00 / parcela R$ 554,83 (ou R$ 555) / 97 meses**.
  - Pior: o texto da simulação detalhada afirma literalmente *"a simulação foi ajustada para o valor nominal do grupo, que é R$ 36.000,00 — um pouco acima dos R$ 25.000,00 que você mencionou. Os números abaixo refletem esse valor real do grupo"* — declarando que R$ 25.000 é "o que você mencionou" (aproximação) e R$ 36.000 é "o valor real". Só que o **PDF oficial da Conexia diz Valor do crédito R$ 25.000,00**. A afirmação da tela contradiz o documento oficial.

## Pista de causa (A CONFIRMAR — não investigado a fundo)
`simulate_quota` segue a regra **Bv2-08** (`system-prompt.ts:463`, `ai-sdk.ts:345/403`): por default simula sobre o `creditValue` NOMINAL do grupo (R$ 36.000) e emite `creditAdjustmentNotice`. Já o `recommendation_card`, o bloco de confirmação da carta (`offer_confirm`) e a geração da proposta/PDF usam o valor PEDIDO (R$ 25.000). Os blocos não compartilham a mesma fonte de "valor da cota". Conecta com a dívida conhecida do `recommendation_card` não-coagido server-side (ver memória `project_aja_tela_recomendacao_dados_reais` / `coerceRecommendationPayload`). **DECISÃO DE PRODUTO pendente (não cravar):** qual valor deve prevalecer na jornada de serviços — o nominal do grupo ou o valor pedido? Definir a fonte única e alinhar todos os blocos + o texto do notice de ajuste. Pergunta pro Kairo/Bernardo.

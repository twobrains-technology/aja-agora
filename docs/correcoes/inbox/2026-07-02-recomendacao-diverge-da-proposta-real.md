---
slug: recomendacao-diverge-da-proposta-real
titulo: "Alinhar valores da recomendação/simulador com a proposta real do fechamento (bem/parcela)"
status: inbox
severidade: alta
projeto: aja-agora
rodada: 2026-07-02 — QA dono-de-produto, AUTO web ponta-a-ponta contra PRODUÇÃO (ajaagora.com.br)
evidencia:
  - _evidencia/auto-web-recomendacao.png
  - _evidencia/auto-web-simulador.png
  - _evidencia/auto-web-proposta-real-divergente.png
mexe_em:
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/bevi
  - src/components/artifacts (recommendation_card / proposal_card)
---

## Palavras do operador
> "QA dono-de-produto da jornada AUTO web em produção, olhar crítico de UX: isso vende? eu assinaria?"

## Cenário
- **Rota/tela:** https://ajaagora.com.br — chat, jornada AUTO.
- **Passos:** 1) texto puro "Quero comprar um carro de uns R$ 70 mil, gastando perto de R$ 900 por mês." 2) nome Kairo 3) "Já conheço" → "Bora!" 4) CPF/celular CONTA1 + LGPD → "Buscar minhas ofertas" 5) lance "Sim" → "Uns R$ 14 mil" → "Sim, considerar lance embutido" 6) recomendação → "Tenho interesse" → fechamento → "Confirmar e contratar".
- **Dados usados:** CONTA1 (Kairo), Bevi homologação. Bem alvo R$ 70k, teto R$ 900/mês, lance R$ 14 mil.

## Esperado × Atual
- **Esperado:** o número mostrado na **recomendação/simulador** (o que faz o usuário decidir) é o mesmo da **proposta real** que ele contrata. Se o usuário aceita "R$ 892,48/mês (99,2% do seu teto de R$ 900)", a carta real deve ser ~R$ 892/mês.
- **Atual:**
  - **Recomendação (descoberta):** administradora ÂNCORA, **valor do bem R$ 70.000**, **parcela R$ 892,48/mês**, prazo 117m. Texto do agente: *"A parcela de R$ 892,48/mês fica praticamente dentro do seu teto de R$ 900,00 — isso é 99,2% do que você declarou."*
  - **Proposta real (fechamento / PDF):** **crédito R$ 100.000,00**, **parcela inicial R$ 1.438,28**, prazo 117m, Grupo 533. (O "R$ 70.000" reaparece no PDF apenas como *valor pós-contemplação*.)
  - Resultado: parcela real = **~160% do teto** do usuário, não 99,2%. Bem contratado R$ 100k, não R$ 70k. Efeito de bait-and-switch — quebra de confiança grave num produto fintech cuja promessa central é "diga quanto cabe no mês e receba a recomendação certa".

## Pista de causa (A CONFIRMAR — não investigado a fundo)
Dois shapes Bevi (descoberta rica vs fechamento magro) — memória do projeto + card relacionado. Hipóteses:
(a) a oferta selecionada na descoberta **não é carregada** para o fechamento (Partner API devolve outra cota/grupo);
(b) o flag de **lance embutido** faz o fechamento **dimensionar o crédito para cima** (R$ 100k p/ net ≈ R$ 70k), mas a recomendação exibiu a parcela da cota de R$ 70k, não a de R$ 100k.
Em ambos os casos o defeito de UX é o mesmo: a **parcela decisória exibida ≠ parcela contratada**. `recommendation_card` sem coerção server-side (ver `coerceRecommendationPayload`).

## Dúvida de produto (para o Kairo decidir)
Mesmo que o mapeamento R$ 70k→R$ 100k via lance embutido seja **intencional**, a afirmação "dentro do seu teto de R$ 900" está factualmente errada para o produto contratado. Decisão necessária: (1) recomendar já a cota real (R$ 100k/R$ 1.438) e explicar o net pós-lance, ou (2) manter a cota de R$ 70k também no fechamento. QA não classifica produto no escuro — este é o ponto que precisa da sua palavra.

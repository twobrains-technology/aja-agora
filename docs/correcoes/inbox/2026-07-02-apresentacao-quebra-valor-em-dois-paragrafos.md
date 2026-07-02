# Bug — valor "R$ 2.140,65" quebra em dois parágrafos na apresentação

- **Data:** 2026-07-02 · **Achado em:** QA dono-de-produto, jornada MOTO, canal WEB, PRODUÇÃO · **Superfície:** renderização de markdown da mensagem de apresentação do plano (chat web)
- **Severidade:** MÉDIA (defeito visual de polish; passa impressão de texto quebrado num produto que vende "clareza/transparência").

## Cenário
Na apresentação do plano recomendado, a frase "a parcela fica em R$ 2.140,65/mês" é renderizada como DOIS parágrafos separados:
- `<p>`: "Sendo transparente: a parcela fica em R$ 2."
- `<p>`: "140,65/mês — R$ 2.140,65 representa 42,8% do seu teto..."

## Esperado × Atual
- **Esperado:** "a parcela fica em R$ 2.140,65/mês" numa única linha/parágrafo.
- **Atual:** quebra após "R$ 2." — o renderizador de markdown provavelmente interpreta "2." (dígito + ponto no fim de linha) como início de lista ordenada / fim de sentença e força novo bloco.

## Evidência
- `<p>` capturados (Playwright): dois elementos distintos, split exatamente em "R$ 2." | "140,65/mês".
- Screenshot: `_evidencia/moto-05-recomendacao.png`.

## Causa raiz (hipótese)
Texto do modelo com quebra de linha logo após "R$ 2." OU pós-processamento/markdown que trata "2." como marcador de lista. Verificar o pipeline de formatação da mensagem (sanitização de milhar antes do render, ou desabilitar auto-lista no parser).

## Tratamento sugerido
Camada 1 (structural/unit no render). Normalizar número antes do markdown OU escapar o ponto de milhar. Teste que renderiza "R$ 2.140,65/mês" e asserta um único bloco de texto.

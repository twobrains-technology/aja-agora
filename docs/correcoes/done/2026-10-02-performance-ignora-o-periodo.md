---
slug: performance-ignora-o-periodo
titulo: "A tela de Performance não obedece ao filtro de período (e mistura parados/remarketing)"
status: done
severidade: alta
projeto: aja-agora
rodada: 2026-10-02 — call com a Bruna (01/10 11:38-12:01)
mexe_em:
  - src/lib/admin/performance-queries.ts
  - src/app/admin/(dashboard)/performance/
---

## Palavras do operador
> "Esse dado está ruim, tá ligado? Por quantidade de dias ali, ele não está filtrando pelo período que você colocou." (Kairo, 11:55:49)
> "São os parados." / "acho que a gente teria que fazer uma só de... de remarketing" (Kairo, 11:55:49)
> "É, aqui está confuso, mas peraí, vamos ver aqui. Então eu deveria ter nesses seis." (Bruna, 11:56:02)

## Cenário
- **Rota/tela:** /admin/performance, período = Hoje
- **Passos:** 1) abrir Performance; 2) escolher o período de hoje; 3) ler o número de conversas
- **Dados usados:** -

## Esperado × Atual
- **Esperado:** "Hoje" mostra só hoje — a Bruna esperava **6** conversas.
- **Atual:** mostrou ~50 e pouco; o número maior é dos **parados/remarketing**, que entram na mesma leitura e confundem.

## Pista de causa (A CONFIRMAR — não investigado a fundo)
O período não fecha a query (ou o recorte de remarketing entra por fora dele). A dona pediu também uma leitura
separada de remarketing/parados em vez de tudo na mesma tela. Não investigado a fundo.

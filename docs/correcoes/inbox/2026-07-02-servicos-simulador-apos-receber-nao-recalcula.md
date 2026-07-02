---
slug: servicos-simulador-apos-receber-nao-recalcula
titulo: "Simulador: 'Após receber — menor, depois do lance' mostra parcela idêntica e legenda 'depois do lance' aparece até no cenário sorteio"
status: inbox
severidade: baixa
projeto: aja-agora
rodada: 2026-07-02 — QA dono-de-produto, jornada SERVIÇOS, canal WEB, produção
evidencia:
  - _evidencia/servicos-recomendacao-simulacao.png
mexe_em:
  - src/components/**  # bloco do simulador interativo (slider de meses)
  - src/lib/agent/tools/ai-sdk.ts  # cálculo de parcela pós-lance / cenário
---

## Palavras do operador
> (QA autônomo) "No simulador interativo, 'Até contemplar: R$ 555' e 'Após receber: R$ 555 — menor, depois do lance' mostram o MESMO valor. E quando arrasto pro mês 49 (que vira 'sem lance / sorteio'), continua aparecendo 'menor, depois do lance' — não faz sentido falar de lance num cenário de sorteio."

## Cenário
- **Rota/tela:** chat, simulador interativo da ÂNCORA (após "Quero ver!")
- **Passos:** abrir o simulador → default 12 meses (mostra R$ 555 / R$ 555) → arrastar slider pro ~mês 49 (vira "sem lance (sorteio)") → bloco "Após receber" segue "R$ 555 — menor, depois do lance"
- **Dados usados:** ÂNCORA, lance declarado R$ 5.000

## Esperado × Atual
- **Esperado:** "Após receber" reflete a parcela real pós-contemplação (se é pra ser "menor", o número muda); e a legenda "depois do lance" só aparece em cenário COM lance.
- **Atual:** valor idêntico ao "Até contemplar" (R$ 555 = R$ 555), legenda "menor" enganosa; em cenário de sorteio (sem lance) a legenda "depois do lance" persiste.

## Pista de causa (A CONFIRMAR)
Bloco "Após receber" parece não recalcular a parcela pós-lance (ou renderiza a mesma) e a legenda é estática, não condicionada ao cenário (lance × sorteio). Olhar o componente do simulador e a origem dos dois valores.

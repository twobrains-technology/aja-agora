---
data: 2026-07-10
origem: Fable r8
severidade: P2
---
# Justificativa FALSA da divergência de faixa (120k→150k)
Ao explicar por que a carta recomendada (150k) difere do pedido (120k), o agente disse "a mais
próxima era 150k" — FALSO: havia cartas de 120k exatos na própria tabela (provado no tool-io). A
escolha real foi por SCORE (legítima), mas a narrativa inventou o motivo. Fix: a explicação da
divergência tem que vir do motivo REAL (score/ranking), não de uma proximidade inventada — ou
directive determinística que declare "recomendei pela X (parcela/contemplação), não pela mais próxima".

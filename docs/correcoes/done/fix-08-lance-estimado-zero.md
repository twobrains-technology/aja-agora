---
id: FIX-8
titulo: "'Lance estimado p/ contemplar' = R$ 0,00 — cálculo errado, informação enganosa"
status: done
rodada: 2026-06-05 manhã (teste manual em tela)
commit: ae17ffe
executado_em: 2026-06-05
---

# FIX-8 — "Lance estimado p/ contemplar" = R$ 0,00 — cálculo errado, informação enganosa

**Onde acontece:** Card "Simulação · CANOPUS" (R$ 475,93/mês, 96 meses,
crédito R$ 35.000), bloco **COM LANCE EMBUTIDO (30%)**:

| Linha | Valor exibido |
|---|---|
| Crédito líquido recebido | R$ 24.500,00 |
| **Lance estimado p/ contemplar** | **R$ 0,00** ← ERRADO |

Acima, o "CENÁRIO COM LANCE" diz: "Com lance de 30% do crédito,
expectativa de contemplação em ~6 meses".

**Palavras do Kairo:** "o lance estimado para contemplar está ficando
zero... o cálculo pelo visto não está sendo feito correto. A gente tem que
revisar isso daí e **não dar uma informação errada de forma alguma**."

**Hipótese de causa:** a lógica parece fazer
`lance_total_necessário (30%) − lance_embutido (30%) = 0` → exibe R$ 0,00.
Mesmo que a conta interna "feche", apresentar "R$ 0,00 pra contemplar" é
enganoso — sugere contemplação garantida sem desembolso. E se a conta não
for essa, está duplamente errado.

**Ação na execução:**
1. Revisar a matemática do bloco lance embutido no componente de simulação
   — de onde vem "lance estimado p/ contemplar"? Heurística local ou dado
   da oferta Bevi?
2. Definir o cálculo correto com fonte real. Se o lance embutido cobre o
   lance todo, comunicar EXPLICITAMENTE ("seu lance pode sair 100% da
   carta — sem dinheiro do bolso; em troca o crédito líquido cai pra X"),
   nunca "R$ 0,00" seco.
3. **Regra de produto:** nenhum número exibido pode vir de heurística
   furada — na dúvida, OMITIR o campo em vez de exibir errado.

**Regressão:** unit test do cálculo (casos: embutido 30/lance 30, lance >
embutido, sem embutido) + teste de render (nunca "R$ 0,00" nesse campo sem
explicação).

**Cruzamentos:** FIX-6 (valores do dial) e FIX-3 (componente dinâmico) —
mesma família "matemática do simulador". Revisar os três juntos.

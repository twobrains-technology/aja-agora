# 05 — Compliance, dados e o que nunca fazer

## Regras invioláveis (candidatas a `HARD_RULES.md` + teste)

1. **Nunca prometer data/prazo de contemplação.** Cenários são condicionais ("considerando um lance de X"). Já em `system-prompt.ts:64,:453`.
2. **Nunca arredondar valor monetário** (oferta vinculante, CDC art. 30). Já em `:546`.
3. **Nunca dizer "taxa competitiva / dentro da média" sem o número** (CDC art. 37). Já em `:536`.
4. **Disclaimer do motor de cálculo sempre visível** no card — nunca como tooltip escondido.
5. **Embutido sempre acompanhado da consequência:** "o crédito recebido diminui".
6. **`netCredit >= valorDoBem`** quando a estratégia usa embutido (invariante duro, em código).
7. **Escassez só com dado real.** `availableSlots` ausente → card não renderiza.
8. **Não oferecer redução de prazo.** (D7)
9. **Não dizer "reservado/garantido"** antes da contratação.

---

## Campos em standby (NÃO usar até documentar)

### `taxaContemplacao` — **PROIBIDO exibir**

- Existe no payload (Trilho B `:38`, Trilho A `:41`), mas **a semântica não é documentada**.
- A decisão de vocês de nunca exibir como taxa **está correta** e deve ser mantida.
- **Registro honesto:** durante a prototipagem eu exibi esse campo como "% de contemplação" e cheguei a associá-lo ao lance médio. Foi **inferência sem base**. Removido do protótipo final. Não reintroduzir.
- **Fonte correta** para sinal de contemplação, se quiserem: **`monthlyAwardedQuotas`** (contagem real de contemplados/mês), que já é o que vocês usam.

**Sugestão de guarda:** teste que falha se `taxaContemplacao` aparecer em qualquer payload de artifact ou string de card.

### `likelihood` (chance de contemplação) — **REMOVIDO**

A antiga heurística de 3 faixas (alta/média/baixa, derivada do tamanho do lance) era um **palpite**. Não há dado que a sustente: `taxaContemplacao` é proibido e `monthlyAwardedQuotas` é contagem, não probabilidade. Removido da saída do motor. Não reintroduzir sem fonte.

### `adminFee`
- Existe no Trilho B, **ausente no Trilho A** (`undefined`).
- Se ausente → **omitir** a linha de custo do embutido. Não estimar.

---

## Nomes de campo — atenção ao trilho

O comportamento validado usa nomes do **Trilho A**, mas o que roda hoje é o **Trilho B**:

| Conceito | Trilho B (roda hoje) | Trilho A (fechamento) |
|---|---|---|
| valor da carta | `finalValue` (`offer-mapper.ts:21`) | `valorCarta` |
| parcela | `installmentValue` / `importedInstallmentValue` (`:24-25`) | `parcela` |
| prazo | `term` (`:20`) | `prazo?` |
| lance médio | `averageBid?` (`:65`, FIX-223) | `lanceMedio?` |
| taxa adm | `adminFee` | **ausente** |

> Qualquer código novo deve consumir o **tipo mapeado** (pós `offer-mapper`), não os nomes crus. Se o mapper ainda não normaliza `averageBid` → `lanceMedio`, esse é o lugar de fazer.

---

## Onde cada regra deve morar (lei de arquitetura de vocês)

| Tipo de regra | Onde | Exemplo |
|---|---|---|
| Comportamento/conversa | prompt (`system-prompt.ts`, `HARD_RULES.md`) | tom, cadência, ordem narrativa |
| Invariante duro | código (`orchestrator/`, `recommendation.ts`) | `netCredit >= valorDoBem`, allowlist de tools |
| Cálculo financeiro | módulos puros (`consorcio/`, `finance/`) | lance, embutido, parcela pós |
| Texto proibido em runtime | `sanitizer.ts` | "reduzir o prazo", "sua cota está garantida" |

**Não colocar invariante financeiro no prompt.** Um invariante que só existe no prompt é um invariante que a LLM pode violar.

# 03 — Regras de cálculo e guardrails

> ⚠️ **MUDANÇA DE FÓRMULA.** A curva de lance atual em `contemplation-dial.ts:89-96` está **incorreta** e deve ser substituída pela especificada aqui. A justificativa numérica está na seção "Por que trocar". O modelo **AMORTIZA** (FIX-221) está certo e permanece.

---

## Por que trocar a curva de lance

**Fórmula atual:** `raw = winningBid * anchorMonth / targetMonth` (hiperbólica), com taper e clamp.

Rodando com dado real da Bevi (Rodobens, carta R$ 171.000, `averageBid` R$ 89.946 → 52,6%, `anchorMonth` 20):

| mês-alvo | ATUAL (hiperbólica) | NOVA (power calibrada) |
|---:|---:|---:|
| 1 | **90,0% (clamp)** | 75,2% |
| 3 | **90,0% (clamp)** | 72,7% |
| 6 | **90,0% (clamp)** | 68,9% |
| 12 | 87,7% | 61,7% |
| **20 (ref)** | **52,6%** ✓ | **52,6%** ✓ |
| 40 | 26,3% | 32,3% |
| 60 | 17,5% | 15,9% |
| 80 | 13,2% | 4,3% → *sorteio* |
| 96 (fim do prazo) | **11,0%** | **0,0%** → *sorteio* |

**Dois defeitos concretos da atual:**

1. **Achatamento no clamp.** Meses 1–6 saem todos em 90%. A agulha perde resolução exatamente na faixa onde o cliente arrasta e decide. Do ponto de vista de produto, o gauge fica *morto* no começo.
2. **Não converge para zero.** No último mês do grupo ainda exige 11% de lance. Isso é irreal: perto do fim, a contemplação acontece por sorteio e o lance necessário tende a zero. O modo `sorteio` (`<8%`) **nunca dispara naturalmente** — só via taper artificial.

**A curva nova** passa exatamente pelo mesmo ponto real (mês 20 = 52,6%) e **tende a zero por construção** no fim do prazo, fazendo o modo sorteio emergir sozinho.

---

## Fórmula canônica (substituir `computeContemplationDial`)

### Entradas
| Campo | Origem |
|---|---|
| `creditValue` | `finalValue` (Trilho B) |
| `termMonths` | `term` |
| `monthlyPayment` | `installmentValue` |
| `averageBid` | `averageBid` — **valor absoluto por oferta**, nunca % fixo |
| `referenceMonth` | mês de referência do lance histórico (ver Pendência P5) |
| `maxEmbutidoPct` | contrato do grupo (default 0.30) |
| `admFeePct` | `adminFee` (pode ser `undefined` no Trilho A) |
| `targetMonth` | posição escolhida na agulha |

### 1. Curva do lance necessário

```ts
const K = 1.6;                                  // curvatura
const p = (m: number) => (m - 1) / (termMonths - 1);   // 0 no mês 1, 1 no fim

const winningBidPct = averageBid / creditValue;        // deriva o % DESSA oferta
const L0 = winningBidPct / Math.pow(1 - p(referenceMonth), K);   // calibra no ponto real

const requiredLancePct = clamp(L0 * Math.pow(1 - p(targetMonth), K), 0, 0.9);
const requiredLanceValue = requiredLancePct * creditValue;
```

**Propriedades garantidas:**
- Passa exatamente por `(referenceMonth, winningBidPct)`.
- `requiredLancePct → 0` quando `targetMonth → termMonths`.
- Monotônica decrescente. Sem clamp na região útil (meses iniciais ficam ~70–80%, não 90%).

> `winningBidPct` é derivado **por oferta** (`averageBid / creditValue`). Cartas diferentes → percentuais diferentes. **Nunca** reaproveitar o lance médio de uma carta em outra. (Foi um bug real do protótipo: a carta de 171k exibia o lance da carta de 123k.)

### 2. Modo lance vs sorteio (mantém)

```ts
const mode = requiredLancePct < 0.08 ? "sorteio" : "lance";
```
Agora dispara **naturalmente** perto do fim do prazo.

### 3. Composição do lance (mantém)

```ts
const embeddedBidValue = Math.min(requiredLanceValue, creditValue * maxEmbutidoPct);
const ownCashValue     = Math.max(0, requiredLanceValue - embeddedBidValue);
const netCredit        = creditValue - embeddedBidValue;   // embutido reduz o crédito
```

### 4. Parcela após a contemplação — modelo AMORTIZA (mantém, está certo)

```ts
const rem              = Math.max(1, termMonths - targetMonth);
const remainingBalance = monthlyPayment * rem;
const amortizacao      = requiredLanceValue;      // lance INTEIRO (embutido + bolso)
const balanceAfter     = Math.max(0, remainingBalance - amortizacao);

const paymentAfterContemplation = clamp(balanceAfter / rem, 0, monthlyPayment);
```

✅ Isso já é o FIX-221 de vocês e está correto — validado contra ABAC, Serasa, Sicredi, Rodobens, Unifisa.
❌ **Não** calcular redução de prazo. Ver D7.

### 5. Custo escondido do embutido

```ts
const admSobreEmbutido = admFeePct !== undefined
  ? embeddedBidValue * admFeePct
  : undefined;    // Trilho A: adminFee ausente → NÃO exibir a linha, não estimar
```
A taxa de administração incide sobre a **carta cheia**, inclusive sobre o embutido que o cliente não recebe.

### 6. Saídas

`targetMonth · requiredLancePct · requiredLanceValue · mode · embeddedBidValue · ownCashValue · netCredit · paymentAfterContemplation · admSobreEmbutido? · disclaimer`

> **Removido:** `likelihood`. A antiga heurística de 3 faixas (alta/média/baixa) era um palpite derivado do tamanho do lance. Não temos dado que a sustente. Ver `05-compliance-e-dados.md`.

---

## Testes que devem acompanhar a troca

```
✓ curve(referenceMonth) === winningBidPct           (calibração exata, ±0.5%)
✓ curve(termMonths) < 0.08                          (modo sorteio emerge sozinho)
✓ curve(m) monotônica decrescente em [1, termMonths]
✓ curve(1) < 0.9                                    (não bate no clamp na região útil)
✓ cartas diferentes → winningBidPct diferentes      (derivado por oferta)
✓ netCredit === creditValue - embeddedBidValue
✓ paymentAfterContemplation <= monthlyPayment
✓ nenhuma saída expõe redução de prazo
```

---

## Guardrail (D6) — crédito líquido nunca abaixo do bem

**Invariante:**
```
netCredit = creditValue − embeddedBidValue   >=   valorDoBem
```

**Por que é crítico:** sem isso o cliente contempla mais rápido e recebe dinheiro que **não compra o bem que veio comprar**. É a falha silenciosa mais perigosa do embutido.

**Exemplo real:**
- Bem R$ 120.000 · carta R$ 123.300 · embutido 30% = R$ 36.990 → `netCredit` = **R$ 86.310** ❌
- Bem R$ 120.000 · carta R$ 171.000 · embutido 30% = R$ 51.300 → `netCredit` = **R$ 119.700** ✅

**Implementação:** em `recommendation.ts`, filtrar candidatas com embutido por `netCredit >= creditMax`. O sweep `[0.7, 1.0, 1.3] × valor` já roda — a faixa `1.3×` é de onde sai a carta maior. Sem chamada nova à Bevi.

**Onde travar:** invariante duro → **código**, não prompt.

---

## Escolha de grupo: lance médio + parcela, condicional à estratégia

Dados reais (grupos ~R$ 171k) mostram `averageBid` variando de ~R$ 90k (Rodobens, 53%) a ~R$ 142k (Âncora, 83%) para cartas praticamente idênticas.

- Cliente **vai juntar dinheiro** → o grupo de **menor `averageBid`** é o mais alcançável. Peso alto.
- Cliente **não vai dar lance** → `averageBid` é irrelevante. Peso zero. O que importa é a **parcela**.

Ponderar `averageBid` no scoring **condicionalmente** a `lanceValue` / `monthlySavings` estarem preenchidos.

---

## Âncora de dinheiro (para a agulha)

A agulha responde "quando o seu **dinheiro alcança** o lance", não "quando você quer".

```ts
// entrada pontual (13º, férias, venda do bem atual, FGTS)
mesAlvo = lanceMonth;

// poupança recorrente: primeiro mês em que o dinheiro cobre o BOLSO
for (let m = 1; m <= termMonths; m++) {
  const lance    = requiredLanceValue(m);
  const embutido = Math.min(lance, creditValue * maxEmbutidoPct);
  const bolso    = Math.max(0, lance - embutido);
  if (saldoInicial + monthlySavings * (m - 1) >= bolso) return m;
}
```

⚠️ A comparação é contra o **bolso**, não contra o lance total — o embutido não sai do bolso do cliente.

**WhatsApp:** mesma função, sem visual. O agente narra: *"Juntando R$ 4.000/mês, lá pelo mês 10 seu dinheiro alcança o lance."* **Cálculo único, duas apresentações.**

**FGTS (vertical imóvel):** conta como **lance embutido** (vai direto ao vendedor). Deve entrar como fonte na âncora. É o maior acelerador da vertical imóvel e hoje não é perguntado.

---

## O que NÃO fazemos (D7)

**Redução de prazo está fora de escopo.** O abatimento vira **parcela menor**, e ponto.
Sugestão: padrão proibido no `sanitizer.ts` → `/reduzir o prazo|terminar antes|quitar antes/i`.

---

## Pendências reais (não inventar resposta)

| # | Pendência | Dono | Impacto |
|---|---|---|---|
| P1 | Destino do abatimento (parcela vs prazo) varia por administradora | Bernardo (`PENDENTE` em `contemplation-dial.ts:116`) | número do "após a contemplação" |
| P2 | Semântica de `taxaContemplacao` | Bevi | hoje: proibido exibir |
| P3 | `adminFee` ausente no Trilho A | Bevi/CreditHub | linha do custo do embutido some |
| P4 | `maxEmbutidoPct` real por grupo (assumimos 30%) | Contrato | muda `netCredit` e o guardrail D6 |
| **P5** | **`referenceMonth` — a Bevi entrega o mês do lance histórico?** | **Bevi** | **calibração da curva** |

> **Sobre P5, com honestidade:** o payload que vimos traz `lanceMedio`/`averageBid` mas **não** um mês associado. A calibração precisa de um par `(mês, %)`. Enquanto a Bevi não fornecer o mês, `referenceMonth` é uma **constante ajustável** (o `anchorMonth` que já existe hoje). Isso é uma limitação **das duas** fórmulas, não da nova — mas na nova o efeito é bem-comportado (a curva ainda tende a zero no fim), enquanto na atual um `anchorMonth` mal escolhido explode o clamp.

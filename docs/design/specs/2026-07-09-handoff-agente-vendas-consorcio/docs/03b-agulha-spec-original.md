> ⚠️ **DOCUMENTO HISTÓRICO — parcialmente superado.**
> Mantido como referência da agulha. **Duas coisas aqui NÃO valem mais:**
> 1. O toggle **"parcela menor × terminar antes"** — redução de prazo saiu de escopo (ver `03-regras-calculo.md`, D7).
> 2. Qualquer uso de **`taxaContemplacao`** — proibido exibir (ver `05-compliance-e-dados.md`).
>
> O resto (momento em que a agulha aparece, entradas, saídas, faixas `<8% → sorteio`, disclaimer CDC) continua válido.

---

# Agulha de Contemplação — handoff técnico (ajustada)

Handoff pro Claude Code implementar/ajustar o `ContemplationDial` (aja-agora). Cobre **em que momento a agulha aparece**, **como o cálculo funciona** e **os campos de saída**. A lógica abaixo foi validada contra fontes de consórcio (ABAC, Serasa, Sicredi, Rodobens, Unifisa, InfoMoney, Consórcio Web) — as correções em relação à versão anterior estão marcadas com **[CORRIGIDO]**.

---

## 1. Quando a agulha aparece

**Gatilho:** logo depois que a **oferta real já foi revelada** ao usuário (a recomendação com carta, parcela e lance médio do grupo já está na tela). A agulha é o passo em que o usuário passa de "vi a oferta" para "simulo minha estratégia de contemplação".

**Pré-condições (todas verdadeiras) pra renderizar:**

1. Já existe uma **oferta selecionada** com os dados mínimos: `creditValue`, `termMonths`, `monthlyPayment`, `maxEmbutidoPct`, `admFeePct`.
2. A oferta traz (idealmente) o **par histórico da Bevi**: `historicalWinningBidPct` + `referenceMonth`. Se vier, a curva é calibrada nesse ponto real; se **não** vier, cai numa curva heurística genérica (ver §3).
3. O grupo **permite lance** (se for grupo só-sorteio, não faz sentido mostrar o controle de lance — mostrar só o modo sorteio).

**Canais:**
- **Web:** renderiza o componente visual (gauge arrastável).
- **WhatsApp:** mesma lógica de cálculo, **sem o visual** — o agente narra os números em texto (mesma função `computeContemplationDial`, só muda a camada de apresentação). O cálculo é o mesmo nos dois canais; nunca duplicar a fórmula.

**Posição na hierarquia visual (de cima pra baixo, não reordenar):**
`gauge → número grande do mês → chance de contemplação → antes/depois → recibo do lance → disclaimer CDC`

---

## 2. Entradas do cálculo (payload da oferta)

| Campo | Tipo | Descrição |
|---|---|---|
| `creditValue` | number (R$) | Valor da carta de crédito. |
| `termMonths` | number | Prazo total do grupo, em meses. |
| `monthlyPayment` | number (R$) | Parcela cheia atual (antes de contemplar). |
| `maxEmbutidoPct` | number (0–1) | Teto do lance embutido permitido pelo grupo. Default de mercado **0.30** (varia por administradora; vem do contrato). |
| `admFeePct` | number (0–1) | Taxa de administração do plano. Usada pra expor o custo do embutido. |
| `historicalWinningBidPct` | number (0–1) \| null | Lance histórico que costuma vencer no `referenceMonth` (par real Bevi). Calibra a curva. |
| `referenceMonth` | number \| null | Mês de referência do par histórico. |
| `targetMonth` | number | **O que a agulha representa** — a posição escolhida pelo usuário (mês-alvo). É a única entrada que muda ao arrastar. |

Estado de UI (não vem do payload, é do componente):

| Estado | Valores | Default |
|---|---|---|
| `amortMode` | `"parcela"` \| `"prazo"` | `"parcela"` |

`amortMode` decide se o lance abatido vira **parcela menor** (mesmo prazo) ou **prazo menor** (mesma parcela). É escolha do usuário. **[NOVO]**

---

## 3. Como o cálculo funciona (`computeContemplationDial`)

Recebe `targetMonth` (+ os campos da oferta) e devolve tudo que a UI precisa. Passo a passo:

### 3.1. Curva do lance necessário (calibrada no ponto real)

Posição normalizada no prazo:

```
p(m) = (m - 1) / (termMonths - 1)     // 0 no mês 1, 1 no fim do prazo
```

A curva decai com o mês (quanto mais cedo o alvo, maior o lance):

```
k    = 1.6                            // curvatura
pRef = p(referenceMonth)
L0   = historicalWinningBidPct / (1 - pRef)^k     // calibra a curva pra passar no ponto real da Bevi
requiredLancePct = clamp( L0 * (1 - p(targetMonth))^k , 0, 0.9 )
```

- **Com par Bevi:** `L0` é resolvido pra curva passar **exatamente** por `(referenceMonth, historicalWinningBidPct)`. Perto do fim do prazo (`p→1`) o lance tende a zero.
- **Sem par Bevi:** usar `historicalWinningBidPct`/`referenceMonth` heurísticos (ex.: 0.45 no mês ~20% do prazo) e sinalizar que é estimativa genérica.

> A curva é **ilustrativa** no protótipo. Em produção, a fórmula/curva real fica em `computeContemplationDial` — não deve ser reinventada na UI. O que **não pode** mudar são as faixas de negócio (§3.5, §3.6).

```
requiredLanceValue = requiredLancePct * creditValue
```

### 3.2. Modo lance vs sorteio **[regra de negócio — não mexer]**

```
mode = requiredLancePct < 0.08 ? "sorteio" : "lance"
```

Abaixo de 8% de lance necessário, a contemplação vira **sorteio** (lance opcional). A UI troca a mensagem do recibo pra "sem lance".

### 3.3. Composição do lance: embutido vs bolso

```
embeddedBidValue = min(requiredLanceValue, creditValue * maxEmbutidoPct)   // sai da carta
ownCashValue     = max(0, requiredLanceValue - embeddedBidValue)           // sai do bolso
receivedCredit   = creditValue - embeddedBidValue                          // crédito líquido pra comprar
```

- **[VALIDADO]** O embutido **reduz o crédito recebido** (`receivedCredit`). Confirmado em todas as fontes.
- O que passar do teto de embutido tem que vir do bolso (`ownCashValue`).

### 3.4. Efeito na parcela/prazo depois de contemplar **[CORRIGIDO]**

O ponto que estava errado antes: abatia **só o bolso**. O correto é que **o lance inteiro (embutido + bolso) amortiza o saldo devedor**.

```
rem              = max(1, termMonths - targetMonth)     // parcelas restantes
remainingBalance = monthlyPayment * rem                 // saldo aproximado
amortizacao      = requiredLanceValue                   // lance INTEIRO abate  [CORRIGIDO]
balanceAfter     = max(0, remainingBalance - amortizacao)
```

Dois destinos possíveis do abatimento (decididos por `amortMode`): **[NOVO]**

```
// amortMode === "parcela"  → parcela menor, mesmo prazo
paymentReduzindoParcela = clamp(balanceAfter / rem, 0, monthlyPayment)

// amortMode === "prazo"    → mesma parcela, termina antes
mesesEconomizados = min(rem - 1, round(amortizacao / monthlyPayment))
novoPrazoRestante = rem - mesesEconomizados
```

> **Recalibrável:** o destino do abatimento (parcela vs prazo) **varia por administradora** — algumas deixam o cliente escolher, outras já jogam pra prazo por padrão. Marcar o número "Após receber" como dependente da regra da administradora. Quando o default por administradora estiver definido, travar por grupo.

### 3.5. Custo escondido do embutido **[NOVO — honestidade]**

```
admSobreEmbutido = embeddedBidValue * admFeePct
```

A **taxa de administração incide sobre a carta cheia**, inclusive sobre o embutido que o cliente não recebe. Exibir esse custo (linha discreta no recibo) quando `embeddedBidValue > 0`. É diferencial de confiança — a maioria dos vendedores esconde.

### 3.6. Likelihood (chance de contemplação) **[3 faixas — não mexer]**

```
if      requiredLancePct >= 0.40  → "baixa"   (coral)
else if requiredLancePct >= 0.15  → "média"   (âmbar)
else                              → "alta"    (verde)
```

Colore a barra de chance. Regra qualitativa validada: arrastar pra mais cedo (lance maior) → chance cai.

---

## 4. Saídas (o que a UI consome)

| Campo | Descrição |
|---|---|
| `targetMonth` | Mês-alvo escolhido (número grande central). |
| `requiredLancePct` / `requiredLanceValue` | Lance necessário pro mês (% e R$). |
| `mode` | `"lance"` \| `"sorteio"`. Em `sorteio`, recibo mostra "sem lance". |
| `embeddedBidValue` | Parte do lance que sai da carta (embutido). |
| `ownCashValue` | Parte do lance que sai do bolso. |
| `receivedCredit` | Crédito líquido pra comprar (carta − embutido). |
| `paymentReduzindoParcela` | Parcela nova, se `amortMode==="parcela"`. **[NOVO]** |
| `mesesEconomizados` / `novoPrazoRestante` | Meses poupados / novo prazo, se `amortMode==="prazo"`. **[NOVO]** |
| `admSobreEmbutido` | Taxa de adm que incide sobre o embutido (custo escondido). **[NOVO]** |
| `likelihood` | `"alta"` \| `"média"` \| `"baixa"` (cor da barra). |

---

## 5. Regras invioláveis

1. **Disclaimer CDC sempre visível** (rodapé, não vira tooltip): "Estimativa a partir dos dados da oferta. Contemplação por lance ou sorteio não é garantida." (CDC art. 30/37).
2. **Nunca prometer mês/prazo de contemplação** como certo. A agulha simula cenários; a contemplação depende de sorteio/lance e da concorrência do grupo.
3. **Faixas de negócio não se reinventam:** `< 8% → sorteio` e os 3 níveis de `likelihood` são regras validadas.
4. **Cálculo único** pros dois canais (web e WhatsApp). A UI muda; a fórmula não.
5. **Embutido nunca pode deixar `receivedCredit` abaixo do valor do bem** que o cliente veio comprar — se acontecer, avisar (o cliente contempla mais rápido mas não tem crédito suficiente pro bem).

---

## 6. Resumo das mudanças vs versão anterior

| # | Mudança | Tipo |
|---|---|---|
| 1 | Lance **inteiro** (embutido + bolso) amortiza o saldo — antes só o bolso. | **[CORRIGIDO]** |
| 2 | Toggle **parcela menor × terminar antes** (`amortMode`). | **[NOVO]** |
| 3 | Exibir **taxa de adm sobre o embutido** (`admSobreEmbutido`). | **[NOVO]** |
| 4 | "Após receber" marcado como **recalibrável** (regra por administradora). | Ajuste |
| 5 | Teto embutido, redução de crédito e faixas — **confirmados** nas fontes. | Validação |

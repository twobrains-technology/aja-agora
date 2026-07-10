# 02 — Cards: 3 novos + ajustes nos existentes

## Como um card nasce nesta arquitetura (checklist)

Para cada card novo, tocar **4 pontos**:

1. **Payload tipado** → `src/lib/chat/types.ts` (adicionar ao union `ArtifactByType`)
2. **Tool `present_*`** → `src/lib/agent/tools/ai-sdk.ts` + schema Zod em `tools/schemas.ts`
3. **Coerção server-side** → `orchestrator/runner.ts:427-458` (o payload é montado no servidor a partir da oferta real; a LLM só escolhe *qual* grupo)
4. **Componente + switch** → `src/components/chat/artifacts/<nome>.tsx` + case em `artifact-renderer.tsx:47`

E registrar a tool na fase certa em `orchestrator/tool-policy.ts:116` (`allowedTools`).

---

## CARD 1 — `embedded_bid` (lance embutido)

**Quando:** gate `lance-embutido`, antes da agulha. Só se o cliente sinalizou pressa/pouca reserva.

**Payload:**
```ts
type EmbeddedBidPayload = {
  maxEmbutidoPct: number;      // ex 0.30 — do contrato do grupo
  creditValue: number;         // carta cheia
  embeddedBidValue: number;    // maxEmbutidoPct * creditValue
  netCredit: number;           // creditValue - embeddedBidValue
  disclaimer: string;          // obrigatório
};
```

**Copy do card (curta, 2 blocos):**
- Título: *Lance embutido — sem tirar do bolso*
- Corpo: *"Você usa **parte da própria carta** como lance e antecipa a contemplação, sem desembolsar. O embutido sai da carta, então o crédito recebido diminui um pouco."*

**Regra dura:** este card **sempre** diz que o crédito recebido diminui. Não é opcional — é o que separa consultoria de venda enganosa.

---

## CARD 2 — `scarcity` (grupo quase cheio)

**Quando:** gate `scarcity`, depois da estratégia, antes da proposta. **Só renderiza se `availableSlots` vier da Bevi e for baixo** (sugestão: `<= 5`).

**Payload:**
```ts
type ScarcityPayload = {
  groupCode: string;
  administrator: string;
  availableSlots: number;   // vem da Bevi. NUNCA inventar.
  disclaimer?: string;
};
```

**Regras de exibição (inegociáveis):**
- Mostrar **"restam apenas N"**.
- **NUNCA** exibir o total de cotas do grupo — não temos esse dado.
- **NUNCA** renderizar uma barra cujo preenchimento implique um total conhecido de forma numérica. O visual de barra é **decorativo** (largura fixa, ~90%), não uma razão `N/total`.
- Se `availableSlots` for `undefined` → **não renderizar o card**. Sem fallback, sem estimativa.

**Copy:** *"Grupo quase cheio · restam apenas 3. Quando preencher, entra fila para o próximo grupo."*

> Escassez no consórcio é **real** (a cota é finita). Por isso funciona. Inventar número destrói a única vantagem que ela tem sobre um botão de e-commerce.

---

## CARD 3 — `two_paths` (dois caminhos, sem lance)

**Quando:** gate `lance`, saída "não quero comprometer nada além da parcela".
Pode nascer como `variant` de `decision-prompt.tsx`.

**Payload:**
```ts
type TwoPathsPayload = {
  monthlyPayment: number;      // parcela do grupo escolhido
  administrator: string;
  disclaimer: string;
};
```

**Conteúdo:**
- **(A) Esperar o sorteio** — paga só a parcela de `monthlyPayment` e concorre todo mês, sem custo extra. *Ideal pra quem não tem pressa.*
- **(B) Um lance pequeno lá na frente** — se sobrar um extra (férias, 13º), um lance modesto melhora as chances. *Opcional, quando fizer sentido.*

**Regra de comportamento:** depois do card, o agente **devolve a decisão** ("não tem certo ou errado — depende de você ter pressa"). Não recomenda um dos dois. Isso é postura de consultor e é o que converte quem chegou defensivo.

**O que NÃO pode aparecer aqui:** nenhuma métrica de chance/probabilidade de contemplação. Ver `05`.

---

## Ajustes nos cards que já existem

### `group-card.tsx` / `comparison-table.tsx`
- **Carta de crédito em destaque** (fonte grande, é o que o cliente compra).
- **Parcela** logo abaixo.
- **Lance médio → linha de detalhe discreta** (cinza pequeno, tipo "lance médio ⌄"). Não é protagonista.
- **`lanceMedio` (`averageBid`) é valor absoluto por oferta, vindo da Bevi.** Nunca derivar de um % fixo; nunca reaproveitar o lance de uma carta em outra. Cartas diferentes → lances diferentes.
- **Remover** qualquer exibição de `taxaContemplacao` como percentual.

### `recommendation-card.tsx`
- Carta em destaque.
- **Não** mostrar parcela pós-contemplação (ela aparece só na agulha).
- Nota: *"Esse valor é a parcela cheia, que você paga até ser contemplada."*

### `real-offer.tsx` (proposta)
- Header co-branded: **Aja Agora + administradora** (logo).
- Carta em destaque, parcela, prazo.
- Selo **"0% de juros — você paga o bem, não os juros do banco"**.
- Chips de credibilidade: sem juros · fiscalizado pelo Banco Central · dados protegidos (LGPD) · acompanhamento até a contemplação.
- **Economia vs. financiamento:** se exibir, exibir **com a premissa** (taxa/CET usada no comparativo, via `finance/pmt.ts`). Número de economia sem premissa é promessa vaga — mesmo risco de "prometer prazo".

### `contemplation-dial.tsx`
- Ver `03-regras-calculo.md`. Principais: sem "reduzir prazo"; âncora de dinheiro; disclaimer CDC fixo (não vira tooltip).

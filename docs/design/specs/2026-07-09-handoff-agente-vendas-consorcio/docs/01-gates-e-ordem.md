# 01 — Gates e ordem da conversa

Alvo para `qualify-state.ts` (`nextGate`) e `decideShowGate`.

## Cadeia de gates — HOJE vs ALVO

**Hoje (inferido de `qualify-state.ts:4`):**
```
name → experience → consent → credit → timeframe → lance → lance-embutido → identify → search → decision
```

**Alvo:**
```
name → desire* → credit → consent → identify → search
     → experience → [explicação + badges se novato]
     → recommendation
     → timeframe
     → lance (tem reserva? vai juntar?)
     → lance-embutido → contemplation_dial
     → scarcity → proposal → decision → whatsapp-handoff
```
`*` gate novo, leve, não bloqueante.

### As duas mudanças de ordem que importam

1. **`experience` desce** — passa a rodar **depois** de `search`, com grupos na tela.
   Justificativa de produto: quem já fez consórcio não precisa da aula (não atrasar lead quente); quem é novato precisa, mas só faz sentido explicar depois de ver as opções.

2. **`timeframe` sobe pra depois da recomendação** — a pergunta "em quanto tempo você quer o bem?" é a **ponte natural** pro `contemplation_dial`. Perguntar antes da recomendação a desperdiça.

---

## Especificação gate a gate

### `name`
Pergunta o nome. Sem card.

### `desire` (NOVO — não bloqueante, sem card)
Duas perguntas curtas, uma por balão:
1. *"Qual carro/imóvel você tem em mente?"* → slot `qualifyAnswers.desiredItem`
2. *"E o que fez você decidir trocar/comprar agora?"* → slot `qualifyAnswers.motivation`

**Uso:** `motivation` vira contexto injetado no prompt e é **espelhada** uma vez ("quando o carro dá trabalho, atrapalha tudo"). Não repetir a cada turno.
**Se o usuário pular:** seguir normal. Gate não bloqueia.

### `credit`
Valor do bem. Card `value-picker.tsx` (já existe).

### `consent` + `identify`
CPF + WhatsApp + LGPD. Card `gate-identity-form.tsx` (já existe).
Copy: *"Pra eu trazer as ofertas **reais** das administradoras, preciso do seu CPF e WhatsApp"* — a justificativa vem **junto** do pedido.
Rótulo obrigatório: **"Não é compromisso de contratação."**

### `search`
Chama Bevi. Exibe `comparison-table.tsx` / `group-card.tsx`.
**Regra de card (ver `02`):** carta em destaque; parcela abaixo; **lance médio discreto** (linha de detalhe).
Copy curta: *"Encontrei vários grupos. Separei os melhores — repara na carta e na parcela de cada um."*
Quando pedir "ver todas": explicar a **variação de carta** (cada administradora monta num valor próximo do pedido).

### `experience` (MOVIDO PRA CÁ)
Uma pergunta: *"Você já fez consórcio antes, ou é a primeira vez?"*
- **Já fez** → pula explicação, vai direto pra recomendação.
- **Primeira vez** → um balão de explicação (mecânica: grupo, contemplação mensal por sorteio ou lance, carta, "você paga o bem, não o banco") + **badges de dúvida**.

**Badges** (chips tocáveis, não empurrados): `o que é lance?` · `como funciona o sorteio?` · `e quando eu for contemplado?`
Cada badge → resposta curta (1 balão). O badge "o que é lance?" **planta o embutido** sem mostrar número que assusta.

### `recommendation`
`recommendation-card.tsx`. Carta em destaque. **Não exibir parcela pós-contemplação aqui** — só a parcela cheia, com nota de que ela muda depois da contemplação.
Prova social sóbria: *"é a que eu indicaria pra alguém da minha família"* + o motivo racional (parcela mais leve).

### `timeframe` (MOVIDO PRA CÁ)
*"Em quanto tempo você gostaria de estar com esse Corolla na garagem?"*
É a **ponte** pro simulador. Slot: `qualifyAnswers.timeframeMonths` (ou intenção qualitativa).

### `lance`
Bifurcação — decide a estratégia:
- *"Você tem uma reserva pro lance hoje, ou prefere ir juntando aos poucos?"*
- Slots: `lanceValue` (reserva disponível) e/ou `monthlySavings` (quanto junta por mês) — **`monthlySavings` é slot novo**.
- **Terceira saída:** "não quero comprometer nada além da parcela" → vai pro card **dois caminhos** (D5), pula embutido e agulha.

### `lance-embutido`
Card novo (D3): conceito em 2–3 linhas + o custo (embutido sai da carta, crédito recebido diminui).

### `contemplation_dial`
`contemplation-dial.tsx` (existe). Ancorar no dinheiro real do cliente (`lanceValue` pontual ou `monthlySavings` recorrente). Ver `03-regras-calculo.md`.

### `scarcity` (NOVO)
Card D4. Só quando `availableSlots` vier da Bevi e for baixo. **"Restam apenas N"** — nunca inventar o total.

### `proposal`
`real-offer.tsx` (existe). Co-branded Aja Agora + administradora. Selo "0% de juros".

### `decision` → `whatsapp-handoff`
Ver D8 em `00` e a copy em `04-copy-fluxos.md`.

---

## Regra de interrupção (`decideShowGate`)

O gate só interrompe com card se o `userIntent` do analyzer **não** já respondeu o slot.
Exemplo: se o usuário disse "quero um Corolla de uns 120 mil" numa frase, `desiredItem` e `credit` já estão preenchidos — não mostrar o `value-picker`, só confirmar.

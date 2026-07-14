# ADR — Revoga a "jornada soberana" e desamarra o agente

- **Data:** 2026-07-13
- **Decisor:** Kairo
- **Status:** aceita
- **Revoga:** o dogma *"jornada-canonica.md é REGRA; divergência código × jornada é defeito do
  código"* (nascido no `jornada.docx`, replicado no `CLAUDE.md`, no `CONTEXT.md`, em
  `visao/README.md`, no roteiro de QA, em 45 arquivos de teste e na rubrica do LLM-judge).
- **Revoga também:** `2026-06-25-bloco-a-agente-passos-obrigatorios.md` (tratava desvio do modelo
  em relação ao roteiro como bug, e instalava "REGRA DURA" no system prompt).

## Contexto

O produto nasceu amarrado a um documento Word do cliente. O `jornada.docx` virou `jornada-canonica.md`
e foi declarado **fonte soberana**: qualquer coisa que o código fizesse diferente do documento era,
por definição, defeito do código. A partir daí, todo ciclo de melhoria apertou o parafuso:

1. O **`CLAUDE.md`** mandava obedecer ao documento — as sessões de IA não podiam questioná-lo.
2. O **código** virou uma máquina de estados com fala fixa: ~21-24 mil tokens de restrição por
   turno, 14 gates numa cascata linear sem saída lateral, ~30 directives injetadas (metade delas
   dizendo *"escreva APENAS uma frase curta e não chame nenhuma tool"*), 8 caminhos onde o LLM **nem
   é consultado** (o servidor responde por texto pré-fabricado), um sanitizer que **apaga as
   perguntas do modelo** depois de geradas, e uma frase obrigatória *ipsis litteris*.
3. Os **testes** (45 arquivos) travaram a copy no docx com regex literais (`/r\$ 100 mil/`,
   `/quer considerar esse tipo de lance/`). Soltar o agente deixava a suíte vermelha.
4. A **rubrica do LLM-judge** pontuava `ordemCorreta` e `fidelidade ao docx` — conversa natural que
   adaptasse a ordem tirava nota baixa, e o loop de QA então gerava *mais* amarras.

O sistema **convergia pra rigidez por construção**. Resultado observado em teste manual: um agente
bitolado, que repete a mesma resposta, ignora o que o usuário diz e trava. Quando o usuário escrevia
"não entendi", um curto-circuito **anterior à chamada do modelo** devolvia uma frase fixa e repetia
a mesma pergunta do mesmo gate.

A soberania, aliás, já tinha se invertido na prática: a decisão mais recente (Rodada 10) veio do
**mockup HTML**, não do docx, e a própria jornada passou a citar `qualify-state.ts` como fonte da
ordem dos gates. Só faltava apagar o texto antigo.

## Decisão

1. **O `jornada.docx` deixa de ser regra.** `jornada-canonica.md` vira
   `docs/jornada/decisoes-do-cliente.md`: registro histórico das decisões do cliente, sem poder
   normativo. Os Passos 1-7 do docx e a auditoria de 2026-07-01 foram deletados.
2. **A referência viva passa a ser o mockup + handoff**
   (`docs/design/specs/2026-07-09-handoff-agente-vendas-consorcio/`), que já tinha sido escrito
   *"depois de mapear a arquitetura real"* — explicitamente anti-dogma.
3. **A ordem dos gates é do código** (`nextGate`), não de um documento.
4. **Separação nova, que passa a valer:**
   - **Invariante verificável** (Bevi exige CPF antes de simular; número nunca é inventado; nunca
     prometer cota reservada) → **código determinístico**. Lista fechada de 6 em
     `decisoes-do-cliente.md`.
   - **Todo o resto** (como perguntar, com que palavra, em que ordem quando o usuário puxa a
     conversa) → **é do modelo**. Não vira regra-no-prompt, nem regex de teste, nem texto fixo.
5. **Os testes passam a provar invariante, não script de fala.** Os cadeados de copy foram
   removidos e a rubrica do judge foi reescrita pra medir o que importa (não simula sem CPF, não
   inventa número, compliance, e a conversa **não se repete**).
6. **O runtime foi desamarrado** (prompt fatiado por fase, intercepts pré-LLM removidos, sanitizer
   restrito a compliance, frase canônica eliminada, directives de "1 frase" aposentadas).

## Consequências

- O agente passa a **variar a fala** e a adaptar a conversa. Isso é o produto funcionando — **não é
  regressão**. QA que reportar "o agente não usou a frase X" está usando o oráculo errado.
- Perdemos a garantia determinística de que cada frase sai idêntica ao docx. É o preço, e é o ponto.
- Os invariantes de negócio/compliance **continuam garantidos em código** — a parte que realmente
  não pode falhar não dependia do roteiro.
- Risco: uma futura falha de QA pode tentar "consertar" com uma trava nova. O `CLAUDE.md` agora
  proíbe isso explicitamente (seção "Não engesse o agente").

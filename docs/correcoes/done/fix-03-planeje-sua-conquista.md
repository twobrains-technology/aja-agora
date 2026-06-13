---
id: FIX-3
titulo: "Gate de crédito deve virar o componente dinâmico do Bernardo (4 indicadores) — e o simulador NUNCA apareceu na jornada"
status: done
rodada: 2026-06-05 manhã (teste manual em tela)
commit: 3ccf3da
executado_em: 2026-06-05
---

# FIX-3 — Gate de crédito deve virar o componente dinâmico do Bernardo (4 indicadores) — e o simulador NUNCA apareceu na jornada

**Onde acontece:** Passo 2, gate `credit`. Hoje aparece um artifact pobre:
2 sliders (Crédito R$ 20 mil / Parcela mensal R$ 500) + botão "Buscar opções".

**Problema duplo (palavras do Kairo):**
1. "Esse componente aí do crédito e da parcela mensal deveria ser o
   componente lá do Bernardo" — o slider simples de 2 linhas não é o
   conceito aprovado.
2. **"Esse outro componente do Bernardo nunca apareceu — até agora pra mim
   ele não apareceu ainda."** → o simulador dinâmico (proposta-simulador /
   simulator-offer) não surgiu em NENHUM momento da jornada no teste
   manual. Pode ser bug real de fluxo, não só questão de design —
   **investigar o porquê**.

**O que o componente deve ter (visão do Kairo, a estudar/refinar):**

4 indicadores interligados, dinâmicos:

| # | Indicador | Observação |
|---|---|---|
| 1 | **Valor do bem** | não "crédito" (ver FIX-2) |
| 2 | **Quando pretende usar o valor** | segunda linha, como um range de datas — estratégia de tempo até contemplação |
| 3 | **Parcela mensal** | |
| 4 | **Valor do lance que consegue fornecer** | |
| +5 | **Lance embutido** (talvez) | "também deveria ser um dos indicadores" — entra junto com a estratégia do tempo de contemplação |

**Comportamento:** mexeu em um indicador → os outros se movimentam juntos
("com a inteligência que você vai criar desse componente"). O lance
embutido interage com o tempo que ele quer ser contemplado.

**Posição na jornada:** "ele tem que vir AQUI, nesse momento" — ou seja, no
gate `credit` do passo 2, substituindo os 2 sliders atuais.

**Ação na execução:**
1. Estudar o componente do Bernardo já implementado (simulador do passo 4 —
   `contemplation-dial`, artifact `simulator-offer`,
   `docs/jornada/proposta-simulador.md`).
2. **Investigar por que o simulator-offer nunca apareceu** na jornada do
   teste manual (bug de trigger/gate? condição nunca satisfeita em uso
   real?). Se for bug, é fix à parte com TDD.
3. Redesenhar o artifact do gate credit nessa direção (4-5 indicadores
   dinâmicos).

**⚠️ Constraint de produto (CLAUDE.md):** o simulador é conceito do
**Bernardo** — não implementar versão FINAL sem aval dele. A sugestão do
Kairo estende o conceito; implementar como proposta e deixar registrado
que o aval do Bernardo segue pendente.

**🔄 ATUALIZAÇÃO (mesma sessão):** o componente do Bernardo **apareceu**
mais tarde na jornada — depois do detalhamento da oferta (pós-reveal,
oferta CANOPUS). Ou seja: ele existe e renderiza, mas no **lugar errado**
e com **valores suspeitos** → ver FIX-6, que detalha o reposicionamento.

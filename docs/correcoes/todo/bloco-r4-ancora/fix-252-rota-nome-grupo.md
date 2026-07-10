---
id: FIX-252
titulo: "Rota determinística nome-de-administradora → grupo exibido (recovery de escolha)"
status: todo
bloco: bloco-r4-ancora
arquivos: [src/lib/agent/orchestrator/choose-offer.ts, src/lib/agent/orchestrator/runner.ts]
rodada: 2026-07-10 rodada 4 (Fable FINAL, gap da rota nome→grupo)
---
## Gap (veredito FINAL §6 + item "pro teto" #3)
Usuário nomeia uma administradora/valor visível na tela ("quero a ITAÚ", "a de 92 mil") e o
agente resolve o grupo ERRADO (pegou 100k em vez do 92.902 nomeado). A rota determinística
nome/valor→grupo exibido não existe (o próprio commit FIX-249 registrou como fora de escopo).
## Correção
- `choose-offer.ts`/resolução: quando o usuário nomeia uma administradora OU um valor que casa
  com um grupo JÁ EXIBIDO (shown-groups), resolver determinístico pro groupId certo — não deixar
  o LLM adivinhar. Ancora sobre entidade vista em tela (action-policy).
## Regressão (TDD)
- "quero a ITAÚ" com ITAÚ na comparison_table → resolve o groupId da ITAÚ exibida.
- "a de 92 mil" → grupo 92.902 (não 100k).

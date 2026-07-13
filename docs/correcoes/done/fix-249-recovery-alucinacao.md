---
id: FIX-249
titulo: "Alucinação sem recovery = beco-sem-saída; agente promete 'te retorno' na web"
status: done
bloco: bloco-r3-serverside-cards
arquivos:
  - src/lib/agent/orchestrator/sanitizer.ts
  - src/lib/agent/orchestrator/action-policy.ts
  - src/lib/agent/system-prompt.ts
rodada: 2026-07-10 rodada 3 (Fable r2, gap NOVO N2 P0)
commit: cd71605
executado_em: "2026-07-10"
---

## Gap (veredito Fable r2, N2 — NOVO P0)
Usuário escolheu "ITAÚ" (visível na comparison_table) → agente NEGOU a existência, inventou
groupIds (guard bloqueou, correto), e terminou prometendo "te retorno" (turno proativo que a web
NÃO tem — beco-sem-saída, run inteiro morto).

## Correção
- Quando o guard bloqueia uma entidade que o usuário viu em tela, o agente deve RE-APRESENTAR as
  opções reais (recovery), não negar existência nem prometer retorno.
- `sanitizer.ts`/prompt: banir "te retorno"/"entro em contato depois"/"vou verificar e volto" na web
  (não há canal proativo web) — sempre oferecer o próximo passo no chat.

## Regressão (TDD + E2E)
- escolher uma administradora visível na tela → agente segue com ela (não nega).
- sanitizer dropa promessa de retorno proativo na web.

## Executado (escopo real)
- `sanitizer.ts`: nova barreira em código — `isProactiveCallbackClaim` dropa "te retorno"/"entro em
  contato depois"/"vou verificar e te aviso" antes de virar bolha, em qualquer canal (testado).
- `action-policy.ts`: `naoExibidoDirective`/`administradoraNaoExibidaDirective` (as diretivas que já
  disparavam quando o anchor-guard bloqueia um id/administradora fabricado) agora proíbem
  explicitamente negar a entidade e prometer retorno — reforço no ponto exato onde o guard já atua.
- `system-prompt.ts`: regra dura citando o bug real, reduzindo a chance da negação acontecer ANTES
  de qualquer tool-call (puro texto, sem passar pelo guard).

## GAP CONHECIDO (fora de escopo desta rodada — registrar pra rodada futura)
A causa-raiz mais profunda (Lei 1) não foi fechada: falta uma rota DETERMINÍSTICA que resolva o
nome da administradora citado em TEXTO LIVRE contra `shown.administradoras` e dispare o mesmo
caminho do clique (`resolveChosenOffer`/`buildChooseOfferDirective`), sem depender do LLM
"lembrar" do histórico. Isso eliminaria a negação na raiz em vez de só proibir o sintoma (a
promessa de retorno). Escopo maior que uma correção pontual — precisa de mudança no analyzer +
routing; recomendo um FIX-NN dedicado numa rodada futura.

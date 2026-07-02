# RECLASSIFICADO — "pulo do gate de prazo" é POR DESIGN; a raiz é moto sem orçamento mensal

> **Triagem contra o código (2026-07-02):** o que parecia "pulo do gate de prazo" é
> **comportamento intencional** — `qualify-config.ts:279` diz que o ValuePicker preenche
> `prazoMeses` (via intent) justamente pra o funil PULAR o gate `timeframe`. **NÃO é bug.**
> A consequência ruim que observei (recomendação sem âncora de orçamento → maior parcela →
> comparada com o lance como "teto") tem raiz REAL em: **MOTO não coleta "Orçamento mensal"
> no ValuePicker** (`system-prompt.ts:15-17` só tem imóvel/auto/serviços). Essa é a correção,
> tratada em [[2026-07-02-recomendacao-usa-lance-como-teto-orcamento]]. Este card fica como
> registro da investigação — **não gera bloco próprio.**

- **Data:** 2026-07-02 · **Achado em:** QA dono-de-produto, jornada MOTO, canal WEB, PRODUÇÃO
- **Status:** NÃO-BUG (comportamento por design) + raiz real absorvida pelo card do teto.

## Cenário (reproduzível)
Jornada moto, primeira vez. Sequência REAL observada em prod:
`nome (Kairo) → experiência (primeira vez) + educação → identify (CPF/celular) → valor do bem (R$ 25.000) → **LANCE** ("Você teria uma reserva pra dar um lance?") → valor do lance → lance-embutido → reveal`.

O gate **timeframe** ("Em quanto tempo você gostaria de estar com seu bem?" — jornada §2, opções: o mais rápido / até 6 meses / 1 ano / 2 anos+ / sem pressa) **nunca foi apresentado**. Depois do valor, o agente foi direto pro lance.

## Esperado × Atual
- **Esperado** (ordem canônica, ver card FIX-53 e docx §2): `... → credit(VALOR) → timeframe(PRAZO) → lance → lance-embutido → ...`. O usuário escolhe o prazo antes do lance.
- **Atual:** após o valor, o funil vai direto ao lance; o prazo nunca é perguntado. A recomendação assumiu 15 meses (opção de prazo mais curto → maior parcela, R$ 2.140/mês) sem o usuário ter declarado horizonte.

## Evidência
- Transcrição capturada (Playwright): após "Boa, 25 mil então." vem imediatamente "Você teria uma reserva pra dar um lance e antecipar a contemplação?" — sem pergunta de prazo entre eles.
- Screenshot do reveal: `_evidencia/moto-05-recomendacao.png` (recomendado = 15m/maior parcela).

## Dúvida aberta (epistêmica — não cravar sem código)
Duas hipóteses a verificar no código:
1. O ValuePicker (D16) do passo 2 exibiu só UM slider ("Valor do bem"); se ele deveria conter prazo/parcela interligados e degradou pra valor-solto, o gate timeframe pode ter sido considerado satisfeito por default (default de prazo ⇒ 15m).
2. Regressão do funil em prod: o gate timeframe está sendo pulado apesar de FIX-53. Confirmar se o build de prod tem a ordem de `nextGate` corrigida e por que timeframe não disparou.

## Tratamento sugerido
Confirmar via `nextGate`/orchestrator qual caminho ocorre com moto + ValuePicker de 1 slider. Se timeframe é pulado, restaurar o gate (structural em `qualify-state.sequence.test.ts` + cassette). Se o prazo é capturado pelo picker, então (a) a recomendação NÃO deveria default pro prazo mais curto sem sinal do usuário e (b) o card do "teto" continua válido.

# Handoff — Agente de Vendas (AJA AGORA)

Pacote de transferência do comportamento validado em protótipo para a aplicação agêntica existente.
Escrito **depois** de mapear a arquitetura real (FSM em código + LLM via ToolLoopAgent, cards como `present_*` → data part tipado, Bevi Trilho B ativo).

## Ordem de leitura

| # | Arquivo | Pra quê |
|---|---|---|
| 0 | `docs/00-mapa-crosswalk.md` | Cada comportamento → onde encaixa no código. **Comece aqui.** |
| 1 | `docs/01-gates-e-ordem.md` | A cadeia de gates alvo e o **conflito de ordem** que precisa mudar |
| 2 | `docs/02-cards-novos.md` | Specs dos 3 cards que não existem + o que muda nos que existem |
| 3 | `docs/03-regras-calculo.md` | **Fórmula corrigida**, embutido, parcela pós, guardrails |
| 3c | `docs/03c-implementacao-referencia.ts` | Implementação de referência pronta pra adaptar |
| 4 | `docs/04-copy-fluxos.md` | Roteiro balão-a-balão, 2 cenários (Madalena / Mario) |
| 5 | `docs/05-compliance-e-dados.md` | O que nunca dizer, o que nunca exibir, campos em standby |
| 6 | `docs/06-plano-implementacao.md` | Sequência de PRs, do mais barato ao mais caro |

## Mockups de referência (abrir no navegador)

- `mockups/aja-dois-cenarios.html` — os dois fluxos completos, com notas explicando cada jogada
- `mockups/agulha-contemplacao.html` — a agulha interativa + âncora de dinheiro

## Princípio que amarra tudo

O protótipo **não** propõe uma arquitetura nova. Ele propõe:
0. Uma **correção da curva de lance** (a atual achata os primeiros meses em 90% e nunca converge para sorteio),
1. Uma **reordenação de gates** (experience depois da busca),
2. **Três cards novos** (embutido, escassez, dois caminhos),
3. Uma **estratégia de recomendação** que respeita um guardrail de crédito líquido,
4. Uma **cadência de mensagens** (balões curtos, agrupados por ideia) e um **tom** consultivo.

Tudo isso cabe nas camadas que já existem. Nenhuma infra nova.

> ⚠️ **Comece pelo item 0.** Todo número que a agulha, os cenários e a copy exibem depende da curva. Ver `docs/03-regras-calculo.md` e PR0 em `docs/06`.

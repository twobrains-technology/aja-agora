---
id: FIX-58
titulo: "Reposicionar o simulador de contemplação para ANTES da indicação do melhor grupo + confirmar premissas antes de avançar"
status: todo
bloco: bloco-a-funil-coleta-ordem
arquivos:
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/orchestrator/artifact-guard.ts
  - docs/jornada/jornada-canonica.md
  - docs/jornada/proposta-simulador.md
  - docs/jornada/CONTEXT.md
  - tests/regression/agent-trajectory.test.ts
rodada: 2026-06-19 — jornada2_revisão.docx (decisão do stakeholder Bernardo)
---

# FIX-58 — Simulador de contemplação antes da indicação + confirmação de premissas

## Palavras do operador (docx)
> "** o simulador com foco na contemplação, que está após a indicação do melhor grupo, **Bernardo achou melhor colocar antes**, para ser mais uma opção para o cliente ter segurança de qual plano escolher."
>
> "*** quando o cliente escolhe menor parcela, etc, ou seja, responde as perguntas básicas, e temos a recomendação do grupo, **perguntar antes de avançar**: faz sentido esse valor de imóvel? Essa quantidade de meses? Quer simular algo diferente?"

## Cenário / contexto
- Hoje o simulador de contemplação aparece **depois** da indicação do melhor grupo (Passo 4, conforme `proposta-simulador.md` e `jornada-canonica.md:34-44`).
- Bernardo (stakeholder) decidiu na revisão: mover para **ANTES** da indicação do melhor grupo, como opção a mais de segurança para o cliente.
- Além disso: antes de avançar da qualificação para a recomendação, o agente deve **confirmar as premissas** com o usuário (valor do bem, quantidade de meses, abrir espaço para "quero simular algo diferente").

## ⚠️ Limite de escopo (regra de produto — CLAUDE.md)
A regra inviolável diz: "Simulador do passo 4 = conceito do Bernardo. Proposta em `docs/jornada/proposta-simulador.md` — **não implementar versão final sem o aval dele**."
- **DENTRO do escopo deste fix:** mudar a POSIÇÃO/ordem em que o agente dispara o simulador no fluxo (antes da indicação) + adicionar o passo de confirmação de premissas. Isso é mudança de ordem/fluxo, e o reposicionamento tem aval explícito do Bernardo no docx.
- **FORA do escopo (NÃO fazer):** redesenhar o simulador (novos campos, nova fórmula de cálculo, novo visual, novos cenários). Qualquer redesenho do componente precisa de aval do Bernardo e vira item próprio.
- **Não tocar** os arquivos do componente do simulador (`simulation-result.tsx`, `contemplation-dial.ts`) neste fix — esses pertencem ao Bloco B. Aqui só muda QUANDO o agente dispara (system-prompt/orchestrator) e a doc da jornada.

## Root cause / onde mexer (Explores)
- `src/lib/agent/system-prompt.ts` — a ordem do fluxo (quando apresentar o simulador vs a recomendação) é ditada aqui. Mover a etapa do simulador para antes da `present_recommendation_card`.
- `src/lib/agent/orchestrator/artifact-guard.ts` — se houver ordenação/gating de reveals que assuma "simulador depois da recomendação", ajustar.
- `docs/jornada/jornada-canonica.md` + `docs/jornada/proposta-simulador.md` + `CONTEXT.md` — atualizar a ordem documentada (simulador antes da indicação) e o passo de confirmação de premissas.

## Correção proposta
| O quê | Onde |
|---|---|
| Disparar o simulador de contemplação ANTES de apresentar o melhor grupo no fluxo do agente. | `system-prompt.ts` (ordem), `artifact-guard.ts` (gating) |
| Adicionar etapa de confirmação de premissas após a qualificação e antes da recomendação: "faz sentido esse valor? essa quantidade de meses? quer simular algo diferente?" | `system-prompt.ts` |
| Atualizar a jornada canônica e a proposta-simulador com a nova ordem e o passo de confirmação. | `docs/jornada/*` |
| Registrar a decisão de produto (reposicionamento avalizado pelo Bernardo) em ADR. | `docs/correcoes/decisions/` |

## Regressão exigida (3 camadas)
- **Camada 1:** assert no prompt/ordem que a etapa do simulador precede a `present_recommendation_card`; assert da existência do passo de confirmação de premissas. `src/lib/agent/*.fix58.test.ts`.
- **Camada 2:** cassette em `agent-trajectory.test.ts` — a ordem de tool-calls mostra simulador antes da recomendação, e a confirmação de premissas aparece antes de avançar.
- **Camada 3:** cenário canônico — assert da ordem dos artifacts.

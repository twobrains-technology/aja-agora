---
id: FIX-1
titulo: "Explicação de 'primeira vez' incompleta: falta o papel da Aja Agora + tom com mais afinidade"
status: done
rodada: 2026-06-05 manhã (teste manual em tela)
commit: af44b35
executado_em: 2026-06-05
---

# FIX-1 — Explicação de "primeira vez" incompleta: falta o papel da Aja Agora + tom com mais afinidade

**Onde acontece:** Passo 1 da jornada. Usuário clica **"É a primeira vez"**
no gate `experience` → agente explica o que é consórcio.

**O que o agente fala HOJE (print do chat):**

> "Show, primeira vez é com a gente!
>
> Consórcio é basicamente um grupo de pessoas que pagam parcelas mensais
> juntas — sem juros. Todo mês tem uma assembleia e alguém do grupo é
> contemplado por sorteio ou lance pra receber a carta de crédito e
> comprar a moto.
>
> É diferente do financiamento justamente porque não tem juros — você paga
> só uma taxa de administração, que é bem menor.
>
> Posso te fazer 3 perguntinhas rápidas pra entender seu perfil?"

**O que o docx exige (jornada-canonica.md, passo 1, ramo "se não fez consórcio"):**

| Bullet do docx | Coberto hoje? |
|---|---|
| Explicação rápida: "Consórcio é uma forma de juntar com outras pessoas para comprar um bem sem juros, com parcelas mensais. Você é contemplado por sorteio ou lance (um valor a mais que você oferece)." | ✅ coberto (com outras palavras) |
| "Todo mês você participa de sorteios e também pode antecipar sua contemplação com um lance." | ✅ coberto |
| "É bem diferente de financiamento: no financiamento você paga juros e recebe o crédito na hora. No consórcio você paga só a taxa de administração, que é bem menor, mas espera ser contemplado." | ✅ coberto |
| **"Nosso papel na Aja Agora é encontrar o grupo com maior chance de atender seu objetivo no prazo que você deseja."** | ❌ **FALTANDO — ponto principal apontado** |
| Botão: "Entendi, pode continuar" | ✅ coberto |

**Correção:**
1. Incluir o ponto do **papel da Aja Agora** na explicação de primeira vez
   ("Nosso papel na Aja Agora é encontrar o grupo com maior chance de
   atender seu objetivo no prazo que você deseja").
2. Direção de tom (pedido do cliente): **mais afinidade, mais comunicação
   com o cliente** — a explicação atual está tecnicamente correta mas seca.

**Onde mexer (provável):** diretiva/system prompt da explicação de primeira
vez (`src/lib/agent/orchestrator/directives.ts` ou system-prompt do agente).

**Regressão:** Camada 1 (âncora "papel" / "encontrar o grupo" no prompt) +
Camada 2 (cassette do turno de explicação). Rubric: criterio de fidelidade
do passo 1 já cobra os bullets — conferir se cobra o do papel da Aja Agora.

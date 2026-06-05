---
id: FIX-2
titulo: "Linguagem amigável: eliminar jargão 'crédito' / 'carta de crédito' da copy visível"
status: done
rodada: 2026-06-05 manhã (teste manual em tela)
commit: d5dc071
executado_em: 2026-06-05
---

# FIX-2 — Linguagem amigável: eliminar jargão "crédito" / "carta de crédito" da copy visível

**Onde acontece:** Em toda a jornada — evidência no print do gate `credit`:

> Pergunta do agente: "Qual faixa de **crédito** faz mais sentido pra você?"
>
> Label do slider: "**Crédito** — R$ 20 mil" (artifact com sliders
> Crédito/Parcela mensal + botão "Buscar opções").

**Pedido (veio do cliente também — o docx já usa "valor do bem"):**

1. **"crédito"** quando se refere ao valor que o usuário quer → trocar por
   **"valor do bem"**. Vale pra pergunta do gate, label do slider e
   qualquer outra menção.
2. **"carta de crédito"** → termo mais amigável que um leigo entenda.
   Kairo pediu sugestão. Propostas (decidir na execução):
   - **1ª menção (explicativa):** "a carta de crédito — o valor que você
     recebe pra comprar o seu bem"
   - **Menções seguintes:** "valor do bem" / "valor liberado" / "o valor
     que você recebe"
   - Padrão: nunca usar o jargão SECO em pergunta/label; quando o termo
     aparecer (ex.: explicação de primeira vez), acoplar a explicação.

**Escopo do replace (só copy visível ao usuário):**
- Perguntas de gates (`gate-questions.ts` — gate credit e outros)
- Label do slider do artifact de crédito (componente web)
- Recommendation card (passo 3/4), simulador (passo 4)
- Fechamento passo 5 (`closing-presentation.ts`), resumo WhatsApp
  (`contract-summary.ts`)
- WhatsApp formatter (`src/lib/whatsapp/formatter.ts`)
- System prompt / diretivas do agente

**⚠️ NÃO tocar:** código interno, schema do DB, payloads da API Bevi
(`creditValue`, `creditMin`/`creditMax` etc.) — só o que o usuário lê.

**Regressão:** Camada 1 (asserts das âncoras novas; assert NEGATIVO de que
pergunta/label não contêm o jargão seco) + atualizar `jornada-rubric.ts`
se citar "crédito" como âncora. Camada 2 se houver cassette afetado.

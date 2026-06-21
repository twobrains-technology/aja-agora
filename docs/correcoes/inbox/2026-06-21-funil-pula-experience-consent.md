# Bug — funil pula o passo 2 (experiência + consent) quando o usuário diz o valor cedo

- **Data:** 2026-06-21 · **Achado em:** QA noturno E2E browser (rodada 2026-06-21-0812) · **Superfície:** funil de qualificação (chat web)
- **Severidade:** alta — afeta o caminho MAIS comum da jornada (a landing incentiva o usuário a já dizer o valor).

## Cenário (reproduzível no browser)
1. Landing → composer "Conte o que você quer conquistar" → digitar **"Quero comprar um carro de uns 80 mil, gastando perto de 850 por mês"** → Enviar.
2. Concierge categoriza → especialista Rafael pede o nome (gate `name`). ✓
3. Responder o nome ("Helena") → confirmar.
4. **Esperado (jornada-canonica §2):** o agente pergunta *"Você já participou de um consórcio antes?"* (gate `experience`); se não, dá a explicação rápida + botão *"Entendi, pode continuar"* (gate `consent`); só **depois** disso pede CPF/celular (identidade).
5. **Atual:** logo após o nome, o agente já dispara o **card de identidade (CPF + celular + LGPD)**. Os gates `experience` e `consent` **nunca aparecem**.

## Evidência (DB — conversa `1de8fd53-cd32-4cbd-92a6-cec30dd1befb`)
Mensagens do usuário: só `"...carro de uns 80 mil, gastando perto de 850 por mês"` e `"Pode me chamar de Helena"`. Mesmo assim, `metadata` já contém:
- `experiencePrev: "returning"` ← usuário **nunca** disse que já fez consórcio
- `qualifyConsented: true` ← usuário **nunca** consentiu/clicou "Entendi"
- `qualifyAnswers.prazoMeses: 24` ← usuário **nunca** disse prazo (disse parcela 850/mês) — *observação secundária, ver abaixo*

## Causa raiz (determinística, não-LLM)
`src/lib/agent/orchestrator/analyze.ts:100-107`:
```ts
if (extractedQualifyField && !meta.qualifyConsented) { meta.qualifyConsented = true; }
if (extractedQualifyField && !meta.experiencePrev)   { meta.experiencePrev = "returning"; }
```
Qualquer valor/prazo/lance extraído de texto livre (`extractedQualifyField`) crava `experiencePrev="returning"` e `qualifyConsented=true`. O `nextGate` (qualify-state.ts:33,36) então pula `experience` e `consent` e cai em `identify` (linha 52).

Confronto com a jornada (regra inviolável #1): o passo 1 já prevê que o usuário disse objetivo+valor; o passo 2 (pergunta de experiência + explicação) é uma etapa **sequencial obrigatória**, não condicionada a "não ter dito valor". Defaultar para `"returning"` é a escolha de risco errada num produto B2C de massa cujo público é majoritariamente **leigo de primeira viagem** — esconde a explicação justamente de quem precisa dela.

## decidido (§4.3.1 — reversível)
**Opção tomada:** remover os dois auto-sets (linhas 100-107). A extração dos dados (valor/prazo/lance) **permanece** — não se re-pergunta o valor; só não se pula mais o passo 2. `experiencePrev` volta a ser preenchido só pelo classifier (sinal explícito) ou pela resposta do gate; `qualifyConsented` só pelo clique do botão ("Entendi, pode continuar") ou afirmação curta (analyze.ts:109-118, preservado).
**Por quê:** alinha ao passo 2 do docx; default seguro = perguntar, não presumir veterano. **Reversível** em 1 commit se o stakeholder preferir o atalho de fricção.

## Observação secundária (não corrigida aqui)
`prazoMeses=24` apareceu sem o usuário dizer prazo — provável over-extraction do classifier LLM (`turn-analyzer`) a partir de "850 por mês". Não-determinístico → fora deste fix determinístico. Anotado para investigar (cassette/eval) se reincidir.

## Regressão (TDD)
- Camada 1 (determinística): teste de `analyzeAndMerge` provando que `analysis.experiencePrev=null` + valor extraído **não** vira `experiencePrev="returning"` nem `qualifyConsented=true`; e `nextGate` do meta resultante = `"experience"`.

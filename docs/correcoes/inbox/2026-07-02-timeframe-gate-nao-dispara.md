---
slug: timeframe-gate-nao-dispara
titulo: "Gate de prazo (timeframe) não dispara na jornada AUTO — usuário nunca escolhe o prazo"
status: inbox
severidade: media
projeto: aja-agora
rodada: 2026-07-02 — QA dono-de-produto, AUTO web contra PRODUÇÃO (ajaagora.com.br)
evidencia:
  - _evidencia/auto-web-recomendacao.png
mexe_em:
  - src/lib/agent/qualify-state.ts
  - src/lib/agent/turn-analyzer.ts
  - src/lib/agent/qualify-config.ts
---

## Palavras do operador
> "Percorra os passos 1→6 validando cada critério de aceite do roteiro."

## Cenário
- **Rota/tela:** https://ajaagora.com.br — chat AUTO.
- **Passos:** texto puro "…R$ 70 mil, gastando perto de R$ 900 por mês." (valor + orçamento mensal, **sem** prazo) → nome → "Já conheço" → "Bora!" → CPF → lance → recomendação.
- **Dados usados:** CONTA1.

## Esperado × Atual
- **Esperado:** como o texto não cita prazo, o gate **timeframe** deve disparar — jornada-canonica §2: "Em quanto tempo você gostaria de estar com seu bem?" (mais rápido · até 6 meses · 1 ano · 2 anos+ · sem pressa). É o comportamento que o fix `2026-06-21-analyzer-infere-prazo-de-orcamento` garantiria (prazoMeses=null → nextGate=timeframe).
- **Atual:** o gate de prazo **não apareceu** em nenhum momento. A sequência foi nome → consórcio-antes → "3 perguntinhas" → CPF → lance → resultados. O usuário nunca escolheu o prazo; a recomendação saiu com prazo 117m sem confirmação.

## Pista de causa (A CONFIRMAR — não investigado a fundo)
Possível regressão do fix de 2026-06-21, OU a reordenação do funil (CPF antecipado / "Já conheço") realocou/suprimiu o gate `timeframe`. Confirmar no `qualify-state.ts` (`nextGate`) se `timeframe` ainda está na sequência do path AUTO e se `prazoMeses` ficou de fato null neste run. Relacionado: [[2026-06-21-analyzer-infere-prazo-de-orcamento]], [[2026-06-21-prompt-ordem-gates-pre-valor]].

## Nota de copy (melhoria, não bug)
O agente diz "Posso te fazer **3 perguntinhas rápidas** pra entender seu perfil?" e o "Bora!" leva direto ao gate de **CPF** (identidade), não a perguntas de perfil. A expectativa criada não bate com o que vem.

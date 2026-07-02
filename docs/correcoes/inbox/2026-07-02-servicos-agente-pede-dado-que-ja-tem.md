---
slug: servicos-agente-pede-dado-que-ja-tem
titulo: "Agente pede à cliente que relembre parcela/prazo que ELE mesmo mostrou, no card de decisão (perda de estado da oferta)"
status: inbox
severidade: media
projeto: aja-agora
rodada: 2026-07-02 — QA dono-de-produto, jornada SERVIÇOS, canal WEB, produção
evidencia: []
mexe_em:
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/orchestrator/directives.ts   # etapa de decisão/fechamento — deveria ancorar a oferta no contexto, não perguntar
---

## Palavras do operador
> (QA autônomo) "No card 'Esse plano faz sentido para você?', a Camila escreveu: 'Mirella, me conta: quando você viu a simulação da Âncora antes, qual era o valor da parcela e o prazo que apareceu? Assim consigo te mostrar o resumo completo certinho antes de fechar.' Ela tá pedindo pra CLIENTE lembrar os números que o próprio sistema calculou e mostrou."

## Cenário
- **Rota/tela:** chat, card de decisão (passo 4 canônico) logo antes do fechamento
- **Passos:** recomendação ÂNCORA → simulação → "quero contratar" → aparece o card de decisão com os 3 botões E o texto pedindo os números de volta
- **Dados usados:** ÂNCORA, parcela/prazo já exibidos anteriormente na mesma conversa

## Esperado × Atual
- **Esperado:** o agente já tem parcela (R$ 385,30) e prazo (97m) ancorados no contexto/estado da conversa; deveria apresentar o resumo direto, sem pedir nada à cliente.
- **Atual:** o agente pergunta à cliente qual era a parcela e o prazo "que apareceu" — pede um dado que é dele. Quebra de confiança ("vocês não sabem o que me ofereceram?") e fricção no momento mais crítico (fechamento).

## Pista de causa (A CONFIRMAR)
Sintoma clássico de **entidade não-ancorada** (lei de arquitetura de IA): a oferta escolhida não está sendo carregada no estado/prompt da etapa de decisão, então o modelo "improvisa" pedindo o dado. Olhar como a directive de decisão/fechamento recebe (ou não) o snapshot da oferta recomendada. Candidato a regressão nas 3 camadas (structural + cassette) — é bug de comportamento de agent.

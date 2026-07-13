---
data: 2026-07-10
origem: Fable r8 (matador-pra-prod, dívida "antes de escalar")
severidade: P1 (antes de ESCALAR, não de deployar)
---
# Loop de empty-turn no intent wants_more_options
No intent `wants_more_options`, logo após o agente PROMETER a busca, capturei ao vivo (2/2
reproduzível) um loop de empty-turn: `finishReason="length"`, ~50s, copy IDÊNTICA repetida.
FIX-271 (empty-turn roda o resolver) entrou mas não cobre este caminho (não é menção de oferta —
é "quero ver mais opções"). Na web tem escape (botões); no WhatsApp texto-only NÃO tem escape.
**DÚVIDA ABERTA declarada pelo Fable: reproduzir no canal WhatsApp antes de ESCALAR.**
Provável fix: quando o agente promete busca e o próximo turno vem length/empty, disparar a busca
determinística (não re-perguntar) OU cap de repetição de fallback idêntico.

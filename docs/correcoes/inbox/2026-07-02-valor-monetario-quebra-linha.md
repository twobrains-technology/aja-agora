---
slug: valor-monetario-quebra-linha
titulo: "Evitar quebra de linha no meio do valor monetário ('R$ 1.' / '863,32') na copy da recomendação"
status: inbox
severidade: baixa
projeto: aja-agora
rodada: 2026-07-02 — QA dono-de-produto, jornada IMÓVEL, canal WEB, PRODUÇÃO (https://ajaagora.com.br)
evidencia:
  - _evidencia/numeros-recomendacao-vs-carta-recomendacao.png
mexe_em:
  - src/lib/agent/system-prompt
  - src/components/chat
---

## Palavras do operador
> (Achado do QA dono-de-produto, rodada automatizada em produção.)
> "O valor 'R$ 1.863,32' aparece quebrado em duas linhas: 'A parcela de R$ 1.' e depois '863,32/mês...'. Fica feio e por um instante parece que a parcela é R$ 1."

## Cenário
- **Rota/tela:** https://ajaagora.com.br → jornada imóvel → mensagem de recomendação (texto do agente, mobile 390px)
- **Passos:** ao chegar na recomendação, o parágrafo do agente exibe "A parcela de R$ 1." no fim de uma linha/bolha e "863,32/mês representa 93,17%..." no começo da seguinte.
- **Dados usados:** viewport mobile 390×844.

## Esperado × Atual
- **Esperado:** valor monetário nunca quebra no separador de milhar; "R$ 1.863,32" fica íntegro (ex.: `white-space: nowrap` / non-breaking no número, ou o LLM não emitindo o número partido em tokens/parágrafos separados).
- **Atual:** o número quebra na linha após o ponto de milhar. Na extração do DOM o valor aparece inclusive em parágrafos separados ("A parcela de R$ 1." / "863,32/mês..."), sugerindo split no streaming/render além do wrap visual.

## Pista de causa (A CONFIRMAR — não investigado a fundo)
Duas hipóteses: (a) wrap CSS quebrando no `.` do milhar; (b) o texto do agente sendo segmentado em parágrafos no meio do número (streaming/markdown). Confirmar no render da bolha de texto. Cosmético, mas afeta a percepção do número que é o ativo mais sensível da tela.

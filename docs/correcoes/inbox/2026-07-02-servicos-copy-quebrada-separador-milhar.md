---
slug: servicos-copy-quebrada-separador-milhar
titulo: "Corrigir número 'R$ 25.000,00' quebrado em dois parágrafos no separador de milhar (notice de ajuste da simulação)"
status: inbox
severidade: media
projeto: aja-agora
rodada: 2026-07-02 — QA dono-de-produto, jornada SERVIÇOS (viagem R$ 25 mil), canal WEB, produção
evidencia:
  - _evidencia/servicos-recomendacao-simulacao.png
mexe_em:
  - src/lib/agent/tools/ai-sdk.ts   # creditAdjustmentNotice (msg com fmt() do valor)
  # provável split de parágrafo por "." no render de markdown/frases do notice
---

## Palavras do operador
> (QA autônomo) "O valor 'R$ 25.000,00' aparece partido: um parágrafo termina em '...um pouco acima dos R$ 25.' e o próximo começa com '000,00 que você mencionou.' O ponto de milhar quebrou a frase em dois."

## Cenário
- **Rota/tela:** chat, bloco da simulação detalhada da ÂNCORA (aviso de ajuste de valor)
- **Passos:** chegar na recomendação → expandir/ver a simulação detalhada → ler o parágrafo "Importante avisar…"
- **Dados usados:** viagem R$ 25.000, grupo nominal R$ 36.000

## Esperado × Atual
- **Esperado:** "…um pouco acima dos R$ 25.000,00 que você mencionou." numa frase única.
- **Atual:** dois parágrafos separados — `p1: "...um pouco acima dos R$ 25."` / `p2: "000,00 que você mencionou."` — o "R$ 25.000,00" foi cortado no ponto do milhar, provavelmente por um split de sentença que trata "." como fim de frase.

## Pista de causa (A CONFIRMAR)
O texto do `creditAdjustmentNotice`/mensagem da simulação passa por um splitter de sentenças que quebra em "." — o separador de milhar do `fmt()` (25.000) casa o padrão e parte o parágrafo. Olhar onde a mensagem é fatiada em parágrafos no render do chat, ou proteger números formatados antes do split.

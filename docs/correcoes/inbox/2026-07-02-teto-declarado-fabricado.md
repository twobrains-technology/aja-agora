---
slug: teto-declarado-fabricado
titulo: "Parar de afirmar '% do seu teto declarado' quando o cliente não declarou orçamento mensal"
status: inbox
severidade: alta
projeto: aja-agora
rodada: 2026-07-02 — QA dono-de-produto, jornada IMÓVEL, canal WEB, PRODUÇÃO (https://ajaagora.com.br)
evidencia:
  - _evidencia/teto-declarado-simulador.png
mexe_em:
  - src/lib/agent
  - src/lib/agent/system-prompt
---

## Palavras do operador
> (Achado do QA dono-de-produto, rodada automatizada em produção.)
> "O agente diz 'R$ 1.863,32/mês representa 93,17% do seu teto declarado', mas a cliente nunca declarou teto/orçamento nenhum nessa jornada."

## Cenário
- **Rota/tela:** https://ajaagora.com.br → jornada imóvel → mensagem da recomendação BANCO DO BRASIL
- **Passos:** jornada imóvel percorrida SÓ por botões/artefatos: nome, "É a primeira vez", CPF/celular, valor do bem R$ 300.000, lance, lance embutido. **Em nenhum momento foi coletado um orçamento/teto mensal.** Mesmo assim a recomendação afirma: "A parcela de R$ 1.863,32/mês representa **93,17% do seu teto declarado**".
- **Dados usados:** CONTA2 homolog (Mirella). Fluxo 100% por artefato (não digitei texto livre com orçamento).

## Esperado × Atual
- **Esperado:** o agente só cita "teto/orçamento declarado" se o cliente **efetivamente declarou** um. Sem orçamento coletado, ou não menciona percentual de teto, ou pede o orçamento antes. Não ancorar afirmação numérica em dado inexistente (mesma classe do "36/mês fabricado" — memória `project_aja_tela_recomendacao_dados_reais`).
- **Atual:** afirma "93,17% do seu teto declarado" com um teto que a cliente nunca informou (93,17% de 1.863 ⇒ teto ≈ R$ 2.000, aparentemente default/alucinação). Dado não-ancorado apresentado como fato ao cliente.

## Pista de causa (A CONFIRMAR — não investigado a fundo)
O gerador da copy de recomendação assume a existência de um `budgetMax`/teto sempre presente e calcula o percentual mesmo quando o valor é default/ausente. Confirmar onde a mensagem de recomendação monta o "% do teto" e blindar: só emitir se o orçamento foi realmente coletado (allowlist de campo ancorado, não default). Relacionado a `2026-06-21-analyzer-infere-prazo-de-orcamento` (mesma família: agente tratando orçamento como dado presente/derivável).

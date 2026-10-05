---
slug: assertividade-do-agente-degradou
titulo: "Assertividade do agente caiu: condução entregue 0,56 hoje contra 0,90 da base"
status: done
severidade: alta
projeto: aja-agora
rodada: 2026-10-02 — medição de produção (Langfuse + banco) sobre a suspeita levantada na call de 01/10
evidencia:
  - (medido em produção — ver Números)
mexe_em:
  - src/lib/chat/ (motor de estado/turno)
  - src/app/api/chat/route.ts
  - src/lib/agents/ (prompt/diretriz)
---

## Palavras do operador
> "teve alguma degradacao muito loca ai, relacionada a assertividade do agente, preciso que voce veja" (Kairo, 02/10 12:15)
> "para mim isso tem que fazer alguma degradação relacionada a esse ajuste que a gente fez aqui do AB" (Kairo, 01/10 11:47:45)
> "teve uma hora que ele parou de responder. Está meio lentinho também" (Kairo, 01/10 11:58:08)

## Cenário
- **Rota/tela:** produção (ajaagora.com.br), agente conversacional web; janela 30/09 → 02/10
- **Passos:** score `conducao_entregue` por turno (Langfuse) + diálogo/estado no banco de produção
- **Dados usados:** conversas reais (web); sem PII exposta

## Esperado × Atual
- **Esperado:** `conducao_entregue` no patamar da base (**104/116 = 0,90**) e nunca repetir pergunta já respondida.
- **Atual:** **hoje 9/16 = 0,56** (p≈0,003 contra a base). Concentrado em `db26cd54` (5 turnos), `7b5082a1` (1), `9b30b5ac` (1).
  - agente pergunta "quanto você quer investir/quanto você tem em mente" **já tendo o crédito**: 10-02 10:55 (`7b5082a1`, crédito 200.000) e 11:03 (`db26cd54`, crédito 198.000);
  - **duas respostas com ZERO texto**, só card: 10-02 11:05:20 e 11:07:15 (`db26cd54`, `financing_comparison`) — é o "parou de responder" que o dono viu;
  - **mesma pergunta repetida 3×**: 30/09 12:16/12:18/12:20 (`576e5b66`) e 14:45/14:47/14:49 (`ef18fd09`), texto "Já tem algum modelo em mente? Se ainda não, me diz o valor do bem…";
  - reconciliação acusa **`venda_prometida_sem_proposta` em 15/15** conversas da janela, e `funil_parado_pre_decisao` nas 3 de hoje;
  - falas "muito curtas" (`[Show]`, `[Boa!]`) subiu de 0-2/dia para 4 no dia 02.

## Pista de causa (A CONFIRMAR — não investigado a fundo)
⚠️ **A hipótese "foi o A/B" NÃO fecha por data para a repetição**: as repetições de 30/09 são de 12:16-12:20, e o
FIX-403 (A+B) subiu 30/09 ~12:36 — a repetição é **anterior**. Nada entrou na main depois de 30/09, então o degrau de
hoje precisa ser **datado por série diária** antes de qualquer culpado. Onde olhar: o motor de estado do turno
(metadata tem `gateStuckTurns`, `discoveryEmptyStreak`, `nameCardAdiado`, `retomada`, `navigationStack`,
`qualifyAnswers.creditMentionedAtDesire`) e a diretriz do agente. **Falta provar**: (a) a série diária do score para
datar o degrau; (b) qual caminho produz turno sem texto; (c) se `creditMentionedAtDesire` está sendo lido como crédito
no turno seguinte. Amostra de hoje é pequena (16 turnos) — não superinterpretar.

---
slug: higiene-conversas-de-teste
titulo: "Limpeza dos testes: 43 conversas marcadas is_simulated (saem do funil e da régua)"
status: done
severidade: media
projeto: aja-agora
rodada: 2026-10-02 ~14:20 — ordem do dono ("marque as do teste de ontem como teste e tire do histórico")
evidencia:
  - _evidencia/conversas-de-teste-snapshot-2026-10-02.txt
mexe_em:
  - operação (produção, `conversations` + `leads`.is_simulated) — sem mudança de código
---

## Palavras do operador
> "quero por favor que voce pegue as conversas e marque as do teste de ontem como teste e tire do historico. preciso limpar os testes la para nao termos problemas."
> "as que tem o numero do whatsapp da bruna, o meu, do gusatvo ou de qualquer um do grupo. ou qualquer conversa."

## O que foi feito (produção, 02/10 ~14:20)
`update conversations set is_simulated = true` **+** `update leads set is_simulated = true` nas conversas cujo critério é **prova**:

1. **telefone da equipe** — Kairo `…92496793` (+ `…93336547`, `…91761174`), Bruna `…98306550`, Gustavo `…64042130` (18 conversas);
2. **nome** "Teste"/"QA" e "Kairo…"/"Bruna Perrotta…" (25 conversas);
3. **webCookie** — o mesmo navegador das conversas com telefone da equipe, e os cookies das rajadas de teste de 30/09 (variante `C`, que só existia no QA) e da call de 01/10 11:40-11:51 (21 conversas do período).

Estado: **43 marcadas** (t) e 308 normais (f) no banco. Snapshot do "antes" em `_evidencia/conversas-de-teste-snapshot-2026-10-02.txt`.
Efeito: saem do funil (o painel filtra `is_simulated=false`) e a régua as exclui pelo motivo `teste` — sem apagar nada.

## NÃO marcadas — **confirmado pelo dono em 02/10 ~14:30: são LEAD REAL, não teste**
As 3 conversas web de hoje de manhã *são tráfego*, não teste — e são exatamente as que sustentam a queda de condução medida hoje:
- `…3b58a467` 02/10 10:54 "Guilherme" fone `11959667633` (24 msgs)
- `…737994b3` 02/10 10:56 anônima (31 msgs)
- `…22b6b50b` 02/10 11:08 "Fernando" fone `11999450952` (14 msgs)

**Consequência:** o degrau de condução de 02/10 (`9/16 = 0,56`) é **real e atingiu lead real** — não é ruído de QA.
Isso sobe a prioridade do card `2026-10-02-assertividade-do-agente-degradou` e tira a hipótese "amostra suja". Três leads
com telefone conhecido ficaram sem condução — dá para o time recuperar ativamente, se o dono quiser.

Também fora: `Vanda Lopes Dos Santos` (**lead real**, WhatsApp, recebeu a régua em 01/10), as web anônimas de
30/09-02/10 sem cookie de teste (7) e antigas com nomes comuns ("Gustavo" sem telefone, "Felipe", "Eduardo").

## Pista / pendência
As três de 10:54-11:08 são **lead real** (confirmado pelo dono): a degradação atingiu lead, o que muda a prioridade — o score
deve ser apurado com `is_simulated=false` para separar teste de real, e a série por dia precisa datar o degrau. A marcação
das 43 é reversível: o snapshot permite desfazer id a id.

---
id: FIX-5
titulo: "Opt-in de WhatsApp perdido no meio do turno: 2 perguntas numa mensagem, sem como responder"
status: done
rodada: 2026-06-05 manhã (teste manual em tela)
commit: 1a70230
executado_em: 2026-06-05
---

# FIX-5 — Opt-in de WhatsApp perdido no meio do turno: 2 perguntas numa mensagem, sem como responder

**Onde acontece:** Qualificação (entre gate `lance` e `lance-value`),
canal web.

**O que o agente despejou num ÚNICO turno (print):**

> "Boa, lance acelera bastante a contemplação!
>
> Kairo, pra eu conseguir puxar as opções reais de grupo pra você, o
> sistema precisa confirmar sua identidade antes.
>
> Posso anotar seu WhatsApp? Assim a gente já garante seu acesso e eu te
> mando as opções na hora.   ← PERGUNTA 1 — sem chip/botão pra responder
>
> Boa! E qual valor aproximado você pensa em dar de lance?"  ← PERGUNTA 2
> [Até R$ 2 mil] [Uns R$ 4 mil] [Uns R$ 6 mil] [R$ 8 mil ou mais]

**Problemas (palavras do Kairo: "ficou perdida, meio que deu 2 perguntas
numa mesma, sem opção do cara responder, ficou meio estranho"):**

1. **Duas perguntas no mesmo turno** — a do WhatsApp fica órfã: os chips
   renderizados são do gate `lance-value`, o usuário não tem como
   responder o opt-in.
2. **"Boa!" emendado** — o agente parece responder a si mesmo entre as
   duas perguntas.
3. **Meta-narrativa fora de hora** — "o sistema precisa confirmar sua
   identidade antes" no meio da qualificação, adiantando assunto do
   `identify` sem concluir nada.
4. **Suspeita de regressão/variante do BUG-OPTIN-ENGOLE-GATES** — o guard
   (`whatsapp-optin-guard`, `meta.revealCompleted !== true`) deveria
   suprimir opt-in pré-reveal; aqui o TEXTO do opt-in vazou no meio do
   turno do gate (o guard segura o artifact, mas não o texto?).

**Regra a estabelecer:** 1 turno = 1 pergunta acionável. Opt-in de
WhatsApp tem hora certa (pós-reveal, conforme guard) e quando aparecer
precisa de UI própria de resposta.

**Ação na execução:**
1. Cassette (Camada 2) com detector: turno de gate contendo "Posso anotar
   seu WhatsApp?" (ou >1 pergunta) = FAIL.
2. Investigar por que o texto vazou apesar do guard (guard atua no
   artifact/optin estruturado, mas o modelo improvisou em texto livre?).
3. Fix provável: regra no prompt ("NUNCA pedir WhatsApp junto de outra
   pergunta / antes do reveal") + verificação determinística se couber.
4. Camada 1: assert da regra no system prompt.

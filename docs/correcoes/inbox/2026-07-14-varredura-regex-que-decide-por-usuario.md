---
titulo: "Varrer TODO regex que decide no lugar do usuário (ou no lugar do modelo)"
status: inbox
origem: Kairo, 2026-07-14 (durante o FIX-357)
severidade: alta
---

# Varredura: regex que classifica intenção

## Palavras do Kairo

> "esse tipo de coisa burra aqui porque esta acontecendo? tem alguma trava em regex,
> o codigo nao eh agentico?"
>
> "depois vamos investigar tudo que tem regex, quero que valide, pra mim isso nao faz
> sentido algum. nao podemos ter esse tipo de coisa burra no codigo"

## O que motivou (o caso provado — FIX-357)

No WhatsApp, o turno do usuário era interceptado por regex **antes de chegar no modelo**.
O `CANCEL_RE` do fechamento varria palavras soltas:

```
/\b(n[ãa]o|outras?|outra op|ver mais|mais op|compar|cancel|depois|espera|talvez)\b/i
```

Cliente digita **"por que essa e não outra?"** → casa com `não` **e** com `outra` → lido como
**RECUSA** → o sistema **cancelou a contratação de quem só queria uma explicação**.

E no `identify`, o FIX-217 mandava interceptar *todo* texto e reemitir o pedido de CPF sem
nunca chamar o LLM — havia até um teste versionado chamado *"pergunta livre → ask-cpf, sem
abrir conversa livre"*. Um cadeado testando o cadeado.

## Root cause (a classe, não o caso)

A Lei 4 ("invariante crítico vira código, não regra-no-prompt") foi aplicada ao **alvo
errado**. O invariante é sobre a **AÇÃO** — "não consulte o bureau sem aceite explícito",
"não simule sem CPF". Nunca sobre a **FALA** — "não deixe o cliente perguntar".

Um regex de intenção é um classificador feito à mão: não entende, só varre substring. Ele é
aceitável pra **extrair um dado com formato** (CPF, telefone, valor) e é péssimo pra
**inferir o que a pessoa quis dizer**. Onde ele decide intenção, ele erra — e como está
*antes* do modelo, ele erra **calado**, com early-return.

Prova de que o cadeado era redundante: `tool-policy.ts:147` já só entrega `search_groups` e
os cards do reveal ao modelo quando `identityCollected === true`. Sem CPF o modelo **não tem
a ferramenta** — não é uma regra que ele possa desobedecer. O regex era um cadeado numa porta
já soldada, e o que ele de fato fazia era engolir as perguntas do cliente.

## Escopo da varredura

Separar todo regex do `src/lib` em duas pilhas e tratar diferente:

| Pilha | Exemplo | Veredito |
|---|---|---|
| **Extrai dado com formato** | `extractCpf`, `normalizeCelularBR`, parse de valor | **Fica.** É parsing, não julgamento. Cobrir com teste de borda. |
| **Classifica INTENÇÃO / decide pelo usuário** | `CANCEL_RE`/`AFFIRM_RE`, `detectBackIntent`, `detect-name-turn`, `routing`, `navigation`, `lead-collection`, `choose-offer`, `analyze` | **Suspeito.** Cada um: ou some (quem decide é o modelo), ou vira guarda **só da ação irreversível**, nunca da fala. |

Arquivos a auditar (levantados em 2026-07-14, `src/lib`, fora de teste):

- `src/lib/agent/orchestrator/detect-name-turn.ts`
- `src/lib/agent/orchestrator/routing.ts`
- `src/lib/agent/orchestrator/navigation.ts`
- `src/lib/agent/orchestrator/analyze.ts`
- `src/lib/agent/orchestrator/lead-collection.ts`
- `src/lib/agent/orchestrator/choose-offer.ts`
- `src/lib/agent/orchestrator/sanitizer.ts` (já limitado a compliance — reconferir)
- `src/lib/agent/parse-asset-value.ts`
- `src/lib/leads/contact-capture.ts`
- `src/lib/chat/recovery.ts`
- `src/lib/consorcio/value-picker-link.ts`
- `src/lib/whatsapp/processor.ts` (`detectBackIntent`, `handlePendingHandoffText`)

## Critério de aceitação

1. Nenhum regex dá **early-return no turno do usuário** por interpretar intenção. Se o texto
   não é um dado com formato reconhecível, **vai pro modelo**.
2. Todo guard que sobra protege **ação irreversível** (bureau, proposta, pagamento, handoff),
   e nunca a fala.
3. Regressão: pra cada regex de intenção que sobreviver, um teste com uma **pergunta** que
   contenha as palavras-gatilho — provando que a pergunta não é confundida com a resposta.

## Refs

- FIX-357 (commit `672b675b`) — o caso concreto, já em prod
- ADR `docs/decisoes/blocos/2026-07-13-revoga-jornada-soberana-desamarra-agente.md`
- `CLAUDE.md` → "Inviolável — NÃO engesse o agente"

# Aja Agora

Agente conversacional de **vendas de consórcio**, em dois canais: web (chat com cards) e WhatsApp.
Ele conversa, qualifica, busca ofertas reais na administradora (Bevi) e fecha contrato.

## O alvo

Um **vendedor humano que entende de consórcio**: consultivo, conduz a conversa, reage ao que a
pessoa contou, trata objeção ("é demorado", "e se eu não for contemplado", "melhor financiamento"),
explica lance/contemplação/taxa como quem sabe, e fecha. Não é um formulário com balões.

## A única regra que importa

**Invariante verificável vira código. Conversa é do modelo.**

- Verificável (a Bevi exige CPF antes de simular; número vem de tool, nunca da cabeça do modelo;
  nada de "cota reservada" antes da contratação) → **código determinístico**.
- Todo o resto — como perguntar, com que palavra, com que empatia, em que ordem quando o cliente
  puxa pro lado — → **é do modelo**. Não vira regra-no-prompt, não vira texto fixo no servidor,
  não vira teste de regex.

### Achou uma fala ruim em produção. Agora o quê?

Este é o ponto onde a regra acima era mais desobedecida, justamente por quem estava tentando
obedecê-la: vê-se uma frase feia no banco, ela É verificável (está lá, dá pra dar `grep`), e o
reflexo é escrever um guard. **Poder dar grep numa frase não a torna um invariante.**

O teste de decisão, nesta ordem:

1. **Existe um FATO no servidor que a fala contradiz?** ("a busca travou" com a busca tendo
   rodado; "sua cota está reservada" com `bevi_proposals = 0`.) → guard determinístico **ancorado
   nesse estado**, como `isPrematureReservationClaim(seg, ctx)`, que consulta `ctx.hasProposal` e
   deixa a MESMA frase passar quando a proposta existe. Guard sem âncora de estado é lista de
   frase disfarçada.
2. **O dado vai para o banco, para a Bevi ou para a mesa?** (nome do lead, valor do bem, ordem do
   funil, entrega ao atendente.) → código, e teste de integração de verdade.
3. **É tom, repetição, fluidez, "soou robótico"?** → **Langfuse**. Juiz LLM + score sobre volume
   real, olhando a distribuição. Não é código, não é regex, não é teste unitário.

**O anti-padrão, para reconhecer quando estiver fazendo:** você colhe uma frase da produção,
escreve um regex que casa com ela, escreve um teste com a sua própria lista de strings e ele fica
verde. O teste mede o seu regex contra a sua lista — não contra o que o modelo dirá amanhã. Na
paráfrase seguinte ("tive um problema" → "estou com dificuldade técnica" → "deu uma travadinha")
você escreve a segunda rodada, e a terceira. Isso não converge: o espaço de frases é infinito, e
`advance.ts` já registra a mesma conclusão pelo lado da ancoragem de escolha ("não se fecha porta
a porta — fecha-se a parede").

E o pior efeito: **amordaçar a frase costuma esconder um sintoma verdadeiro**. Quando o agente diz
"não consigo acessar as ofertas", em geral ele está mesmo sem as ofertas no contexto — dropar a
frase não devolve o dado a ele, só deixa o cliente sem explicação. Conserte a causa (o contexto, o
estado, a tool), não a frase.

Aconteceu em 2026-08-12, três rodadas seguidas, e foi revertido em `649320dc`.

**Falar de prazo de contemplação é do vendedor** (decisão do Kairo, 2026-08-10). Antes havia
aqui "nada de prometer contemplação garantida ou prazo", e isso saiu: travar o assunto tira do
agente um argumento que todo vendedor de consórcio usa — que lance antecipa, que grupo curto
costuma girar mais rápido. Estimar, comparar e sugerir é o trabalho dele. O que continua valendo
é **coerência**: o número que ele citar tem que sair de tool/dado real, não da cabeça do modelo
(isso já é a primeira regra). Vender é o objetivo; a trava não pode ser o obstáculo.

O agente já foi engessado uma vez e virou um robô que respondia sempre a mesma coisa. Se a conversa
sair ruim, a primeira hipótese é **prompt/contexto ruim ou trava demais** — não "falta uma trava".

## Português correto

Todo texto que o cliente vê (agente, UI, botão, erro, e-mail, template) em português com acento,
cedilha e til. Acento faltando é defeito de entrega.

## Onde as coisas estão

| O quê | Onde |
|---|---|
| Runtime (único) | LangGraph — `src/lib/agent/langgraph/` — `graph.ts` é a topologia |
| Directives/cards/tool-policy (compartilhado com o grafo) | `src/lib/agent/orchestrator/` |
| Ordem do funil | `nextGate` em `src/lib/agent/qualify-state.ts` — **o código é a fonte** |
| Tools por fase | `src/lib/agent/orchestrator/tool-policy.ts` |
| Prompt | `src/lib/agent/system-prompt.ts` |
| Sonda de variância de fala | `pnpm sonda:variancia` |

Documentação em `docs/` é **histórico, não lei**. ADR antigo que não faz sentido hoje: ignore ou
apague. O código manda.

## Figma → código

O MCP do Figma (Dev Mode local, `figma-dev-mode`) traz o frame selecionado no app desktop. O que ele
devolve é React+Tailwind genérico — **não** é o código do projeto. Traduza sempre:

- Cor, espaçamento e tipografia → **token** de `src/app/globals.css` (`--aja-ink`, `--aja-sand`,
  `--aja-paper`, escala `--blue-*`, semânticos do shadcn). Hex cru vindo do Figma é defeito.
- Primitivo de UI → reutilize `src/components/ui/*` (shadcn, style `base-nova`). Componente novo só
  quando não existe equivalente.
- Ícone → `lucide`. SVG colado do Figma só para marca (`src/components/brand`, `src/components/icons`).
- Texto visível → português com acento, como em todo o resto.

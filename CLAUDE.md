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
| Prompt | `src/lib/agent/system-prompt.ts` — **mas leia a seção abaixo antes de editar** |
| Sonda de variância de fala | `pnpm sonda:variancia` |

Documentação em `docs/` é **histórico, não lei**. ADR antigo que não faz sentido hoje: ignore ou
apague. O código manda.

## ⚠️ O prompt NÃO vive só no repositório

Aqui o código **não** é a fonte da verdade em produção, e essa é a única exceção à frase acima.

`fetchManagedPrompt` (`src/lib/observability/langfuse/prompts.ts`) busca no Langfuse o prompt com
label `production` e só usa a constante do código como **fallback** (Langfuse fora do ar). Dois
textos passam por aí: `SYSTEM_PROMPT` (`src/lib/agent/system-prompt.ts`) e
`BASE_SYSTEM_INSTRUCTION` (`src/lib/agent/turn-analyzer.ts`).

**As duas consequências, que são a mesma moeda:**

- Editar o prompt no código, commitar e **deployar NÃO muda o agente**. Enquanto ninguém publicar,
  produção continua servindo a versão antiga.
- Editar o texto na UI do Langfuse **muda o agente em produção em ≤60s**, sem deploy e sem review.

**A regra, então: mexeu em `SYSTEM_PROMPT` ou `BASE_SYSTEM_INSTRUCTION`, o trabalho só acaba com
`pnpm sync-prompts` rodado contra a instância certa.** O `.env.local` costuma apontar para a
instância local, e o SDK é no-op por design — sincronizar a errada termina com "ok" sem ter escrito
nada onde importa. Confira a URL que o script imprime.

`pnpm prompts:check` responde "produção está rodando o que está no repo?" e falha (exit 1) listando
as linhas divergentes. Rode antes de dar um defeito de fala por corrigido: **você pode estar
depurando um texto que o modelo nunca recebeu.**

Isto não é hipótese. Em 2026-08-15 o `aja-turn-analyzer` estava publicado na **v1 de 07/08**
enquanto o código, desde 14/08 (`3deb8207`), já trazia os exemplos que separam "200 por mês"
(parcela) de "200 mil" (valor do bem) — o fix do incidente que matou uma venda. Ninguém foi
avisado, porque nenhum teste, log ou alerta olhava para isso.

## ⚠️ Variável de ambiente nova NÃO chega por deploy — são dois lugares

O `aws-ecr-deploy.yml` **nunca registra task definition**. Ele constrói e empurra a imagem, e
depois só faz:

```bash
aws ecs update-service --cluster tb-cluster --service aja-agora-prod --force-new-deployment
```

`--force-new-deployment` **não** cria revisão nova: ele manda o serviço puxar a imagem `:latest`
com a **mesma** task definition. Prova, no próprio arquivo: não existe uma única ocorrência de
`register-task-definition` nem de `describe-task-definition`.

Então uma variável de ambiente vive em **dois lugares independentes**, e mexer em um só não faz
nada chegar ao container:

| Onde | O quê | Quem lê |
|---|---|---|
| Secrets Manager — `tb/<env>/aja-agora/env` | o JSON com o valor | o **workflow** (só para os `NEXT_PUBLIC_*`, ver abaixo) e quem lê o secret direto |
| **Task definition** do serviço (`aja-agora-prod` / `aja-agora-dev` e o `-worker`) | a lista de quais chaves entram no container, cada uma com seu `valueFrom` | o **container** em runtime |

**O sintoma engana.** Você adiciona a chave no secret, o deploy passa verde, e a feature fica
muda — porque o container nunca recebeu a variável. Não há erro no build, não há erro no ECS: o
código simplesmente lê `undefined` e cai no default. Aparece longe da causa (uma integração que
devolve 401, um recurso que não liga, uma URL montada errada).

**O único pedaço que o workflow pega do secret:** ele varre os `ARG`s declarados no `Dockerfile` e
preenche **só esses** como build-args (é a linha `grep -E '^[[:space:]]*ARG'`). Na prática, os
`NEXT_PUBLIC_*`, que precisam ser assados na imagem porque rodam no browser. Todo o resto —
`DATABASE_URL`, chaves de API, `REDIS_URL` — chega **pela task definition**, não pelo build.

**A regra, então:** criou/renomeou uma variável → (1) grave no secret do ambiente, (2) **adicione
na task definition** com o `valueFrom` daquela chave, (3) registre a revisão nova e aponte o
serviço para ela, (4) só então deploye. Fazer 1 sem 2 é o erro que já custou diagnóstico neste
projeto; fazer 2 sem 1 deixa o container sem valor.

**Como conferir, com o SSO `tb-mgmt` de pé** (`aws sso login --profile tb-mgmt`) — o que o
container recebe tem que bater com o que está no secret:

```bash
export AWS_PROFILE=tb-mgmt AWS_REGION=sa-east-1

# o que o CONTAINER recebe (env direta + nomes dos secrets)
aws ecs describe-task-definition --task-definition aja-agora-prod \
  --query 'taskDefinition.containerDefinitions[].{env:environment[].name,sec:secrets[].name}' --output json

# o que está GRAVADO no secret
aws secretsmanager get-secret-value --secret-id tb/prod/aja-agora/env \
  --query SecretString --output text | jq -r 'keys[]'
```

Chave que aparece no segundo comando e não no primeiro **não chega ao app** — por mais que o
deploy esteja verde.

**A rede de proteção é do código, e não é opcional:** variável ausente tem que significar
**desligado / no-op**, nunca "ligado por acidente". Exemplo desta casa: `REMARKETING_ATIVO` nasce
desligada — subir a régua de remarketing sem a chave no ambiente **não dispara nada**, em vez de
começar a mandar WhatsApp para os leads porque alguém fez deploy. Foi por isso que o default dela
é ausente-desligado e não `=true`.

**Onde isso já apareceu (17/09/2026):** o `base-remarketing` rodou dias com o `.env.local` do
repo principal apontando para o banco do *develop* — os testes de integração falhavam com
`IDENTITY_ENC_KEY ausente` e a conclusão fácil era "código quebrado". Não era: era ambiente
desatualizado. **Antes de acusar o código, confira de onde o processo lê o ambiente** — vale para
o `.env.local` do worktree, para a task definition do ECS e para o secret, que são três fontes
diferentes.

## Figma → código

O MCP do Figma (Dev Mode local, `figma-dev-mode`) traz o frame selecionado no app desktop. O que ele
devolve é React+Tailwind genérico — **não** é o código do projeto. Traduza sempre:

- Cor, espaçamento e tipografia → **token** de `src/app/globals.css` (`--aja-ink`, `--aja-sand`,
  `--aja-paper`, escala `--blue-*`, semânticos do shadcn). Hex cru vindo do Figma é defeito.
- Primitivo de UI → reutilize `src/components/ui/*` (shadcn, style `base-nova`). Componente novo só
  quando não existe equivalente.
- Ícone → `lucide`. SVG colado do Figma só para marca (`src/components/brand`, `src/components/icons`).
- Texto visível → português com acento, como em todo o resto.

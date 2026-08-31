# PENDENTE-KAIRO — o prompt desta entrega NÃO foi publicado

**Data:** 2026-08-27 · **Branch:** `kairogyn/proposta-diferente-agente`
**Entrega:** [A carta antes do CPF](2026-08-27-a-carta-antes-do-cpf.html)

## O que está pendente

`SYSTEM_PROMPT` (`src/lib/agent/system-prompt.ts`) foi reescrito nesta entrega e
**não foi publicado no Langfuse**. Enquanto isso não acontecer, o agente em
produção continua rodando o texto antigo.

Não publiquei de propósito: você pediu o trabalho todo local, e publicar altera
produção em menos de 60 segundos, sem deploy e sem review.

## A prova de que está divergente

```
$ pnpm prompts:check
Instância verificada: https://langfuse.twobrainstechnology.com
Prompt publicado diferente do código — produção NÃO roda o repo.

✗ aja-system-prompt (produção está na v4):
  Está no código e NÃO em produção (11 linhas)
  exit 1
```

A instância verificada é a de **produção** — confira essa URL antes de agir, porque
o `.env.local` costuma apontar para a local e sincronizar a errada termina com
"ok" sem ter escrito nada onde importa.

## O que mudou no prompt, e por quê

Três blocos, todos derivados de defeito medido:

1. **"Buscar oferta não custa documento"** — a regra antiga dizia o contrário
   (*"identidade é SEMPRE coletada antes da busca real"*). Com a vitrine isso
   virou falso, e prompt que contradiz o servidor é a receita conhecida de
   incidente aqui. **Esta regra é condicional**: o `leanSystemPrompt` só a entrega
   ao modelo quando a vitrine está ligada.
2. **"Você fala COM o cliente, nunca SOBRE ele"** — com a carta chegando no
   primeiro turno o modelo passou a narrar o próprio estado para o cliente
   (*"Aguardando a resposta dele sobre o modelo para seguir"*).
3. **Recomendar UMA cota em vez de listar todas** — acompanha o teto de 4 opções
   que agora existe em código.

## A ordem para ligar isto em produção

⚠️ **A ordem anterior deste documento (deploy antes de publicar) era
inexecutável** — o CI barra o deploy justamente quando o prompt está defasado
(`.github/workflows/aws-ecr-deploy.yml`, step "Compara o prompt publicado com o
do código", `exit 1`). Seguir aquela sequência travava o pipeline.

A ordem certa é:

1. **Decidir com a Bevi qual conta serve de vitrine.** A conta-vitrine deveria ser
   da empresa, não a sua pessoal — ver o risco de bureau recorrente no dossiê.
2. **Gravar `VITRINE_CPF` e `VITRINE_CELULAR`** no secret `tb/prod/aja-agora/env`.
3. **Publicar (`pnpm sync-prompts`) e deployar na mesma janela**, conferindo a URL
   que o script imprime.

### Por que publicar antes do deploy é seguro aqui

Publicar primeiro deixa, por alguns minutos, o **código velho** em produção com o
**prompt novo**. Verifiquei que essa janela é mecanicamente inofensiva: as 11
linhas divergentes moram todas dentro da seção `## Fluxo de Vendas`, e o
`leanSystemPrompt` **que está em produção hoje** (conferido no `HEAD`) corta essa
seção inteira antes de enviar ao modelo. Ou seja, o texto novo publicado não
chega ao modelo enquanto o código velho estiver rodando.

Isso é acidente da formatação atual, não desenho — por isso a janela deve ser
curta, e por isso a ordem acima mantém publicar e deployar juntos.

### O que acontece se você pular o passo 2

Nada muda em produção, e isso é de propósito: sem `VITRINE_*` no secret, a vitrine
fica desligada, o funil antigo continua valendo, e o `leanSystemPrompt` **não
entrega** a regra "buscar oferta não custa documento" ao modelo — justamente para
não colocar prompt contra servidor. Degradação segura, coberta por teste
(`lean-prompt-entrega-as-regras.test.ts`).

## Depois de publicar: rode o medidor do nome

O prompt novo carrega uma regra da qual a captura do nome passou a depender:
**quem se apresenta sozinho só tem o nome gravado se o modelo chamar
`save_contact_name`.** Não há mais rede determinística fora do gate `name` — e a
perda, se acontecer, é permanente (ninguém re-pergunta o nome de quem já trouxe o
valor).

```bash
DIAS=7 pnpm sonda:nome-perdido      # contra o banco de produção, em leitura
```

Ela cruza `contact_name IS NULL` (fato do servidor) com um juiz sobre a fala do
cliente. O desacordo é a perda. Se a taxa subir depois da publicação, o conserto é
de **prompt/contexto** — nunca um regex no servidor, que foi exatamente o que se
tentou e se reverteu em 27/08 (ver `capture.nao-inventa-fora-do-gate.test.ts`).

## Como saber que ficou resolvido

```
$ pnpm prompts:check      # exit 0 e "Prompts em dia com o código"
```

## ⚠️ Antes de medir QUALQUER coisa sobre a fala do agente, no local

O `.env.local` gerado pelo bootstrap aponta `LANGFUSE_BASE_URL` para a instância
de **produção** — e o container passa a servir o prompt **publicado** (a v4
antiga), não o do código. Quem editar o prompt e medir o comportamento vai medir
o texto errado, e os testes não pegam isso.

Foi exatamente o que aconteceu aqui: três execuções foram atribuídas a uma regra
de prompt que não estava na janela do modelo. O log avisava, com todas as letras:

```
[langfuse] O texto com label 'production' difere da constante do código para
'aja-system-prompt'. O modelo está recebendo o publicado; o repo é só fallback.
```

**Para medir o prompt do código**, esvazie as três variáveis no `.env.local` e
recrie o container:

```bash
LANGFUSE_BASE_URL=   LANGFUSE_PUBLIC_KEY=   LANGFUSE_SECRET_KEY=
docker compose --env-file .env.local up -d --force-recreate app
docker logs <container> 2>&1 | grep -c "difere da constante"   # tem que dar 0
```

Perde-se a telemetria da sessão — que é o preço certo por saber qual texto está
sendo medido.

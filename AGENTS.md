# Instruções para agentes — aja-agora

Este arquivo é curto de propósito. O contexto do projeto (domínio, arquitetura, invariantes,
onde as coisas estão) vive em **`CLAUDE.md`** — leia-o antes de trabalhar aqui. O que está
abaixo é o que muda o *jeito* de trabalhar.

## Dúvida sobre o que o cliente pediu, reclamou ou combinou — vai no acervo, não no chute

Antes de decidir produto, ler uma preferência do cliente ou "achar" por que o agente respondeu
alguma coisa, a resposta está no acervo desta máquina — em **segundos**, não em achismo:

```bash
contexto-perfeito -m pessoa "Bruna" -d 30        # o chat inteiro, as calls, os e-mails, as sessões
contexto-perfeito -m tudo "<assunto>" -d 30      # tudo sobre um assunto, em linha do tempo
contexto-perfeito -m onde "o que ficou pendente com X" -d 30
```

Ele cruza zap (privado e grupo), call, e-mail, sessão de agente e resumo de projeto, e devolve a
fala **literal** com data e chave. Fonte sem dado no período é **lacuna**, não ausência — diga isso
em vez de inventar. Nunca trate resumo como prova: o fato vem do trecho literal.

Achou um trecho e precisa do diálogo em volta ou do documento inteiro? A skill
`consultar-contexto-completo` tem o comando de aprofundamento por `chave` (`F:`, `T:`, `E:`, `S:`).

## O motor é o Pi, e o funil morreu — não ressuscite nenhum dos dois conceitos do passado

Desde 2026-10-21 o agente é um **vendedor livre** (`src/lib/agent/pi/turno-livre.ts`): quem escolhe
como perguntar, em que ordem e qual card usar é o **modelo**, com duas skills de Bevi em
`pi/skills/`. Não existe `nextGate`, não existe `knowledge-state`, não existe gate em código. O que
continua em código são só as **coisas de FATO** — e elas não podem sumir:

- os **cards**: `ArtifactType` em `src/lib/chat/types.ts` (22 tipos) com componente em
  `src/components/chat/artifacts/` — o motor livre precisa continuar **renderizando** todos os que
  a conversa pede (card escolhido pelo modelo, payload montado no servidor);
- number vem de tool, nunca da cabeça do modelo (`buscar_cartas`, `fazer_proposta`);
- CPF e identidade nunca chegam ao modelo; persistência, handoff para a mesa e rate limit.

Se a conversa sair ruim, a primeira hipótese é **prompt/contexto ruim ou trava demais** — não "falta
uma trava". Ver no `CLAUDE.md` a regra "invariante verificável vira código, conversa é do modelo".

## Testes: pontual e específico, sempre

A suíte de testes foi removida em 16/10/2026 (commit `d67ea102`: 741 arquivos, 101.660
linhas) e os scripts que a rodavam (`test:unit`, `test:pre-commit`, `test:caminho-do-dinheiro`,
`test:funil`) saíram do `package.json` em 17/10. **Não existe mais "a suíte inteira"** — o que
existe é o teste pontual que você escreve para o que tocou.

- **Escreva e rode o teste do arquivo que você mexeu, ao lado dele:** `X.ts` → `X.test.ts`
  (o hook casa por prefixo, então `X.*.test.ts` também vale).
  `pnpm vitest run src/lib/agent/<arquivo>.test.ts`
- **`pnpm -s typecheck`** prova mais que qualquer suíte que o que você escreveu compila e não
  quebrou contrato de tipo. Rode ele.
- **Integração (`*.integration.test.ts`) só quando a mudança é EXATAMENTE na costura que ele
  cobre** — e sabendo que ele depende do banco do workspace estar migrado.
- **Teste que não morde não é teste:** remova a garantia que ele cobre e confirme que ele fica
  vermelho antes de commitar.

**Não rode teste largo por reflexo.** A falha que aparece nele quase sempre é **do ambiente**
(migration atrás, container dormindo, banco de outro workspace), não do código recém-escrito —
e o custo é depurar ambiente por 20 minutos para escrever uma linha de log. Já aconteceu nesta casa.

## Commit: deixe o hook rodar

O `pre-commit` roda, sobre os arquivos que entraram no commit: o **teste que mora ao lado** de
cada um (se existir) + `pnpm lint`. Se nenhum teste mora ao lado, ele DIZ que não rodou nada e
segue. É barato de propósito — então **commite normalmente, sem `HUSKY=0`**.

Exceção: quando o hook travar por **ambiente** (ex.: teste de integração sem o banco do
workspace de pé). Aí `HUSKY=0` e rode à mão o teste que importa.

## Banco local: o nome do container não resolve do host

`DATABASE_URL` aponta para `aja-shared-pg`, que só resolve **dentro** da rede do OrbStack. Do
host, use o IP do container:

```bash
docker inspect aja-shared-pg --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'
# e rode trocando só o hostname da URL do .env.local:
DATABASE_URL="postgresql://…@<IP>:5432/aja_agora_ws_develop" npx drizzle-kit migrate
```

Migration atrás no banco do workspace se manifesta como erro de **coluna inexistente**
(ex.: `column "metadata" does not exist`) num teste que não tem nada a ver com a sua mudança
— antes de acusar o código, confira de onde o processo lê o ambiente.
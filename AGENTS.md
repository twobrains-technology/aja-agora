# Instruções para agentes — aja-agora

Este arquivo é curto de propósito. O contexto do projeto (domínio, arquitetura, invariantes,
onde as coisas estão) vive em **`CLAUDE.md`** — leia-o antes de trabalhar aqui. O que está
abaixo é o que muda o *jeito* de trabalhar.

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
# Instruções para agentes — aja-agora

Este arquivo é curto de propósito. O contexto do projeto (domínio, arquitetura, invariantes,
onde as coisas estão) vive em **`CLAUDE.md`** — leia-o antes de trabalhar aqui. O que está
abaixo é o que muda o *jeito* de trabalhar.

## Testes: pontual sempre, suíte inteira quase nunca

**Não rode a suíte inteira como hábito.** `pnpm test:unit` e `pnpm test:pre-commit` levam
~70 s, puxam banco e serviços compartilhados do workspace, e a falha que aparece ali quase
sempre é **do ambiente** (migration atrás, container dormindo, banco de outro workspace) e
não do código recém-escrito. O custo é você depurar ambiente por 20 minutos para escrever
uma linha de log — já aconteceu nesta casa.

No lugar disso:

- **Rode o arquivo que você tocou:** `pnpm vitest run src/lib/admin/<arquivo>.test.ts`.
- **Rode o diretório da costura quando ele for o alvo:** mexeu no funil → `src/lib/admin/`;
  mexeu na régua → `src/lib/remarketing/`.
- **`pnpm typecheck`** prova mais que a suíte inteira que o que você escreveu compila e não
  quebrou contrato de tipo. Rode ele.
- **Integração (`*.integration.test.ts`) só quando a mudança é EXATAMENTE na costura que ele
  cobre** — e sabendo que ele depende do banco do workspace estar migrado.

## Commit vai sem o hook de suíte

O `pre-commit` roda lint + `test:unit` + `test:caminho-do-dinheiro`. Como a suíte inteira não
é o juiz do trabalho (item acima), **commite com `HUSKY=0 git commit …`** e rode à mão o teste
pontual do que mudou. Rodar o hook aqui rende, com frequência, um vermelho que não é seu.

Exceção: quando o pedido for explicitamente "valida a suíte inteira" ou pré-merge.

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
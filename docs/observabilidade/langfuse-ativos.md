# Langfuse — ativos: onde cada env existe e como ligar

O app manda o trace do turno para o Langfuse **self-hosted da TwoBrains**. Tudo o que
este doc descreve é no-op quando os envs não estão: `src/lib/agent/pi/langfuse.ts`
só liga com a flag `true`/`1`/`yes`/`on` **E** as três chaves presentes — sem envs,
o turno segue igual, sem trace e sem erro.

## A instância

| o quê | valor |
|---|---|
| Produção (self-hosted, ECS) | `https://langfuse.twobrainstechnology.com` |
| Projeto | um projeto próprio deste app no Langfuse compartilhado |
| Fonte das credenciais | vault do Kairo, entidade `pi-agentes-aja-langfuse` |

A instância é **compartilhada** entre dev/local e produção — o que separa o tráfego é
`LANGFUSE_TRACING_ENVIRONMENT`, não o projeto.

## Os 5 envs obrigatórios

| env | o que faz |
|---|---|
| `LANGFUSE_TRACING_ENABLED` | o interruptor. `true` liga; ausente/`false` = no-op total (nem carrega a extensão). |
| `LANGFUSE_BASE_URL` | `https://langfuse.twobrainstechnology.com` |
| `LANGFUSE_PUBLIC_KEY` | `pk-lf-…` do projeto (vault: `pi-agentes-aja-langfuse`) |
| `LANGFUSE_SECRET_KEY` | `sk-lf-…` do projeto (vault: `pi-agentes-aja-langfuse`) |
| `LANGFUSE_TRACING_ENVIRONMENT` | separa o tráfego no mesmo projeto: `dev` no local, `agents` (ou o valor acordado) em produção. |

Suporte adicional (não é pré-requisito): `PI_LANGFUSE_MAX_CHARS` (default `40000`,
teto do input do trace — o prompt do vendedor passa de 20 mil caracteres),
`LANGFUSE_PROMPT_LABEL` (qual label da caixa de prompt gerenciada este ambiente lê;
default `production`, dev/local deve ser `dev`) e `LANGFUSE_USER_ID` (setado por
turno pelo código, não por env estática — ver `comIdentidadeDoTurno`).

## Como ligar

### Dev local

Os valores estão cifrados no vault. Extraia para o `.env.local` (que **não é
versionado** — o `.gitignore` cobre `.env*` exceto `.env.example`):

```bash
secrets.sh get-key pi-agentes-aja-langfuse | sed 's/^/export /' > /tmp/langfuse.env
# e no .env.local do projeto, além das 4 chaves acima:
#   LANGFUSE_TRACING_ENABLED=true
#   LANGFUSE_PROMPT_LABEL=dev
#   PI_LANGFUSE_MAX_CHARS=40000
```

**Importante:** nunca coloque segredo em arquivo versionado. O `.env.local` é a casa
das chaves em dev; a máquina de CI e a ECS usam o mecanismo de env do serviço, nunca
commit.

**Estado atual (05/11/2026):** o `.env.local` do projeto **não existe** nesta
worktree. A flag e as chaves precisam ser postas nele antes do gate do bloco —
PENDENTE a ativação real (o comando acima extrai tudo do vault; adicione
`LANGFUSE_TRACING_ENABLED=true`).

### Produção (ECS)

As mesmas 4 chaves + `LANGFUSE_TRACING_ENABLED=true` entram como variáveis de
ambiente da task definition do serviço (Secrets Manager / Parameter Store — os
valores são os mesmos da entidade `pi-agentes-aja-langfuse` no vault). O
`LANGFUSE_TRACING_ENVIRONMENT` em produção distingue o tráfego do dev. Atualizar a
task definition e fazer o novo deploy é o que liga.

### Verificar que ligou

1. Rode uma conversa real no playground (ou no app dev).
2. Abra o trace na instância: um trace por turno, `userId` = chave estável da pessoa
   (`AJA_UID` na web, `wa:<telefone>` no WhatsApp) e `sessionId` = id da conversa.
3. Via API (é o gate do bloco B2):

   ```bash
   curl -u "$LANGFUSE_PUBLIC_KEY:$LANGFUSE_SECRET_KEY" \
     "$LANGFUSE_BASE_URL/api/public/v2/observations?traceId=<trace-id>" \
   # deve devolver: uma generation + uma observation de tool
   ```

**Nota sobre a instância local:** a `tb-langfuse-web` local **rejeita as chaves**
(401 medido no B9) — use a instância de produção (`https://langfuse.twobrainstechnology.com`),
que aceita as chaves do vault.

## Invioláveis

- Falha de observabilidade nunca derruba o turno (`langfuse.ts` garante).
- Segredo nunca em arquivo versionado — só `.env.local` (fora do git) ou o vault.
- Nenhum documento é fonte de verdade para teste: o gate é a conversa real que roda
  agora e o trace que aparece na instância.

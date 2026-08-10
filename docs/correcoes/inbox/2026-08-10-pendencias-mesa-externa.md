# Pendências abertas do fluxo de mesa externa (2026-08-10)

> Três buracos que sobraram depois da entrega da mesa externa (role `mesa_externa`,
> modal de atendimento, anexos, trava do agente). Nenhum deles bloqueia o fluxo
> hoje — todos foram **medidos**, não suspeitados. Palavras do Kairo ao pedir o
> registro: *"anota isso ai"*.
>
> Prod no momento da anotação: `sha-8646a45`.

---

## 1 · O agente nunca reassume sozinho — cliente pode ficar no vácuo

**Estado atual (verificado):** `devolverAoAgente` só é chamado por
`closeMesaHandoff` (`src/lib/mesa/handoff.ts:441`), que por sua vez só roda no
endpoint `/api/admin/mesa/handoffs/[id]/close` — o botão "Encerrar atendimento".
Nada mais devolve a conversa. Mover o card de raia **não** devolve (provado:
`transitionLeadStage` não toca em `conversations.status`).

**O buraco:** atendente assume o caso e some (fim de expediente, esqueceu, saiu da
empresa). O cliente escreve e **ninguém responde** — nem humano, nem agente. Do
lado do cliente é silêncio absoluto, sem sinal de que algo quebrou.

**Decisão pendente (é de produto, não técnica):** o Kairo dispensou a pergunta
quando ofereci as opções, então ficou o comportamento atual. As alternativas
levantadas foram:

| Opção | Preço |
|---|---|
| Só o "Encerrar atendimento" (hoje) | Previsível; cliente órfão é possível |
| Encerrar OU inatividade de X horas | Sem órfão; pode surpreender quem saiu pra almoçar |
| Nunca automático, nem no encerrar | Máxima previsibilidade; custo operacional alto |

**Se for implementar:** o ponto natural é `quemRespondePara`
(`src/lib/agent/quem-responde.ts`) — ela já é o ponto único de decisão. Um
`handoff` cujo último evento humano é mais velho que o limite deixa de calar o
agente. Não espalhar essa regra por fluxo nenhum: a decisão mora lá.

---

## 2 · Contatos e conversas duplicados em prod, pelo formato do telefone

**Estado atual (medido no banco de prod):** o mesmo humano existe como duas
pessoas.

| Conversa | Canal | wa_id | contato |
|---|---|---|---|
| `7dda4bdf` | web | `62992496793` | `ad4d6fc7` |
| `2815da1a` | whatsapp | `556292496793` | `eda5569c` |

Causa: cada fonte grava o número num formato — o site pega o que o cliente digitou
(com o nono dígito), e a Meta devolve o wa_id de número BR no formato legado, **sem
o nono**. Nenhuma comparação de string junta os dois, nem em E.164.

**O que já foi resolvido apesar disso:** envio, janela de 24h e trava do agente
passaram a resolver pela chave canônica (`chaveTelefoneBR` = DDD + os 8 últimos,
`src/lib/whatsapp/mesmo-numero.ts`). Então **funciona duplicado**.

**O que continua quebrado:** o histórico fica partido. O modal mostra a conversa do
canal do card; o que o cliente falou no outro canal está em outra linha, invisível
para quem atende.

**Correção proposta:** fundir por `chaveTelefoneBR` — um contato, as conversas
apontando para ele, mensagens numa linha do tempo só. Duas partes:
1. **Backfill** dos registros que já existem (mutação em prod — exige ok do Kairo).
2. **Prevenção** no ponto de criação de contato/conversa, senão volta a duplicar no
   próximo cliente que usar os dois canais.

⚠️ **PENDENTE-KAIRO** para o backfill: é mutação irreversível em produção.

---

## 3 · Transbordo automático por status da Bevi não dispara em prod

**Estado atual (verificado na AWS):** `dispatchAutoTransbordo` tem dois gatilhos.

| Gatilho | Onde | Roda em prod? |
|---|---|---|
| Fechamento de contrato | `api/chat/route.ts:50` e `interactive-handlers.ts:273` | **Sim** |
| Polling de status da Bevi (`na_administradora`) | `workers/proposal-status-poll.ts:71` | **Não** |

`startProposalStatusWorker` só é iniciado por `scripts/proposal-worker.ts`
(`pnpm worker:proposal`). Esse script **não** está no Dockerfile, no compose nem no
CI; o cluster `tb-cluster` tem um único serviço (`aja-agora-prod`) e a task
definition não traz `command` que o suba.

**Consequência:** lead que avança na administradora **não cai na mesa sozinho**. Só
o fechamento transborda; o resto depende do botão manual.

**Correção proposta (escolha de infra, precisa de decisão):**
- Serviço ECS separado rodando o worker — simples, container ocioso 24h.
- EventBridge Schedule chamando uma rota de polling — sem container ocioso, exige
  expor e proteger o endpoint.

⚠️ **PENDENTE-KAIRO**: cria recurso novo em produção.

---

## 4 · A esteira mente sobre qual commit está em produção

Achado ao acompanhar quatro deploys em sequência na tarde de 2026-08-10.

**Sintoma 1 — commit íntegro marcado como falha.** O run de `2bff5b41` aparece
como **failure** no GitHub. O build passou, a imagem foi pro ECR, o código está
em produção. O que estourou foi o gate de rollout:

```
[30/30] PRIMARY rolloutState=IN_PROGRESS deployments=2
##[error]Rollout did not complete within ~10min
```

O gate espera `deployments == 1`. Dois pushes posteriores criaram deployments
novos dentro da janela de 10 minutos, e ele nunca assentou. Falso negativo puro:
não houve rollback nem crash. Quem olhar o histórico da `main` vai ver um X
vermelho num commit que está rodando agora.

**Sintoma 2 — quem escolhe o commit de produção é o relógio.** A task definition
(`aja-agora-prod:13`, inalterada há vários deploys) fixa a imagem na tag **móvel**
`:latest`. O deployment não carrega o commit: ele manda o ECS puxar `:latest`, e
o que estiver lá naquele instante é o que sobe. Com pushes sobrepostos, o
deployment disparado pelo commit A pode subir a imagem do commit B — quem decide
é qual build terminou por último, não qual deploy foi acionado.

Nesta tarde deu certo por sorte de ordenação. Não é uma propriedade do sistema.

**Correção proposta:**
1. Task definition nova por deploy, com a imagem fixada em `sha-<commit>`
   (imutável) em vez de `:latest`. Aí o deployment carrega o commit, e digest
   vira consequência, não coincidência.
2. O gate de rollout precisa comparar o DIGEST em execução, não contar
   deployments. Hoje não consegue: a role `gha-ecs-deploy` não tem
   `ecs:DescribeTasks` — o próprio comentário do workflow admite isso.

⚠️ **PENDENTE-KAIRO**: mexe na esteira de produção e numa role IAM.

---

## Fora destes três

- **Junya está com `SIM-supervisao-mesa`** (WhatsApp simulado). Ela loga e opera o
  painel, mas não recebe mensagem real. Falta o número de verdade.
- **`aja_agora_atendente_retomada` foi aprovado como MARKETING**, não UTILITY. Não
  impede o envio; muda janela de cobrança e regras de opt-out da Meta.
- **`.husky/pre-commit` roda `git add -u`** e engole no commit arquivos que não
  foram preparados. Fix proposto (limitar aos já staged), nunca aprovado.

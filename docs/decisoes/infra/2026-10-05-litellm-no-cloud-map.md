# Conserto: o nome `litellm` no Cloud Map apontava para um host morto

Data: 05/10/2026 · Namespace `tb.local` · Serviço `litellm` (`srv-m2pkcxs3mqrfz33y`)

## Sintoma
Os juízes do Langfuse não rodavam: o consumidor procura `litellm` e o DNS
devolvia **um** endereço, `10.30.1.143:4000` — host que não existe mais.

## O que a medição mostrou
O LiteLLM **estava vivo**: serviço ECS `litellm-shared` no `tb-cluster`, 2 de 2
tasks rodando (`tb-litellm-shared:8`). O Cloud Map tinha dois serviços:
- `litellm` → `10.30.1.143:4000` (**morto**);
- `litellm-srv` → `10.30.1.28:4000` e `10.30.1.98:4000` (**os IPs das tasks atuais**).

## O conserto (reversível, aditivo)
1. `register-instance` dos dois IPs vivos no serviço `litellm`
   (`litellm-28` → 10.30.1.28, `litellm-98` → 10.30.1.98, porta 4000);
2. `deregister-instance` do registro morto (`litellm-host`).

Antes: 1 registro, morto. Depois: `litellm-28` e `litellm-98`, ambos vivos, e o
`litellm-shared` seguindo 2/2.

## Por que era seguro
Quem procura o nome `litellm` **já estava quebrado** — o único endereço
publicado era um host inexistente. Registrar os IPs corretos não podia piorar
nenhum consumidor, e remover o registro morto apenas tira do DNS um alvo que
falhava sempre (num round-robin, ele derrubava uma tentativa em cada).

## Rollback
`deregister-instance litellm-28` e `litellm-98`; `register-instance`
`litellm-host` com `AWS_INSTANCE_IPV4=10.30.1.143,AWS_INSTANCE_PORT=4000`.

## Observação
Consumidores com cache de DNS (Langfuse entre eles) podem levar alguns minutos
para re-resolver. Se os juízes não voltarem, o próximo passo é reiniciar o
serviço do Langfuse — aí o registro já está correto.

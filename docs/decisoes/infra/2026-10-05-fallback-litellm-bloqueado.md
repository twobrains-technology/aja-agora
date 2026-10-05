# Decisão: o fallback do LiteLLM não será tocado agora (bloqueado por duas portas)

Data: 05/10/2026 · Decidido pelo agente com autonomia delegada pelo dono
("se não, é decisão sua"), após o item voltar três vezes na fila.

## O item

"Crédito/billing é do Kairo; fallback no LiteLLM e configuração de gateway."

## Decisão

**Não mexer no gateway agora.** O item fica registrado como bloqueado por
decisão do dono, com a divisão explícita do que é de cada lado.

## As duas portas, na ordem

1. **Crédito/billing — é do dono.** O fallback existe para o momento em que um
   provedor falha. Falha por falta de crédito é a única que o fallback **não**
   cobre: ele tenta o próximo provedor, e o próximo também responde erro de
   billing. Configurar fallback sem crédito produz configuração bonita e efeito
   nenhum — por isso a ordem é crédito primeiro.
2. **Acesso — caiu hoje.** O SSO do `tb-prod` expirou e o `aws sso login
   --profile tb-prod` não completou sozinho (precisa do dono autorizando no
   browser). Sem SSO não há túnel SSM; sem túnel não há gateway. Medido hoje de
   manhã, com o túnel aberto, o gateway respondia `GET /health/readiness` → 200.

## Por que não adianto a configuração

O gateway (`litellm-shared`, 2/2 tasks, atrás de `litellm.tb.local:4000`) é
**compartilhado por todos os projetos TwoBrains**. Mudança de fallback ali é
alteração de infra de todos, com janela de risco: um fallback mal declarado
derruba os modelos de todo mundo, não só do Aja Agora. O ganho de adiantar é
zero enquanto o crédito não existir.

## O que eu faço quando as duas portas abrirem (uma passada, ~15 min)

1. `aws sso login --profile tb-prod` (com o dono autorizando o browser).
2. Túnel SSM até o IP publicado do gateway e leitura da config atual
   (`GET /model/info` com a master key do cofre `twobrains`).
3. Backup da config atual antes de qualquer escrita.
4. Declarar/ajustar o fallback conforme a decisão do dono, de forma **aditiva**.
5. Medir antes e depois: uma chamada real no modelo primário e uma forçando o
   fallback, com o resultado literal de cada uma.

## O que reabre esta decisão

- o dono confirmar o crédito (aí a porta 1 abre); ou
- o dono pedir explicitamente a configuração mesmo sem crédito.
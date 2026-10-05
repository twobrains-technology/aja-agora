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

---

# Atualização — 05/10/2026, tarde: destravou, e a medição muda a decisão

As duas portas abriram (SSO renovado com o dono; acesso ao gateway). Medido, não suposto:

1. **Gateway de pé:** `GET /health/readiness` → **200** `{"status":"healthy","db":"connected"}`.
2. **Chamada real, com a chave que o Aja usa em produção** (`LITELLM_API_KEY` do secret
   `tb/prod/aja-agora/env`): `POST /v1/chat/completions`, modelo `qwen3.8-flash` → **HTTP 200**,
   `"content":"ok"`, `usage.total_tokens: 31`. Portanto **não há bloqueio de crédito** no caminho
   do Aja Agora.
3. **`GET /model/info` → 200**, com 7 modelos e **nenhum fallback declarado**: `claude-opus-4-8`,
   `claude-sonnet-5` (duas entradas), `claude-sonnet-4-6`, `claude-haiku-4-5`, `qwen3.8-flash`,
   `qwen3.6-flash`.
4. **O Aja usa `qwen3.8-flash` → upstream `openai/qwen3.8-flash`**: não passa por crédito de nuvem.
   O crédito que bloqueava o item **não toca o caminho do Aja**. E o secret do app traz
   `LITELLM_SRV_NAME=litellm-srv.tb.local` — o app usa o nome **auto-registrado** (o que o ECS
   mantém vivo), não o registro manual `litellm` que foi consertado de manhã.

## A decisão continua a mesma — agora por medida, não por falta de acesso

**Não mexer no gateway.** A razão mudou: não é "falta crédito", é que **não existe fallback
nenhum para consertar** e o caminho em uso responde 200. Declarar fallback agora cria risco em
infra compartilhada (`litellm-shared` serve todos os projetos) para proteger contra uma falha que
não está medida. Quando um provedor de nuvem passar a ser usado pelo Aja, aí a conversa muda —
e aí com janela.

## O que esta medição NÃO prova

- **Não prova que o crédito esteja pago.** O Aja não depende dele; quem usa os `claude-*` no
  gateway (outros projetos) continua dependendo, e isso eu não medi.
- **Não é diagnóstico do registro manual `litellm`**: o app usa `litellm-srv.tb.local`. Quem ainda
  consome o nome `litellm` (o Langfuse, por exemplo) segue não medido.
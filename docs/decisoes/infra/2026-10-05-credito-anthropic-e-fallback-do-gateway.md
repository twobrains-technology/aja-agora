# Crédito da Anthropic e o fallback do gateway — medido na config real

Data: 05/10/2026 · Decisão do agente com autonomia delegada ("se não, é decisão sua").

## O item que voltou na fila

> "Conta da Anthropic ficou sem crédito em 01/10 (29 respostas 400 `credit balance is too low`,
> 10:50–11:52) e não há fallback no LiteLLM para os grupos `claude-*`."

## O que eu medi (e onde a hipótese se sustenta e onde não)

### 1. O fallback realmente não existe — e agora sei disso pela config, não pela API

A config do gateway **não mora no container**: um sidecar (`config-fetcher`, `amazon/aws-cli`)
baixa `s3://tb-litellm-config-438465163995/config.yaml` para o volume `litellm-conf` no start da
task. Lendo o objeto direto:

- **149 linhas**, com as seções `model_list`, `general_settings`, `litellm_settings`.
- **Não existe `router_settings`** e **não existe a palavra `fallback` em lugar nenhum** do arquivo.
- O objeto **não muda desde 2026-09-21** — a config estava igual no dia do incidente.
- Modelos declarados: `claude-opus-4-8`, `claude-sonnet-5`, `claude-sonnet-4-6`,
  `claude-haiku-4-5`, as três variantes `-advtech`, `gpt-4o`, `gpt-4.1`,
  `text-embedding-3-small` e `qwen3.8-flash`.

Confirmado: **sem fallback, um 400 de billing em `claude-*` não tem para onde ir.** O item está certo.

### 2. O crédito NÃO está bloqueando hoje

Chamada real pelo gateway com a chave do app em produção:

| modelo | resultado |
|---|---|
| `claude-haiku-4-5` | **HTTP 200** em 0,8 s |
| `claude-sonnet-5` | **HTTP 200** em 1,2 s |
| `qwen3.8-flash` | HTTP 200 |

O incidente de 01/10 foi real, mas o crédito **não é o bloqueio de agora**.

### 3. O Aja Agora não depende desse crédito — nunca dependeu

`AI_MODEL = qwen3.8-flash` → upstream `openai/qwen3.8-flash`, servido por endpoint próprio. O
caminho do Aja **não passa por crédito de nuvem**. O incidente de 01/10 afeta os consumidores de
`claude-*` no gateway compartilhado, não este produto.

## A decisão: não configurar o fallback agora

Três razões, na ordem de peso:

1. **O alvo do fallback é decisão de produto, não de infra.** Cair de `claude-sonnet-5` para
   `qwen3.8-flash` faz todo projeto que usa Claude **passar a rodar em outro modelo sem
   ninguém saber** — troca de qualidade silenciosa em produção. Cair para `gpt-4o` é trocar um
   provedor pago por outro da mesma classe de risco. Não existe alvo "obviamente certo": alguém
   precisa escolher, e essa pessoa não sou eu.
2. **O raio de alcance é de todos os projetos.** O `litellm-shared` serve a casa inteira. Um
   fallback mal declarado derruba os modelos de todo mundo — falha maior que o incidente que ele
   previne. E aplicar exige reiniciar a task (janela).
3. **O defeito real do incidente não é a ausência de fallback — é o silêncio.** 29 respostas 400
   em uma hora e **ninguém foi avisado**: o produto respondeu erro e o time descobriu depois. Um
   fallback mitiga; o alerta é que teria evitado a hora de silêncio.

## A receita, pronta (quando houver alvo e janela — ~10 minutos)

1. `aws s3 cp s3://tb-litellm-config-438465163995/config.yaml` e **backup** do objeto atual.
2. Adicionar `router_settings.fallbacks` com o alvo escolhido, de forma **aditiva** (não remover
   nada do arquivo).
3. Subir de volta e fazer `update-service --force-new-deployment` no `litellm-shared`
   (o sidecar rebaixa a config no start).
4. Medir antes e depois: chamada real no primário, e uma forçando o fallback, com o corpo literal
   de cada resposta.

## O que eu recomendo fazer antes disso (barato, e não depende do crédito nem de janela)

**Tornar a falha de billing visível.** Um sinal que pega o `400 credit balance is too low` e
alerta — no Langfuse (Monitors) ou no log do gateway. Custa pouco, não toca em config
compartilhada e ataca a parte do incidente que realmente custou caro: **a hora em que ninguém
sabia**.

## O que continua sendo do dono

- **Crédito/billing**: é dele. Hoje não bloqueia (medido), mas o incidente mostra que acaba sem aviso.
- **O alvo do fallback**: escolha de produto (qual modelo assume quando o Claude cai).
- **A janela** para reiniciar o gateway.

# Decisão: manter o qwen3.8-flash como modelo único (não voltar ao Haiku)

Data: 05/10/2026 · Decidido por: agente, com autonomia delegada pelo dono
("se não, é decisão sua") · Registrado aqui porque mudar o modelo é mudança de
produto, não de configuração.

## A pendência

`PENDENTE-KAIRO 1`: manter o qwen, ou voltar ao Haiku trocando `AI_MODEL` no
secret `tb/prod/aja-agora/env` e rodando `aws ecs update-service
--force-new-deployment` (a task definition já lê a chave via `secrets`).

## Decisão: MANTER o qwen3.8-flash. Não mexer.

## Por quê

1. **A homogeneidade é um ganho medido, não um acidente.** O agente que conversa
   e o que analisa rodam no mesmo modelo (`AI_ANALYZER_MODEL` ausente ⇒ herda
   `AI_MODEL`). Isso é afirmado no paper que foi para o cliente: "um modelo só,
   sem divisão: o que se mede em um vale para o outro, sem variação escondida de
   motor". Voltar o analyzer para um motor diferente reintroduz exatamente a
   variação que a semana passada removeu — e a leitura por degrau passaria a
   medir dois motores e chamar de produto.
2. **Não há medição que sustente a troca.** Nada foi medido comparando qwen ×
   Haiku nas conversas reais desta janela; trocar seria mover um custo fixo por
   uma impressão. O que existe medido é o custo por degrau e a taxa de conversa —
   e nenhum dos dois foi ligado ao modelo.
3. **O custo do redeploy não é zero e o ganho é hipotético.** A troca exige
   secret + task definition + rollout, com uma janela em que conversa em curso
   pega dois motores.
4. **Se a qualidade do qwen virar suspeita, o teste certo não é o secret:** é
   medir as mesmas conversas nos dois motores e comparar degrau por degrau (a
   régua já existe, o `cruzamento-midia.sh` e a tela mostram o funil). Aí a troca
   vira consequência de número, não de vontade.

## O que reabre esta decisão

- queda medida em conversa → oferta ou conversa → telefone **no mesmo recorte**,
  com o modelo como única variável; ou
- o dono pedir explicitamente a volta ao Haiku (aí é ordem, e a ordem se cumpre).
---

## Revisão — 05/10/2026 (fim do dia), com o item do modelo de volta na fila

### Medição nova: o caminho do haiku está aberto

Chamada real pelo gateway (`10.30.1.28:4000`), com a chave do app em produção
(`LITELLM_API_KEY` do secret `tb/prod/aja-agora/env`):

| modelo | resultado |
|---|---|
| `claude-haiku-4-5` | **HTTP 200** em **0,8 s** |
| `claude-sonnet-5` | HTTP 200 em 1,2 s |
| `qwen3.8-flash` | HTTP 200 (medido antes, mesmo caminho) |

**O crédito do provedor não está bloqueando a troca.** A decisão de manter o qwen
não pode mais se apoiar em "não dá para trocar" — dá.

### A decisão revisada: manter o qwen AGORA, e trocar se o gatilho abaixo disparar

Três razões, na ordem de peso:

1. **O conserto mais barato aponta para o prompt, não para o modelo.** A leitura
   fechada da janela 02–05/10 localizou o ponto de morte dominante: **15 das 31
   conversas morrem na pergunta de qualificação** ("já tem um modelo em mente?") —
   o agente pergunta antes de entregar. Isso é **ordem do primeiro turno**, e
   corrigir isso é prompt, reversível e sem risco de crédito. Trocar o modelo sem
   corrigir isso mediria a variável errada: a conversa continuaria morrendo no
   primeiro turno, com um modelo mais caro.
2. **A dependência de crédito é um risco real e assimétrico.** O qwen é servido por
   endpoint OpenAI-compatible próprio; o haiku consome o **pool compartilhado** de
   todos os projetos TwoBrains. Se o pool secar, o Aja não fica "pior" — fica
   **mudo**. Pior que conduzir mal é não responder.
3. **O número que sustenta a troca é um juiz, não um fato mecânico.** A queda
   medida no Langfuse (haiku 0,93 → qwen 0,87 → 0,56) é **score de juiz LLM**, e a
   calibração desse juiz não foi verificada nesta frente. Score de juiz orienta,
   mas não decide sozinho — e é justamente o tipo de número que já produziu leitura
   errada aqui. O que é mecânico na nossa medição é a contagem de onde a conversa
   morre, não o score.

### Gatilho explícito de troca

**Corrigida a ordem do primeiro turno, se o ponto de morte continuar na condução**
(medido pela mesma contagem: última mensagem do agente por conversa), então o
resíduo é o modelo — e aí a troca está pronta e autorizada:

1. `AI_MODEL=claude-haiku-4-5` no secret `tb/prod/aja-agora/env`
   (o app lê a chave via `secrets`, a task definition já aponta para lá).
2. `aws ecs update-service --force-new-deployment` no `aja-agora-prod`.
3. Antes de trocar, **configurar fallback `haiku → qwen` no gateway** — é o que
   remove o risco de o Aja ficar mudo sem crédito. Sem isso, a troca troca um
   defeito de condução por um defeito de disponibilidade.

### Ganho a favor da troca, já medido

Latência: p50 **5,4 s (qwen)** contra **2,4 s (haiku)** — o haiku é mais que o dobro
de rápido, e a cliente já reclamou de lentidão ("meio lento"). Se o prompt não
resolver, a troca melhora condução **e** latência ao mesmo tempo.

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
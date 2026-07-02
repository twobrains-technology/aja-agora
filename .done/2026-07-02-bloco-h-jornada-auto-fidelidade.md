# Bloco H — Fidelidade da jornada AUTO web (FIX-73/74/75)

**Data:** 2026-07-02 · **Branch:** `fix/jornada-auto-fidelidade` · **Commits:** `f35379b` (FIX-74), `661cbb9` (FIX-75), `799a75a` (FIX-73), `4113ea6` (docs)

## O problema (na voz do operador)

> "QA dono-de-produto: isso vende? eu assinaria?" — jornada AUTO web em produção
> (ajaagora.com.br), rodada de teste manual de 2026-07-02.

Três defeitos achados na mesma rodada de QA crítico, todos na mesma família:
**a jornada AUTO prometia uma coisa e entregava outra.** Número recomendado ≠
número contratado, prazo nunca confirmado, orçamento digitado jogado fora.

## FIX-73 — Recomendação bait-and-switch (o mais grave)

Pedi carro R$ 70 mil / ~R$ 900/mês. A recomendação anunciou **R$ 70.000 /
parcela R$ 892,48 (99,2% do teto)**. A proposta REAL contratada (carta + PDF)
saiu **R$ 100.000 / parcela R$ 1.438,28** — quase 60% acima do prometido.
Isso é o tipo de coisa que mata confiança num produto financeiro.

**Causa raiz (duas peças compostas):**
1. Todos os outros cards (simulação, agulha de contemplação) já passavam por
   uma camada de segurança no servidor que reescreve os números com o dado
   REAL antes de mostrar na tela — só o card de recomendação não tinha essa
   camada. O texto que o modelo "digitava" ia direto pra UI.
2. No fechamento, o sistema não reaproveitava a oferta que o card mostrou —
   recalculava do zero a partir do teto de crédito pedido, gerando uma cota
   diferente da anunciada.

**Decisão de produto (Kairo, tomada antes da implementação):** recomendar a
cota real — a recomendação e o simulador mostram exatamente a mesma cota que
será contratada. O número decisório é o número contratado, ponto final.

**Correção:**
- Nova camada `coerceRecommendationPayload` (espelha a que já protegia a
  simulação): casa a recomendação do modelo com a busca real do mesmo turno e
  reescreve os números — por identificador exato primeiro, por administradora
  depois, e nunca deixa um número fabricado passar (pior caso, usa a melhor
  opção real ranqueada).
- O fechamento agora reaproveita a oferta real que o card mostrou, em vez de
  recalcular do teto de crédito.

## FIX-74 — Jornada pulava a pergunta de prazo

Digitei só "R$ 70 mil, gastando perto de R$ 900 por mês" (valor + orçamento,
sem dizer o prazo) e a jornada foi direto pra CPF/lance/resultado — nunca
perguntou em quanto tempo eu queria o bem. A recomendação saiu com um prazo
de quase 10 anos que eu nunca escolhi.

**Causa raiz:** o classificador de linguagem natural, em produção, confundiu
"R$ 900 por mês" (quanto eu pago) com um prazo, e a pergunta de prazo foi
pulada porque o campo já "tinha valor". A pergunta em si e a proteção contra
campo vazio já existiam no código — o problema era confiar demais no
classificador.

**Correção:** trava determinística que nunca depende de o modelo acertar —
se a frase só menciona cadência mensal ("por mês", "/mês", "mensal") sem
nenhuma menção explícita de prazo (um número junto de "anos"/"meses"), o
sistema descarta o que o classificador tentou preencher e a pergunta de
prazo volta a aparecer.

## FIX-75 — Chip da landing descartava o orçamento digitado

Na página inicial: digitei "Quero comprar um carro de uns R$ 70 mil, gastando
perto de R$ 900 por mês." e cliquei no atalho "Carro" — a mensagem enviada foi
o texto genérico "Quero trocar de carro.", jogando fora tudo que eu tinha
escrito. Enviar sem clicar no atalho funcionava normalmente.

**Causa raiz:** o atalho sempre mandava a frase pronta, ignorando o que
estava escrito na caixa de texto.

**Correção (decisão de UX confirmada):** o texto do usuário sempre vence —
o atalho só usa a frase pronta quando a caixa de texto está vazia.

## Qualidade entregue

Os 3 fixes seguiram TDD estrito — teste de regressão escrito e visto
falhando ANTES da correção, em todos os casos.

- **FIX-73** (comportamento de agente, 3 camadas): teste unitário da camada
  de coerção + do reaproveitamento da oferta no fechamento; cassette
  determinístico reproduzindo o bug real (recomendação fabricada → coerção
  reflete a cota real; descoberta→fechamento mantém crédito/parcela);
  acoplamento estrutural garantindo que o código de produção realmente chama
  a correção (não é um teste solto).
- **FIX-74** (comportamento de agente, 3 camadas): teste unitário da trava
  determinística; cassette reproduzindo o cenário exato do bug (classificador
  errando, trava corrigindo) + um caso de controle (prazo explícito
  preservado).
- **FIX-75** (componente de tela, sem lógica de agente — 1 camada, conforme
  a política do projeto): teste de componente cobrindo os 3 cenários (vazio
  → atalho, preenchido → texto do usuário, só espaços → conta como vazio).

**Gate final:** `pnpm test:unit` rodado em container isolado (host não tem
`node_modules` — regra do projeto) com Postgres real migrado — **179 arquivos
de teste, 1925 testes, 100% verde.**

## Decisões tomadas durante a implementação

Nenhum trade-off novo apareceu durante a implementação além do que já estava
decidido nos cards de correção — não foi necessário nenhum registro de
decisão adicional (`docs/correcoes/decisions/`). O ponto que exigiria uma
decisão de produto (recomendar a cota real vs. re-simular no fechamento) já
tinha sido resolvido pelo Kairo antes de eu começar a implementar.

## Gaps / pendências honestas

- **Camada 3 (eval nightly)** dos FIX-73/74 não foi escrita nesta sessão —
  os cards previam "esqueleto se aplicável"; a suíte de eval (`tests/eval/`)
  roda via cron separado e não bloqueia merge (regra do projeto). Ponto de
  atenção pro próximo ciclo de eval: adicionar os cenários AUTO
  correspondentes (recomendação == proposta; orçamento mensal não vira
  prazo).
- O fallback de `coerceRecommendationPayload` (quando o id do card não casa
  com nenhuma recomendação real) cai na melhor opção ranqueada — nunca deixa
  um número fabricado passar, mas isso significa que, num caso raro em que o
  modelo perde o rastro do id, o card pode mostrar uma administradora
  diferente da que o texto do agente mencionou. Não observado em teste, é
  uma hipótese de risco residual — vale monitorar em produção.

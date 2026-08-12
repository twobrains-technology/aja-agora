# Fala do agente cortada no meio, em produção

**Achado em:** 2026-08-12, pilotando `ajaagora.com.br` pelo claude-in-chrome
(perfil Twin), na validação pós-deploy `f039af72`.
**Canal:** web · **Onde:** conversa nova em `/autos`

## O que o cliente vê

Duas falas do agente terminam no meio, na mesma conversa:

```
Rafael, ótimo saber!

Então,
```

```
Perfeito, Rafael. Então a gente busca grupos de consórcio de R$ 90 mil
pra você quitar essa dívida.

Quant
```

A primeira para numa vírgula ("Então,"); a segunda corta no meio da palavra
("Quant" — seria "Quanto"). Nos dois casos o turno ENCERRA ali: o balão seguinte
já é do cliente.

## Não é streaming em andamento

Reli o DOM 10 segundos depois da captura e o texto era **idêntico** — se fosse o
stream ainda escrevendo, teria completado. É truncamento persistido na tela.

## O que ainda não sei

- Se o texto truncado está **persistido no banco** ou só na renderização (o túnel
  SSM caiu antes de eu conferir; a consulta é
  `select right(content,25) from messages where role='assistant' order by created_at desc`).
- Se é **regressão desta rodada**. Nesta sessão mexi em `isSegmentBoundary`
  (reticências deixaram de ser três fronteiras; caractere de fechamento passou a
  segurar a fronteira) e adicionei o guard `sem-conteudo`. Qualquer um deles pode
  deixar mais texto preso em `pending` — mas o `flush()` deveria emitir, então a
  hipótese é fraca e precisa de prova, não de palpite.

## Por onde começar

1. Confirmar no banco se o `content` gravado já vem cortado. Isso separa
   "sanitizer/stream cortou" de "só a UI não renderizou".
2. Se vier cortado do servidor: instrumentar `EphemeralTextFilter.flush()` —
   `pending` não-vazio no fim do turno é o suspeito número um.
3. Reproduzir com a sonda (`pnpm sonda:conversa`) e comparar o texto do SSE com o
   do banco: se o SSE vem completo e o banco cortado, o problema é na persistência.

## Nota de método

Este defeito não aparece em nenhum teste automatizado que existe hoje, nem nos
golden do Langfuse (que asseram trajetória de artifacts, não integridade da
fala). Foi a pilotagem visual que pegou — é o tipo de coisa que só a tela mostra.

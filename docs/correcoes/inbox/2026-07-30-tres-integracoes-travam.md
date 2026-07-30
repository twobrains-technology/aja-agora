# ~~Três testes de integração travam~~ — DIAGNÓSTICO ERRADO, RESOLVIDO

**Status:** RESOLVIDO em 2026-07-30 · **Achado em:** 2026-07-30

## O que eu escrevi aqui, e que era falso

A primeira versão deste card afirmava duas coisas, e a 15ª revisão independente
derrubou as duas com medição:

1. **"Com `--testTimeout=90000` ainda falha → TRAVAM, não são lentos."**
   Falso. Com `--testTimeout=240000` os três passam: 3 arquivos, 10 testes,
   289,93 s. Não travam — são lentos. Meu limite é que era curto.

2. **"O `route.identify-celular-ddi` afirma não precisar de LLM, então a hipótese
   do gateway caído não explica."**
   Falso. O comentário do teste é de 2026-07-01, anterior à migração para
   LangGraph. O runtime imprime `gate=desire`, não `credit`. O `turn-trace` fecha
   o caso: `toolsCalled: 14× keepalive`, `textChars: 0`, e o último chunk é
   `500 litellm.InternalServerError ... Cannot connect to host
   host.docker.internal:4100`.

## A causa raiz (que eu declarei não ter descoberto)

**O túnel SSM da porta 4100 estava caído.** O AI SDK reenvia com backoff por ~2
minutos antes de desistir — daí o "trava". Não era pool de conexões, nem handle no
teardown, nem estado de outro teste.

Minhas duas tentativas de subir o túnel falharam por erro MEU e eu não reli a
saída: a primeira sem `--region`, a segunda com credencial SSO expirada. Concluí
"não é o gateway" a partir de um comando que nunca rodou.

## O que foi feito

- Túnel restabelecido (`aws sso login --profile tb-prod` + port-forward, skill
  `tunel-litellm`).
- Os três arquivos **VOLTARAM** ao gate `test:caminho-do-dinheiro`, que agora roda
  com `--testTimeout=240000`. Com o túnel de pé: **55 arquivos / 234 testes em
  64,8 s** — o tempo alto só aparece quando o gateway está fora.
- A exclusão que eu tinha feito no `package.json` foi revertida.

## A lição, que é a que importa

Eu enfraqueci o gate do caminho do dinheiro — 10 testes de mesa, identify e
simulador fora do pre-commit **para sempre** — com base num diagnóstico que uma
medição de dez minutos derrubava. O card anterior dizia "gate permanentemente
vermelho por ambiente é desligado na primeira sexta-feira"; eu desliguei o
ambiente do gate em vez de consertar o ambiente.

Regra prática: gate vermelho por ambiente é para consertar o ambiente. Excluir
teste é a última opção, não a primeira, e exige causa raiz PROVADA — não a
ausência de uma.

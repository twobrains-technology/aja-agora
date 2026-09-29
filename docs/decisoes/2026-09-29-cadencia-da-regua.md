# Cadência da régua e cota de 30 dias — decisão de 29/09/2026

**Quem decidiu:** Kairo, no canal «Aja Agora · Pi», depois de pedir a análise de marketing
(*"cadencia quero sua opiniao de analisa de marketing"*).
**Onde vale:** `escala_retomada_minutos` no cadastro da régua (e o valor de fábrica no código).

---

## 1 · A cadência: `[90, 180, 300]` minutos

| Toque | Quando | Contexto |
|---|---|---|
| 01 | **90 min** de silêncio | ainda quente — a pessoa acabou de comparar e saiu da tela |
| 02 | **+3 h** do 01 | outro momento do dia (almoço, volta do trabalho) |
| 03 | **+5 h** do 02 | fim do dia, ou manhã seguinte (ver a janela de envio abaixo) |

Série inteira ≈ **9 h 30** depois do silêncio. Máximo de **3 toques por pessoa a cada 30 dias**.

### Por que não `[10, 20, 30]` min (o que estava no código)

O bloco da régua implementou 10/20/30 min citando a reunião de 22/09 — *"primeiro o cara não respondeu
em 10 minutos, eu pingo em 10; depois é 20; aí depois 30"*. A intuição estava certa (**a série precisa
caber dentro da janela de 24 h**, senão vira template pago), mas os números são rápidos demais:

1. **10 min de silêncio é o tempo de a pessoa ir pegar um café.** O toque chega com a tela ainda viva,
   e o efeito é o oposto do pretendido: parece um bot que não deixa a pessoa pensar.
2. **Três mensagens dentro de uma hora é a assinatura clássica de disparo automático.** O próprio PDF
   da Bruna diz isso, no disparo 01: *"Texto longo aqui lê como disparo automático e derruba a
   resposta"*. O mesmo vale para o ritmo, não só para o tamanho.
3. **O risco não é só estético.** O que o lead faz com três pings seguidos é **bloquear e denunciar** —
   e denúncia derruba a qualidade do número na Meta, atingindo **todas** as campanhas, não só a régua.

### Por que não o do PDF dela (90 min → +1 dia → 4 a 7 dias)

Essa é a cadência clássica de nutrição, e está certa para um lead que entrou num funil de e-mail e
esfriou. Não é o caso aqui, por **duas** razões medidas:

1. **Fora da janela de 24 h da Meta não sai texto livre.** Os toques 02 (+1 dia) e 03 (4 a 7 dias) do
   PDF caem fora da janela — e o que sai lá é **template aprovado**: pago, impessoal, e sem a cópia
   que a Bruna aprovou. A régua inteira existe para retomar uma conversa; template é outra conversa.
2. **Em 4 a 7 dias o lead não está mais comparando.** Quem procura consórcio resolve em dias, não em
   semanas — no toque 03 do PDF ele já comprou em outro lugar ou desistiu. A janela de 24 h é
   justamente onde a intenção ainda está viva.

**O que fica do PDF:** o toque 01 em **90 min** — o número é dela, e está mantido.

### O que a janela de envio (9h às 20h) faz com isso

Medido no código, não suposto: os toques só saem entre **9h e 20h**. Com a série em horas, é normal o
toque 03 cair depois das 20h — ele **não** é cancelado, **espera a janela abrir** e sai na manhã
seguinte, ainda dentro das 24 h do último inbound (e portanto ainda como **texto livre**).

Isso não é um defeito: é o comportamento desejado. Exemplo real, silêncio às 11h30:
`13h00` (01) → `16h00` (02) → `21h00` não sai → **9h do dia seguinte** (03). A terceira mensagem chega
num contexto genuinamente diferente — manhã, cabeça fresca — em vez de ser o terceiro ping da tarde.

Foi por isso que `[90, 180, 300]` foi escolhido em vez de intervalos maiores: a série **cabe** nas 24 h
em qualquer horário de início, com folga. Com 4 h e 7 h, a série inteira (≈13 h + o escorregão da
janela) passaria das 24 h e o toque 03 viraria template.

### O que fica valendo do código antigo (não regride)

Nada disto muda: teto de **30 dias** por pessoa, `max_toques = 3`, janela de horário, opt-out,
conversão, time da equipe, e o `ESGOTADO` terminal sem `perdido` automático.

---

## 2 · Cota de 30 dias na reentrada: **conta o histórico**

**A pergunta era:** quando um lead parado é recolocado na régua, ele ganha uma cota nova de 3 toques,
ou a cota de 30 dias conta o que já foi enviado?

**Decisão: conta.** Quem já recebeu 3 toques nos últimos 30 dias **não** recebe mais nenhum — mesmo
sendo recolocado na régua. A cota reabre sozinha quando o toque mais antigo completa 30 dias.

**Por que (a mesma razão da cadência):** a cota é um **orçamento por pessoa**, não por campanha. Ela
existe para o número não virar spam. Se a reentrada zerasse o contador, "reentrada" seria o atalho
para furar o teto — exatamente o caminho que leva a bloqueio e denúncia, e a denúncia derruba o número
inteiro. Um teto que se pode furar não é teto.

**A exceção que não é exceção:** se a pessoa **responde**, ela não está mais "parada" — é conversa
nova, e a relação reinicia. Reentrada é sobre quem **não** respondeu.

---

## Onde isso está aplicado

| O quê | Onde |
|---|---|
| Valor de fábrica `[90, 180, 300]` min | `src/lib/remarketing/regua.ts` (`ESCALA_DE_RETOMADA_MS`) |
| Valor no cadastro (cadastro ganha da fábrica) | `escala_retomada_minutos` = `"90,180,300"` — a aplicar em produção no deploy |
| Testes que travam a decisão | `regua.escala.test.ts`, `regua.parametros.test.ts`, `regua.test.ts`, `remarketing-cycle.test.ts`, `remarketing-config.test.ts` |
| Cota de 30 dias contando o histórico | comportamento já implementado (`touches30d` + teto vigente) — coberto pelos testes da régua |

**Medido depois de aplicar:** `pnpm typecheck` limpo e **1.155 testes** verdes nas áreas tocadas
(`src/lib/admin`, `src/lib/remarketing`, `src/lib/workers`, `src/lib/exportacao`,
`src/components/admin`, `src/app/api/admin`).
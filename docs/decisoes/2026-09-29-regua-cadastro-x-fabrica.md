# Régua: o que é cadastro e o que é fábrica — decisão de 29/09/2026

**Quem decidiu:** Kairo, ao fechar o item 2 do PRD das pendências (`docs/design/planos/2026-09-29-pendencias-regua-ab-pixel.md`).
**Onde vale:** todo número que a régua de remarketing usa para decidir **se** e **quando** tocar.
**O que NÃO muda:** nenhum campo novo, nenhuma migration, nenhuma mudança de código. Este documento é a
resposta escrita à pergunta "metade da régua está no cadastro e metade escondida no código?".

---

## 1 · A pergunta, e o que o código respondeu

O PRD levantou a suspeita de que os intervalos dos toques 02 e 03 estivessem **só na fábrica**, com o
cadastro cobrindo só parte da régua. **A suspeita não se sustenta:** `dias_ate_segundo_toque` e
`dias_ate_terceiro_toque` estão em `PARAMETROS_DO_CADASTRO` (`src/lib/admin/remarketing-config.ts`) e
na tela de configuração, como os outros seis escalares.

O que existe de verdade é que **a régua tem dois tipos de número**, e a divisão não é arbitrária:

- o que o dono do produto **ajusta por decisão comercial** — os oito escalares e a escala curta. Vão
  para o cadastro (`remarketing_config`, chave/valor de texto), com padrão no código. Linha ausente =
  fábrica, e apagar a linha volta ao padrão sem deploy;
- o que **não é decisão de produto** — é regra imposta pela Meta, orçamento anti-spam ou um dado que
  precisa ficar idêntico em mais de um lugar. Fica em código, como **invariante**. Expor isso no
  cadastro não daria liberdade: daria um jeito de quebrar a régua em silêncio.

A tabela abaixo é o inventário. Cada linha diz onde o número vive e por que ele vive lá.

---

## 2 · Cadastro — os nove números que o dono ajusta sem deploy

Os oito escalares estão em `PARAMETROS_DO_CADASTRO`; a escala curta tem bloco próprio (é LISTA, não
escalar) e a chave `escala_retomada_minutos`. Padrão em `PARAMETROS_DE_FABRICA` / `ESCALA_DE_RETOMADA_MS`
(`src/lib/remarketing/regua.ts`).

| Nome na tela / chave | Padrão | Onde vive | Por que é cadastro |
|---|---|---|---|
| Silêncio que abre o toque 01 · `espera_silencio_minutos` | 90 min | `regua.ts` (`ESPERA_SILENCIO_MS`) → cadastro | É o "não respondeu em 1h30" — o número do PDF da cliente. Ritmo comercial, muda com a leitura de marketing. |
| Intervalo até o toque 02 · `dias_ate_segundo_toque` | 3 dias | `regua.ts` (`DIAS_ATE_SEGUNDO_TOQUE`) → cadastro | Cadência comercial. **Confirmação de que não estava escondido no código.** |
| Intervalo até o toque 03 · `dias_ate_terceiro_toque` | 5 dias | `regua.ts` (`DIAS_ATE_TERCEIRO_TOQUE`) → cadastro | O PDF diz "4 a 7 dias"; 5 é a decisão do dono. **Idem: já é cadastro.** |
| Toques por sequência · `max_toques` | 3 | `regua.ts` (`MAX_TOQUES`) → cadastro | Quantos toques a sequência tem. Decisão de agressividade comercial. |
| Teto por pessoa na janela · `teto_toques_30_dias` | 3 | `regua.ts` (`TETO_TOQUES_30_DIAS`) → cadastro | Orçamento por pessoa, entre campanhas. Decisão comercial **e** de risco de número. |
| A janela do teto · `janela_do_teto_dias` | 30 dias | `regua.ts` (`JANELA_DO_TETO_MS`) → cadastro | Por quanto tempo um toque conta contra o teto. Mesma natureza do teto. |
| Hora em que a régua acorda · `hora_abertura` | 9 h | `regua.ts` (`HORA_ABERTURA`) → cadastro | Janela de horário do negócio — muda com a rotina do time. |
| Hora em que a régua para · `hora_fechamento` | 20 h | `regua.ts` (`HORA_FECHAMENTO`) → cadastro | Idem; a hora do fim é exclusiva. |
| Escala intra-janela · `escala_retomada_minutos` | `90,180,300` min | `regua.ts` (`ESCALA_DE_RETOMADA_MS`) → cadastro | A cadência curta de dentro da janela de 24 h. Decidida em 29/09 e registrada em `2026-09-29-cadencia-da-regua.md`. É LISTA (um intervalo por toque), por isso tem chave e validação próprias e **não** entra em `PARAMETROS_DO_CADASTRO` — um `<input type="number">` com CSV reenviaria vazio e apagaria a escala. |

**Regra de desenho, e ela não se inverte:** o código é o padrão, o banco é o ajuste. Valor que não
vence a validação é ignorado e vale a fábrica — o viés é sempre "menos toque, não mais".

---

## 3 · Código — os invariantes que NÃO viram cadastro

| Invariante | Onde vive | Por que fica em código |
|---|---|---|
| `JANELA_24H_MS` (24 h) | `regua.ts:79` | **Regra da Meta, não do produto.** Fora das 24 h do último inbound não sai texto livre, só template aprovado. O dono não pode ajustar isso — a Meta é que manda. Expor no cadastro só criaria a ilusão de controle e uma régua que disca para fora da janela. |
| `JANELA_DE_ENTRADA_MS` (7 dias) | `motivo-de-exclusao.ts:169`, reexportada em `motivo-fora-da-regua.ts` | **A mesma janela é lida em três lugares** (a consulta do ciclo, `src/lib/admin/remarketing-queries.ts`, e as duas leituras de `motivo-fora-da-regua.ts`). Mudar num lugar só desalinha as três — o ciclo passaria a incluir quem a tela diz que está fora, ou o contrário. Enquanto for uma constante única, as três não podem discordar; virando cadastro, passariam a poder. |
| `LIMITES_DOS_PARAMETROS` (faixa de cada escalar) | `regua.ts` | **Anti-spam.** É o que impede `teto_toques_30_dias = 100` ou um `dias_ate_segundo_toque` de meses. O cadastro é livre; o limite é a cerca que garante que a liberdade não vire disparo em massa. Cadastro que edita a própria cerca não é cerca. |
| `LIMITES_DA_ESCALA` (1 min–24 h por passo, até 5 passos) | `regua.ts` | **Anti-spam, o mesmo caso.** Intervalo de 0 = rajada; intervalo de meses = template. A lista não-decrescente também é invariante (a régua nunca acelera). |
| Telefones da equipe | `motor.ts` — `TELEFONES_DA_EQUIPE_PADRAO = ["556292496793"]` + envs `TELEFONES_DA_EQUIPE` / `REMARKETING_TELEFONES_INTERNOS` + atendentes do banco (`mesa_attendants`, `user`) | **É padrão em código + env + banco, e é assim de propósito.** O número da casa em código garante que a régua nasce protegida mesmo sem env; as envs deixam ampliar sem deploy; o banco pega quem está na mesa hoje. É o dado que **não** pode virar campo de cadastro editável — apagar a proteção por ali faria a casa mandar remarketing para si mesma (o defeito medido em 18/09, diagnóstico §d). |
| Frases de opt-out (`FRASES_DE_OPTOUT`, `RESPOSTAS_CURTAS_DE_OPTOUT`, `VERBOS_DE_PARADA`) | `motor.ts:603+` | **É o fato terminal mais forte do canal.** Soltar isso no cadastro é deixar alguém apagar, por engano, o que marca "esta pessoa pediu para parar" — e o dano é mandar mensagem para quem pediu para sair. A lista é deliberadamente conservadora; dúvida não marca (`contacts.remarketing_optout_at` é a âncora, não a frase). |
| Chaves de template (`templateDoObjetivo`, `chavesDoToque`, `BEM_GENERICO`, `comunicacaoDoToque`) | `motor.ts` | **Regra dura do PRD: nenhum texto de comunicação é decidido no servidor.** O código só monta a ORDEM de tentativa (`[fase+bem, genérico da fase]`); quem decide se o template existe e está aprovado é o dispatcher. Cadastro aqui seria o servidor escolhendo texto — exatamente o que o PRD proíbe. |

---

## 4 · A conclusão em uma linha

**Os nove números de cadência já são cadastro; o que fica em código é invariante** — regra da Meta
(`JANELA_24H_MS`), janela lida em três lugares (`JANELA_DE_ENTRADA_MS`), cercas anti-spam
(`LIMITES_DOS_PARAMETROS` / `LIMITES_DA_ESCALA`), o telefone da casa, o opt-out e as chaves de
template. **Nenhum campo novo, nenhuma migration.**

---

## 5 · O comentário velho, corrigido

A fábrica da escala curta foi trocada de `[10, 20, 30]` para `[90, 180, 300]` em 29/09
(`2026-09-29-cadencia-da-regua.md`), mas o **comentário** ficou na versão antiga em dois arquivos. Só
comentário — nenhuma linha de código mudou:

| Onde | Antes | Depois |
|---|---|---|
| `src/lib/remarketing/regua.ts:48` | fábrica `[10, 20, 30]` min, "o toque 01 sai em minutos" | fábrica `[90, 180, 300]` min, toque 01 em 90 min e seguintes em 3 h e 5 h |
| `src/lib/remarketing/regua.ts:147,149` | `[10, 20, 30]` · cadência `10 → 20 → 30` | `[90, 180, 300]` · cadência `90 → 180 → 300` |
| `src/lib/admin/remarketing-config.ts:171` | lista `([10, 20, 30]` min) | lista `([90, 180, 300]` min) |
| `src/lib/admin/remarketing-config.ts:211` | o banco guarda `("10,20,30")` | o banco guarda `("90,180,300")` |
| `src/lib/admin/remarketing-config.ts:418` | mensagem de erro: `ex.: 10,20,30` | `ex.: 90,180,300` |

**Ficam como estão** (são exemplo ou histórico, não fábrica): `regua.ts:96` — o parágrafo que explica por
que o `[10, 20, 30]` **original** era rápido demais — e `remarketing-config.ts:181` — o exemplo de
parsing `" 10 , 20,30 " → [10, 20, 30]`, que demonstra o separador, não a fábrica.

---

## 6 · Como isto fica travado

| O quê | Onde |
|---|---|
| Os escalares como cadastro | `PARAMETROS_DO_CADASTRO` e `remarketing-config.test.ts` |
| A escala curta como cadastro, fora dos vigentes | `CHAVE_DA_ESCALA` + bloco próprio na tela |
| A fábrica `[90, 180, 300]` | `ESCALA_DE_RETOMADA_MS` em `regua.ts` + `regua.escala.test.ts` |
| A cadência decidida | `docs/decisoes/2026-09-29-cadencia-da-regua.md` |
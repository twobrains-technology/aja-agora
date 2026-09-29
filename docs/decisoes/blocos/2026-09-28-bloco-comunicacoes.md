---
data: 2026-09-28
titulo: "Bloco comunicações — a mensagem certa para a macro-fase do funil, e a arte que anda com a chave"
status: aceita
decisor: executor (técnico) seguindo a decisão 5 registrada em docs/decisoes/blocos/2026-09-28-decisoes-da-frente-aja.md (o texto é do dono; a estrutura é código)
contexto: bloco-comunicacoes (FIX-387, FIX-388, FIX-389); fonte de design em docs/decisoes/blocos/2026-09-28-decisoes-da-frente-aja.md e na reunião de 22/09/2026
---

# ADR — bloco comunicações: a fase como fato, as chaves por fase × bem, e a arte amarrada à chave

Contexto (reunião de 22/09/2026, Kairo 12:02:49): a comunicação passa a ser por **macro-fase do
funil** — *"se o cara tá no início… ele chegou até visualizar a oferta… Já tá no finalzinho, é só
fechar?… a gente fecharia nesses três"* — e, quando o bem é conhecido, a mensagem diz o bem
(Bruna, 12:04:46: *"se a gente sabe que o cara quer moto, já colocar a palavra moto"*). Até aqui a
régua escolhia a chave do template só pelo BEM (`remarketing_oportunidade_<objetivo>`): quem parou
no início e quem só falta fechar recebiam a MESMA mensagem.

**Restrição global do PRD (decisão 5):** nenhum texto de comunicação vira texto fixo no servidor. O
texto entra por cadastro (template na Meta, via `usageKey`) e por prompt; este bloco entrega a
**ESTRUTURA** — a fase como fato do servidor, a lista ordenada de chaves e a arte do bem.

## Decisão 1 (FIX-387) — a fase é FATO do servidor, calculada por função pura sobre sinais de fonte única

**O que decidir:** onde nasce a fase e como ela lê os sinais.

**Escolhida:** os sinais (`viu_oferta`, `teve_proposta`) saem de um **fragmento único** em
`sinais-do-funil.ts`, e `faseDoFunil(sinais)` é **pura** — sem banco, sem relógio — devolvendo
`"inicio" | "viu_oferta" | "fechamento"`. O degrau mais FUNDO vence (proposta ⇒ fechamento, mesmo
sem o evento de oferta no histórico).

**Por quê, e o que já estava errado:** `teve_proposta` **não existia** como fragmento: o `EXISTS
(SELECT 1 FROM bevi_proposals …)` estava inline em **três** consultas (`percurso-queries.ts`,
`performance-queries.ts`, `exportacao/percurso.ts`), e o `viu_oferta` idem. Extrair — em vez de
criar a quarta definição — é o que mantém as telas concordando. Um teste de FONTE (`sinais-do-
funil.test.ts`) trava isso: os três consumidores precisam conter `viuOferta(`/`teveProposta(` e não
podem reescrever o predicado inline. Mudar o fragmento muda os três.

**Alternativa descartada:** derivar a fase em SQL dentro de cada consulta. Duas verdades para o
mesmo fato, e a que o time acreditasse seria a última que abriu.

## Decisão 2 (FIX-388) — a chave do template é `fase × bem`, com o GENÉRICO da fase como fallback

**O que decidir:** a forma das chaves e quem resolve "existe/aprovado".

**Escolhida:** a função PURA do motor devolve a **LISTA ORDENADA** de chaves candidatas —
`[remarketing_<fase>_<bem>, remarketing_<fase>_generico]` — e **não decide** se o template existe ou
está aprovado. Quem pergunta à Meta e escolhe é o `template-dispatch`, que:

1. percorre a lista e usa a **primeira `APPROVED`** (o específico vence o genérico);
2. sem nenhuma aprovada, **ENFILEIRA** a primeira candidata e alerta — nunca o silêncio.

**Por quê:** a restrição do PRD proíbe a função pura de consultar template (ela deixaria de ser
pura). Com a lista, existe sempre uma alternativa mais larga para o mesmo momento — antes, se o
template do bem não estava aprovado, o toque ia direto para a fila, sem opção.

### As chaves exatas (para o dono cadastrar)

| fase | com bem conhecido | fallback (bem desconhecido) |
|---|---|---|
| `inicio` | `remarketing_inicio_carro` · `remarketing_inicio_moto` · `remarketing_inicio_imovel` | `remarketing_inicio_generico` |
| `viu_oferta` | `remarketing_viu_oferta_carro` · `remarketing_viu_oferta_moto` · `remarketing_viu_oferta_imovel` | `remarketing_viu_oferta_generico` |
| `fechamento` | `remarketing_fechamento_carro` · `remarketing_fechamento_moto` · `remarketing_fechamento_imovel` | `remarketing_fechamento_generico` |

**Ordem de fallback, sempre:** a 1ª candidata é `remarketing_<fase>_<bem>`; a 2ª é
`remarketing_<fase>_generico`. Sem bem conhecido, a lista tem **uma só** chave: o genérico da fase.
O eixo do bem é canônico (`carro`/`moto`/`imovel`, com `auto`/`automovel`/`autos` ⇒ `carro`).

**✅ O que fazer no cadastro:** criar os 12 `usageKey`s acima na tela de templates (o vínculo
`usageKey → metaName` é do banco). Enquanto não houver aprovado, o toque fica `pending` na fila e
aparece — nada se perde.

## Decisão 3 (FIX-389) — a arte sai da MESMA comunicação que a chave

**O que decidir:** como garantir que a arte nunca seja de um bem diferente do da chave.

**Escolhida:** `comunicacaoDoToque(fase, objetivo)` devolve `{ fase, chaves, arte }` numa peça só —
as duas nascem do MESMO objetivo. Chave genérica (sem bem) **nunca** vem com arte de bem
(`arteDoObjetivo` devolve `null`). O comportamento de "arte só com bem conhecido" (AJA-14) já
existia e continua coberto; o que o item acrescenta é a ligação com a fase e o teste que a trava
(`motor.arte-fase.test.ts`, nos três estados).

**Dívida registrada (fora do escopo deste bloco):** a tela de forma do toque
(`admin/remarketing-queries.ts`) continua casando o objetivo com o nome do template pela função
**LEGADA** `templateDoObjetivo` (`remarketing_oportunidade_<objetivo>`), porque a tela ainda não
conhece a fase. `templateDoObjetivo` foi mantida e documentada como legado — o **disparo** não a usa
mais. Levar a fase até a tela (mostrar os 3 templates por bem) é item do bloco dono da tela.

## Resumo

| item | decisão | por quê |
|---|---|---|
| FIX-387 | `faseDoFunil` pura sobre sinais de fontes única (`viuOferta`/`teveProposta` extraídos de 3 consultas) | uma verdade para o mesmo fato; teste de fonte impede a quarta definição |
| FIX-388 | lista ordenada `[fase+bem, genérico]`; a função pura NÃO checa template; o dispatcher escolhe a 1ª aprovada ou enfileira | regra dura do PRD (texto não decide no servidor); sempre há fallback no mesmo momento |
| FIX-389 | `comunicacaoDoToque` amarra chave e arte à mesma entrada; genérico nunca leva arte de bem | impede a arte de um bem vazar para quem nunca falou dele (AJA-14) |
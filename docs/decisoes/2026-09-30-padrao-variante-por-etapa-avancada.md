# Padrão — variante por etapa avançada: "por qual A/B o cliente veio?"

**Decisão do dono, 30/09/2026.** Vale para **todo teste A/B** do produto — não só o do telefone.

> *"isso vai ser um padrao daqui pra frente, a etapa que o cliente avancou, ele veio por qual A/B?
> essa eh a resposta que temos que dar."*
>
> *"isso vai acontecer tbm para as outras, entao mantenha isso como padrao."*

## A regra

**Em cada etapa do funil, o painel responde: das pessoas que avançaram até esta etapa, quantas vieram
por cada braço do teste.**

1. A variante **não é atributo global da pessoa** — é **por etapa**: a do braço em que ela recebeu a
   conversa **em que avançou** para aquela etapa (a **primeira** vez que o fato daquela etapa aconteceu).
2. **Fechamento em cada etapa:** `braço A + braço B + sem variante = total daquela etapa`. A pessoa
   conta **uma vez por etapa** — o desempate é "a primeira vez que o fato ocorreu". É isto que faz o
   número ser respondível em vez de achismo.
3. **Entre etapas** a pessoa pode estar num braço numa etapa e noutro na seguinte. Isso **é a
   informação** que o dono quer (o caminho que ela percorreu), não um defeito — a tela diz isso em uma
   linha.
4. **A visão global** (topo do funil e Percurso, que dão UMA posição por pessoa) é a mesma regra lida no
   **degrau mais fundo que ela alcançou**.
5. **Canal identificado não participa:** conversa que nasce identificada (WhatsApp) não recebe braço —
   ela nunca foi a etapa "não identificado". Quem veio do web e continuou no WhatsApp mantém o braço da
   conversa **web** que a identificou.
6. **Quem nunca avançou** para a etapa em questão fica no balde `sem variante`.

## Por que é genérico (e o que isso exige do código)

O produto vai ter **outros testes**. O mecanismo é o mesmo para todos, então nada pode ficar amarrado ao
teste do telefone:

- **Um teste = uma chave de experimento** no `metadata` da conversa. Hoje existe **uma**:
  `telefoneDoDesbloqueio` (`CHAVE_DO_TESTE_NO_METADATA`, em
  `src/lib/chat/resultado-do-teste-do-telefone.ts`), com braços `A` e `B`. Um teste novo entra como uma
  chave nova — sem tocar no filtro, nas queries, no export ou na UI.
- **Nada de chave hardcoded.** O filtro, o fragmento SQL e a coluna do export recebem **qual
  experimento** estão lendo (um registro de experimentos conhecidos), não o nome do telefone.
- **A UI se prepara para N:** o seletor de variante lista os experimentos existentes; com um só, ele
  aparece como o de hoje. Com dois, dois seletores — sem redesenho.
- **O fragmento é por etapa e reusa o fato que já existe.** A atribuição se apoia na subquery/CTE que
  **já** computa o fato daquela etapa por pessoa (`src/lib/admin/sinais-do-funil.ts` é a fonte única do
  funil). Criar um segundo caminho para o mesmo fato é o defeito clássico deste tipo de painel — foi o
  que produziu a divergência "viu oferta" (FIX-398).
- **No export** a variante sai como **coluna**, uma por experimento, por pessoa onde a linha é pessoa e
  por conversa onde a linha é conversa. **Nunca** com o fallback que deriva braço por hash: exportar é
  afirmar, e o arquivo não pode dizer como fato um braço que nunca aconteceu.

## Anti-padrões (já medidos e descartados nesta frente)

- **"Uma variante por pessoa"** (atributo global): dá um número que não responde à pergunta da etapa e
  some com o caso real da mesma pessoa em braços diferentes.
- **Atribuir pelo valor de hoje no banco** quando o teste tem override que **regrava** a variante (o
  `?variante=` de QA do FIX-403 regrava): o instante do evento é irrecuperável — atribuir pelo valor
  atual seria inventar.
- **Atribuir por evento** (e não por pessoa-por-etapa): a mesma pessoa contaria duas vezes na mesma
  etapa (`A + B > total`) e o funil deixaria de fechar.
- **Filtrar custo por variante:** o gasto da Meta não tem variante. O bloco de custo/CPC/CPL sai marcado
  como **não aplicável ao recorte**, com o funil visível.

## Onde isto mora no código

- Filtro: `src/lib/admin/filtro-variante.ts` (allowlist por experimento; valor desconhecido → `null`
  = não filtra, mesma régua do `filtro-origem.ts`).
- Atribuição por etapa: fragmento que recebe (experimento, etapa, período) e devolve a condição SQL.
- Telas: Performance, Percurso, Campanhas, Exportação, Remarketing e Mapa de calor — com `default =
  todas`, de modo que nenhum número que a operação lê hoje se move.
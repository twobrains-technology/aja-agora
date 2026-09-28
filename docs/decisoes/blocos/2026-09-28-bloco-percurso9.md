---
data: 2026-09-28
titulo: "Bloco percurso9 — o shape da lista para ligar, a ordem 'parado há mais tempo' e a exportação que leva o filtro"
status: aceita
decisor: executor (técnico) — a única decisão de produto envolvida já veio fechada da cliente
contexto: bloco-percurso9 (FIX-382, FIX-383, FIX-384), overlap nível 2 com bloco-pessoa
---

# ADR — bloco-percurso9

Este bloco existe para uma pergunta literal da cliente (Bruna): *"Eu preciso saber quem são
esses nove… eles continuam parados desde a semana passada"* (22/09) e *"temos o contato do
cliente, certo? digo aquele telefone, eu poderia ligar para ele, certo?"* (25/09). O que a tela
de Percurso entregava não dava para ligar: faltava o autor da última interação, o motivo nomeado
de a pessoa estar fora da régua, e a lista abria pelo **mais recente** — o oposto da pergunta.

## 1. Ordem em `modo=parou`: parado há MAIS tempo primeiro (FIX-382)

Não há trade-off a decidir: é o pedido literal. A ordenação passa a depender do modo —
`modo === "parou"` → `ultima_atividade ASC`; qualquer outro (incluindo o default sem modo do
chamador) continua `DESC`. O desempate por `chave` fica nos dois casos (sem ele, duas pessoas com
o mesmo instante trocam de lugar entre páginas e a linha some).

`ultima_atividade` é o último sinal de vida (`GREATEST(última chegada, última mensagem do
cliente)`) — é a medida certa de "há quanto tempo parou". Não foi trocada por
`ultimaInteracaoEm`: a pessoa pode ter voltado a bater na página sem conversar, e isso é
atividade.

## 2. O shape da pessoa ganha cinco campos (FIX-382)

Em `PessoaDoPercurso` (`percurso-types.ts`):

- `ultimaInteracaoEm: string | null` — instante da última fala trocada (cliente OU agente).
- `ultimaInteracaoAutor: "cliente" | "agente" | null` — quem falou por último.
- `pediuSimulacao: boolean` — recebeu oferta/simulação.
- `naRegua: boolean` — tem linha em `remarketing_touches`.
- `motivoForaDaRegua: MotivoDeExclusao | null` — o motivo NOMEADO de estar fora.

**Três decisões que valem registro:**

1. **`system` fica fora da "interação".** A última mensagem considera `user` e `assistant`; o
   papel `system` é log, não fala. Sem esse corte, a linha diria "agente" para um turno que o
   cliente nunca viu.
2. **`ultimaInteracaoEm` é separado de `ultimaAtividade`.** O par (autor, instante) tem que ser
   coerente: se o agente respondeu por último e a data fosse a de `ultimaAtividade` (que só olha
   chegada e mensagem do cliente), a linha diria "agente" com uma data anterior à própria
   resposta.
3. **`pediuSimulacao` é o MESMO fato de `viu_oferta`** (`ARTIFACTS_DE_OFERTA_SQL`:
   `real_offer` + `simulation_result`). É o "de fato pediram a simulação" do levantamento de
   22/09 (plano §AJA-15/Task 3), que manda usar o degrau honesto `viram_oferta` e **não** criar
   métrica paralela. Não é campo novo no SQL: é a exposição do fato no shape plano.

**Régua — a semântica do par:** `naRegua` é "existe linha de régua para a conversa"; quando
`true`, `motivoForaDaRegua` é `null` (não há exclusão a nomear — mostrar "já está na régua" ali
seria ruído). Sem conversa, `naRegua=false` e o motivo é `sem_contato`, um motivo NOMEADO. Fora da
régua e não elegível, sai o motivo que a guarda devolveu — **nunca nulo em silêncio**.

**Custo aceito — a régua é lida duas vezes por request.** A rota `GET /api/admin/percurso` já
anexava um objeto `regua` mais rico (`status`, `step`, `nextTouchAt`, `telefoneMascarado`) que o
componente cliente consome. Em vez de mudar esse contrato de tela dentro deste bloco, a leitura da
régua passou também para `listarPercurso` (uma consulta de lote por `avaliarReguaPorIds`, sem
N+1). São duas passadas sobre a MESMA função pura — não há duas verdades, mas há trabalho
redundante. **Follow-up sugerido (fora deste bloco):** mover o objeto `regua`/`telefoneMascarado`
para o shape do item e esvaziar a rota, matando a segunda passada.

## 3. Exportação leva o recorte da lista (FIX-383)

`OpcoesDeExportacao` ganha `passo`, `modo`, `origem`, `campanha` e `q`; a rota de download e a de
contagem os leem da querystring, e a tela de exportação os repassa do seu próprio URL.

**A escada da exportação foi alinhada à da lista.** O SQL de `exportarPercurso` tinha **oito**
níveis enquanto a lista tem **nove** (`so_pre_preenchida` entrou na AJA-01) — o resultado é que
`fechado` saía rotulado como `proposta` e o filtro por degrau devolvia outro recorte. Agora usa os
mesmos predicados de `sinais-do-funil`/`mensagem-pre-preenchida` e o mesmo CASE de nove degraus. A
regressão compara arquivo × lista **chave a chave** (nem uma a mais, nem a menos).

Dois consertos colaterais no caminho:

- `exportarPercurso({ incluirSemConversa: false })` referenciava `cr.chave` no `SELECT` externo,
  onde o alias não existe — passou a usar a coluna `conversation_id` do `final`.
- `contarPercurso`, com recorte, materializa as linhas (`exportarPercurso().length`) em vez do
  caminho leve: o cartão e o arquivo não podem discordar. Sem recorte, mantém a consulta barata de
  sempre (o teste "a contagem bate com as linhas" prova que os dois lados concordam).

**Limite conhecido:** a exportação resolve a chave da pessoa com um subquery **sem janela** e a
lista com um limitado à janela. Para o mesmo período semeado isso coincide; para pessoas cujo
contato foi resolvido fora do período, os dois podem divergir. Não foi mexido aqui (o desenho da
chave é o mesmo `chaveDaPessoa`, que a exportação ainda reimplementa à mão) — é dívida declarada,
candidata a um bloco de unificação do SQL de percurso.

## 4. Limpeza: `proposta_em_teste` (FIX-384)

Medido em produção: 5 propostas em 01–21/09, todas em conversa `is_simulated`, mesmo telefone, em
16/09. O painel excluía e mostrava 0; a **administradora** continuava com as 5, e nada apontava
para elas. A limpeza classificava só por sinais de conversa e nunca olhava `bevi_proposals`.

Novo motivo `proposta_em_teste`, avaliado **antes de `teste`**: é o mais específico e o único que
conta a história ("há venda de teste na administradora"). A guarda exige `jaMarcadaComoTeste &&
propostas > 0` — uma proposta REAL numa conversa de cliente **nunca** entra por causa dela. O
candidato e o CSV ganham `propostas` (contagem) e `proposta_criada_em` (data da última); sem
proposta, a data sai nomeada (`sem proposta registrada`), porque célula vazia derruba o download.

## O que este bloco NÃO fez (de propósito)

- Não abriu rota nova nem página nova: o shape entrou na rota que a tela já usa.
- Não tocou no SQL de contagem por pessoa (`bloco-pessoa` é dono dessa região; overlap de nível 2,
  merge com o orquestrador).
- Não reformatou os arquivos compartilhados.
- Não mexeu no componente `tabela-percurso.tsx` além do necessário para o tipo.
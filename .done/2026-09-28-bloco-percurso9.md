# bloco-percurso9 — a lista para ligar, a ordem que responde e a exportação com o filtro

**Status:** concluído · 2026-09-28 · branch `kairogyn/feat-percurso-lista-parados`
**Itens:** FIX-382 · FIX-383 · FIX-384 (+ ADR)
**Origem:** pedido da cliente (Bruna) — *"preciso saber quem são esses nove… eles continuam
parados desde a semana passada"* (22/09) e *"temos o contato do cliente… eu poderia ligar?"* (25/09).

## O que foi entregue

### FIX-382 — o shape da pessoa e a ordem (o coração do pedido)
`PessoaDoPercurso` (`percurso-types.ts`) ganha cinco campos; `listarPercurso`
(`percurso-queries.ts`) os preenche:

| campo | o que é |
|---|---|
| `ultimaInteracaoEm` | instante da última fala trocada (cliente **ou** agente) |
| `ultimaInteracaoAutor` | `"cliente"` \| `"agente"` \| `null` — quem falou por último |
| `pediuSimulacao` | recebeu oferta/simulação (mesmo fato de `viu_oferta`) |
| `naRegua` | existe linha de régua para a conversa da pessoa |
| `motivoForaDaRegua` | o motivo **nomeado** de estar fora (`conversa_web`, `sem_contato`, …) ou `null` |

Em `modo=parou` a lista passa a abrir **pelo mais antigo** (`ultima_atividade ASC`). Nos demais
modos segue `DESC`. O desempate por `chave` continua nos dois casos.

### FIX-384 — proposta criada em conversa de teste
Novo motivo `proposta_em_teste` (avaliado **antes** de `teste`): conversa `is_simulated` **com**
`bevi_proposals` sai nomeada, com a contagem de propostas e a data da última. O CSV de limpeza
ganha as colunas `propostas` e `proposta_criada_em`. Proposta **real** (conversa de cliente) nunca
entra por causa dele.

### FIX-383 — a exportação leva o recorte
`OpcoesDeExportacao` ganha `passo`/`modo`/`origem`/`campanha`/`q`; a rota de download, a de
contagem e a tela de exportação os repassam. A escada do SQL de exportação foi alinhada à da lista
(**nove** degraus — antes eram oito, e `fechado` saía rotulado como `proposta`). Consertos
colaterais: `incluirSemConversa=false` referenciava alias fora de escopo; `contarPercurso` com
recorte materializa as linhas para não divergir do arquivo.

## Prova (medida nesta branch)

```
pnpm typecheck                                              → verde
pnpm vitest run src/lib/exportacao/                         → 5 arquivos / 33 testes
pnpm vitest run src/lib/admin/                              → 38/39 arquivos verdes
  (handoff-queries.integration.test.ts: 1 vermelho PRÉ-EXISTENTE —
   confirmado com `git stash` do bloco: falha igual sem as mudanças)
pnpm vitest run src/lib/admin/percurso-queries.integration.test.ts
  + limpeza-queries.integration.test.ts + limpeza.test.ts
  + src/components/admin/percurso/percurso.na-tela.test.tsx → 81 testes verdes
```

TDD strict: os testes de FIX-382 (autor/régua/simulação/ordem), FIX-384 (5 propostas ⇒
`proposta_em_teste`) e FIX-383 (arquivo × lista, **chave a chave**) rodam contra Postgres real
(janela sorteada por execução), com telefone/e-mail **falsos**.

## Commits

- `5b07705a` — `feat(percurso): a lista de parados diz quem falou por último e abre pelo mais parado` (FIX-382)
- `0c521525` — `fix(exportacao): o arquivo leva o recorte da tela (etapa, origem e busca)` (FIX-383)
- `34681359` — `feat(limpeza): conversa de teste com proposta sai nomeada como proposta_em_teste` (FIX-384)

## Decisões de design (ADR)

`docs/decisoes/blocos/2026-09-28-bloco-percurso9.md`. Em resumo: `system` fora da "interação";
`ultimaInteracaoEm` separado de `ultimaAtividade` para o par (autor, data) ser coerente;
`pediuSimulacao` = fato de `viu_oferta` (sem métrica paralela); `naRegua` ⇒ `motivo` `null`;
duplicação aceita da leitura da régua (rota mantém o objeto `regua` da tela) com follow-up de
unificação; `proposta_em_teste` precede `teste`; ordenação só muda em `modo=parou`.

## Pendências honestas (fora do escopo deste bloco)

- **Régua lida duas vezes por request** (rota + query). Mesma função pura, sem divergência, mas com
  trabalho redundante — mover `regua`/`telefoneMascarado` para o shape do item e esvaziar a rota.
- **`exportacao/percurso.ts` reimplementa a chave da pessoa** (subquery de contato **sem janela** x
  lista com janela). Coincide para o mesmo recorte; pode divergir em contato resolvido fora do
  período. Candidato a bloco de unificação do SQL de percurso.
- **Overlap nível 2 com `bloco-pessoa`** em `percurso-types.ts`/`percurso-queries.ts`/`exportacao/`:
  as regiões são disjuntas e o merge fica com o orquestrador (ordem recomendada: `bloco-pessoa`
  primeiro).
- `src/components/admin/percurso/escada-do-percurso.tsx` tem **drift de formatação pré-existente**
  (`biome check` acusa e não foi tocado por este bloco).

## Shape final da pessoa na lista (para a entrega "quem são os 9")

Campos do item de `GET /api/admin/percurso`:

```
chave, contactId, visitorId, nome, telefone, email, canal,
origemLabel, origemTipo, origemFonte, campanha, criativo,
nomeDaCampanha?, entityId?, landingPath,
primeiraChegada, ultimaAtividade,
ultimaInteracaoEm, ultimaInteracaoAutor,
pediuSimulacao, naRegua, motivoForaDaRegua,
chegadas, conversas, mensagensDoCliente, passo, stageDoLead, perdido, conversationId
```

(a rota ainda anexa `telefoneMascarado` e `regua: { naRegua, motivo, status, step, nextTouchAt }`
para a coluna da tela.)
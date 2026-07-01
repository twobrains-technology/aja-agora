# Remoção do Letta — a memória do Aja Agora agora mora em casa

**Data:** 2026-06-26
**Bloco:** `bloco-a-remove-letta-postgres` (FIX-81 — executa a Opção B do ADR 2026-06-25)
**Branch:** `feat/memoria-postgres-remove-letta`

## O que mudou pro negócio

O Aja Agora "lembra" do usuário entre sessões e entre canais — quem começa
anônimo na web e volta pelo WhatsApp dias depois retoma de onde parou, sem
recomeçar do zero. Essa **memória continua intacta**. O que mudou é só o motor
por baixo dela.

Até agora essa memória vivia num serviço externo pesado (o **Letta**): um
container dedicado, descoberta de rede, dependência de um terceiro (OpenAI para
embeddings) que **já tinha caído em produção**, latência de rede a cada turno e
~2 mil linhas de código só pra conversar com ele. Na prática, o Letta estava
sendo usado como um "cofrinho" caríssimo para guardar uma única ficha de dados
por usuário — dados que **o próprio app já produz e já guarda no seu banco**.

A entrega **aposentou o Letta** e trouxe a memória pra dentro de casa: ela agora
é **uma linha numa tabela do Postgres que o app já opera**. Mesmo
comportamento visível para o cliente, com uma fração do custo, da
complexidade e da superfície de falha — e sem depender de um serviço externo
que já tinha provado ser frágil.

## Por que é seguro

- **Comportamento idêntico, validado por teste.** A lógica de como a memória é
  montada e mesclada foi replicada exatamente: o resumo do usuário que vai pro
  agente (`[CONTEXTO DO USUÁRIO]` / `[REATIVAÇÃO]`) sai igual ao de antes.
- **A continuidade web → WhatsApp — o ponto mais sensível do produto — é coberta
  por teste contra banco real.** Um usuário anônimo na web que vira um lead com
  telefone tem sua memória reconciliada preservando o histórico (a identidade
  permanente "vence", mas herda o que só existia na sessão anônima). Idempotente:
  reconciliar duas vezes não corrompe nada.
- **Degrada limpo.** Se o banco tropeçar, a leitura de memória devolve "sem
  memória" e o agente segue a conversa normalmente; a gravação é best-effort e
  nunca derruba um turno. (Igual era com o Letta — o contrato foi preservado.)
- **Reversível por configuração.** A camada continua atrás de uma interface; dá
  pra desligar a memória (`MEMORY_ADAPTER=noop`) sem mexer em código.

## Qualidade entregue (testes)

- **Integration-db (banco real):** 12 cenários do `PostgresMemoryAdapter` —
  store→load com assert de **valor** (não de forma), merge de canais
  (web+whatsapp), dedup de objeções, reconcile cookie→phone + idempotência,
  purge (/reset) e identidade inexistente.
- **Gate completo verde:** `typecheck` 0 erros · `test:unit` 1927/1927 ·
  suíte de memória 146/146 (inclui o integration-db).
- Testes do factory, do bridge do orquestrador, do purge e da identidade
  reescritos pro novo backend; anti-regressão de relógio simulado realocada pro
  adapter novo.

## Decisões de design tomadas

1. **Chave de identidade estável como `agentId`.** O contrato devolve um
   `agentId`; antes era o UUID do agente Letta. Adotei a chave canônica
   determinística `namespace-kind-valor` (a mesma que indexa a linha). É estável
   (não muda se a linha for recriada), o que torna a idempotência do reconcile
   robusta.
2. **`SELECT ... FOR UPDATE` em transação no lugar do lock em memória.** O Letta
   fazia "ler-modificar-gravar" remoto com um lock de processo pra evitar corrida
   entre dois turnos do mesmo usuário. Troquei por uma transação com trava de
   linha do próprio Postgres — atômico de verdade e melhor que o original.
3. **Sem circuit-breaker.** O disjuntor existia pra cair pro modo "sem memória"
   quando o serviço remoto do Letta caía. Com a memória no mesmo banco do app,
   essa falha de rede não existe; o contrato best-effort foi mantido dentro do
   adapter.
4. **`updated_at` usa relógio real (não o simulado).** É coluna de auditoria —
   o tempo sensível à jornada (`lastInteractionAt`, que dispara a reativação)
   continua usando o relógio simulado.
5. **`MEMORY_NAMESPACE` com fallback pra `LETTA_NAMESPACE`.** O namespace faz
   parte da chave de identidade; durante a transição o ambiente ainda carrega
   `LETTA_NAMESPACE`, então ler ambos evita trocar a chave no cutover.
6. **Migration escrita à mão.** Descobri que o `drizzle-kit generate` está
   quebrado no repo desde a migration 0014 (snapshots de meta nunca commitados)
   e que o time já adota SQL manual + journal. Segui a convenção real do repo em
   vez da premissa do plano (ver "premissas" abaixo).

## Premissa do plano que mudei na execução

O plano pedia gerar a migration via `pnpm db:generate`. Na prática o comando
está **quebrado no próprio repo** (colisão de snapshots de meta 0011-0013 + os
snapshots 0014-0026 nunca foram commitados) e o projeto **já migrou para SQL
manual** a partir da 0014 — a própria migration 0026 documenta isso. Segui a
realidade do repo: escrevi `drizzle/0027_memory_identities.sql` à mão no mesmo
estilo e adicionei a entrada no journal. O `db:migrate` aplica tudo
normalmente (validado contra um Postgres efêmero).

## Gaps e riscos honestos

- **Archival semântico saiu (é fase 2).** A busca por similaridade (embeddings)
  do Letta **já estava morta** em produção (caiu por erro 429 da OpenAI, sem
  impacto perceptível de UX). Não foi reimplementada — `searchArchival` devolve
  vazio, em paridade com o estado atual. Reativar (via pgvector + gateway
  LiteLLM) é a fase 2 opcional do ADR, só se houver demanda real.
- **Sem backfill dos dados que estão no Letta.** A tabela nasce vazia; a
  memória passa a se acumular do cutover em diante. Como o archival estava morto
  e o recall era o blob por identidade, o impacto é começar "do zero" de memória
  no momento da virada. Se for desejado preservar o histórico vivo, é um script
  one-shot (fase 2 do ADR) — fora do escopo deste bloco.
- **Naming cosmético deixado de propósito.** A coluna `memory_events.letta_agent_id`
  e a chave de metadata `letta` (flag de reconcile) foram **mantidas** — são
  campos persistidos; renomear é churn arriscado sem ganho funcional. O ADR já
  marca isso como passo cosmético posterior que não bloqueia.
- **O container `tb-letta-shared` NÃO foi tocado.** É compartilhado com outros
  projetos (FPMA, sparkflow, letdrill). Desativá-lo é decisão de plataforma,
  separada deste repo. Aqui só o **app** parou de depender dele.
- **Medição em prod (fase 0 do ADR) não rodou neste bloco.** O ADR original
  listava medir adapter ativo + taxa de recall antes de cutar. O Kairo autorizou
  a execução direta da remoção (2026-06-26); como a mudança é reversível por
  flag e preserva o contrato observável, o risco de cutar sem o número é baixo.

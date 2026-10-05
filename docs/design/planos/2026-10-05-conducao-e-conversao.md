# Condução e conversão: primeiro turno, card do telefone, atribuição e leitura da conversa (plano de 05/10/2026)

**Goal:** a conversa entrega antes de interrogar, o turno do card do telefone pede uma coisa só, a
verba da Meta passa a ser lida com a atribuição certa, e quem opera o painel lê a conversa como o
cliente viu. Tudo verificado em produção.
**Arquitetura:** o funil (`nextGate`) já manda quem diz a categoria direto ao `credit` e já trava a
oferta atrás do telefone (A/B da call de 29/09). Os defeitos estão na **coerência texto × tela** (o
modelo não sabe o que o card daquele turno pede), em **uma rota fora do proxy** (`/direto`) e na
**leitura** do painel. Nada disso pede trava nova na fala.
**Stack:** Next 16 + LangGraph (`src/lib/agent/langgraph/`), Postgres/Drizzle, BullMQ (worker),
Langfuse v4 self-hosted, LiteLLM (gateway compartilhado TwoBrains), modelo `qwen` (mantido).

> Fonte: `.orientacao/mandato.md` (P1–P9) + adendo do Kairo de 05/10
> (`.orientacao/adendo-2026-10-05-pontos-do-kairo.md`). Cada afirmação abaixo foi validada no código
> de `main` (o que roda em produção desde 05/10 03:48; esta branch fez merge de `origin/main` em
> `d5441402`) e no banco de produção.

## Restrições globais

- **Invariante verificável vira código; conversa é do modelo** (CLAUDE.md do repo). 🚫 Nenhum regex ou
  guard sobre fala sem âncora de estado. 🚫 Nenhum texto de comunicação novo fixo no servidor.
- **Unidade = PESSOA**, fonte única `chaveDaPessoa` (`src/lib/admin/sinais-do-funil.ts`). Não criar
  segunda definição de pessoa, conversa ou "chegou". Atribuição sem sinal = "sem atribuição".
- 🚫 Nenhum teste ou bloco dispara WhatsApp real. 🚫 Nenhum relatório é enviado a terceiros.
- Migration só pelo fluxo do ambiente (drizzle no deploy), nunca na mão contra o banco.
- Mexeu em `SYSTEM_PROMPT`/`BASE_SYSTEM_INSTRUCTION` → `pnpm sync-prompts` contra o Langfuse de
  **produção** + `pnpm prompts:check` verde (o CI barra deploy com prompt defasado).
- Texto visível em português com acento. Commits Conventional PT-BR com `HUSKY=0`. pnpm só.
- TDD por bloco: teste primeiro, vê falhar, corrige, vê passar. Teste **pontual** + `pnpm -s typecheck`.
- Gate de toda onda inclui `~/.local/bin/skills-doctor` (P9).

## O que foi validado (e o que NÃO se sustentou)

| ponto | veredito | evidência |
|---|---|---|
| P1 interroga antes de entregar | ✅ | 15 conversas com 1 fala do cliente terminam em "…modelo/tipo em mente?" (janela 02–05/10). `system-prompt.ts:64` manda perguntar o modelo antes do valor; `gate-questions.ts` (case `credit`) repete. O card na tela pede **valor**, e o texto pede **modelo**. |
| P2 card do telefone não converte | ✅ parcial | O card é alcançado: 14 conversas reais, 5 desbloquearam (parte delas é teste da casa). Nas que morreram, o texto do **turno do reveal** faz outra pergunta ("Você já fez consórcio antes?") enquanto o card pede o WhatsApp. `converse.ts:665` só dá o fato ao modelo quando a oferta já existe no estado; no turno em que a busca roda, ele não sabe que o card vai aparecer. |
| P3 a régua desiste sozinha | ❌ refutado | A "Lucia" recusou três vezes ("Não tenho interesse", "Não quero continuar", "Nenhum"); o agente respeitou num turno comum. Sem mudança. |
| P4 toques vencidos | ✅ reformulado | Worker sadio (BullMQ a cada 30 s; 9 disparos às 14:00 de 05/10). O José (`8b8f3244`) tomou **131049** da Meta, e o `main` já compensa (backoff de 3 dias). Defeito real: **6 linhas `ATIVO` presas no `teto_30_dias`** com `next_touch_at` vencido há 3 dias: o estado mente para quem lê o painel. |
| P5 57% da verba sem chegada | ✅ **como bug de atribuição** | `/direto`, destino dos anúncios, **não está em `LANDINGS` nem no `matcher`** (`src/proxy.ts:120`, `:294`). A visita nasce depois, em `/`, sem UTM, e a UTM fica no `referrer` (~130 visitas desde 02/10). A CR-002 "zero chegada" tem 58 cliques e conversas reais. Cortar a verba lendo isso estaria errado. |
| P6 anúncio de carro × demanda de imóvel | ℹ️ sem código | Leitura de demanda; entra no dossiê. Reler depois do B3, porque a atribuição muda. |
| P7 modelo | ℹ️ manter qwen | Decisão de 05/10 vigente. Gatilho de troca só depois do B1 medido em produção. Sem mexer no gateway compartilhado. |
| P8 crédito caiu em silêncio | ✅ | Nenhum tratamento de erro de billing; no web, `stream-error.ts:9-12` devolve `error.message` cru (inglês) ao cliente; no WhatsApp, só `console.error`. |
| P9 skills sumindo | ✅ | **Defeito em uma frase:** "`description` de SKILL.md com `: ` sem aspas é YAML inválido e o pi descarta a skill calado." Validador: `~/.local/bin/skills-doctor` no gate de cada onda. |
| A1 "Bruna" virou "Ana" | ✅ hipótese forte | Conversa `9b09c3c7`, 05/10 15:08:58. "Ana" é o nome de exemplo da tool `save_contact_name` (`src/lib/agent/tools/ai-sdk.ts`, "me chamo Ana…") e de directives; a âncora (`contact-capture.ts:141`) recusa corretamente, mas o tool-result só diz `name_invalid`, e o modelo inventou "o sistema não deixou registrar Bruna". Confirmar a sequência de tool calls no trace do Langfuse. |
| A2/A3 vários visualizadores, card cru | ✅ | `ConversationTimeline`, `WhatsappView`, `conversation-detail-panel`, `simulator-web`, `simulator-whatsapp`, `theater-chat`. `messages.content` guarda `[card: <tipo>]`; o payload vive em `artifacts`. |
| A4 ordem no mesmo minuto | ⚠️ não reproduzido no banco | Zero empates exatos de `created_at` em 10 dias. Reproduzir no painel antes de corrigir. |
| A5 custo de IA | ✅ (relatório) | Key `aja-agora-prod` no LiteLLM; o agregado diário sobrevive, a linha por requisição só 14 dias. Extra: `src/lib/admin/custo-de-ia.ts:276` chama `/api/public/metrics` (v1), o que dá **404** no Langfuse v4 (log de prod `langfuse-metrics-404`). |

## O que NÃO muda

- A ordem do funil em `nextGate` (o código é a fonte), o A/B do telefone (A = pede antes, B = borrado)
  decidido na call de 29/09, e a trava que esconde número da oferta antes do telefone.
- A âncora de nome (`nomeAncoradoNaFala`): a Lei 3 continua; muda só o que o tool-result conta.
- O modelo (`qwen`) e a config do gateway LiteLLM.
- A régua: 3 toques, teto de 3 em 30 dias, janela das 9h às 20h, compensação do 131049.
- A definição de pessoa/visita contável da dashboard.

---

## Onda 1 (blocos paralelos, arquivos disjuntos)

### B1 · Primeiro turno e turno do reveal pedem UMA coisa, a que está na tela (P1 + P2)
**Files:** Modify `src/lib/agent/system-prompt.ts`, `src/lib/agent/orchestrator/gate-questions.ts`,
`src/lib/agent/langgraph/nodes/converse.ts` (e/ou `nodes/contexto-da-tela.ts`). Test: novos
`*.test.ts` / `*.integration.test.ts` ao lado.
**Interfaces:** consome `leituraDoDesbloqueio`, `nextGate`, os eventos do turno. Produz: um bloco de
contexto que diz ao modelo **o que o card deste turno pede** (valor no `credit`, WhatsApp no
desbloqueio, também no turno em que a busca acontece).
- [ ] Teste que falha: (a) turno "Quero comprar um carro" → o prompt/contexto entregue ao modelo **não**
      manda perguntar modelo antes do valor e diz que o card de valor (parcela ao vivo) está na tela;
      (b) turno do reveal com desbloqueio pendente (A e B) → o contexto do modelo diz que o card do
      WhatsApp aparece neste turno e que a comparação libera com ele, **antes** da oferta estar no
      estado.
- [ ] Remover de `system-prompt.ts:64` a instrução "pergunte o modelo antes do valor" e trocar por:
      reaja e leve ao que está na tela (valor → parcela na hora). A pergunta do `credit` em
      `gate-questions.ts` deixa de abrir com "modelo em mente". Mantém "valor do bem" (FIX-2).
- [ ] Remover dos exemplos do `SYSTEM_PROMPT` nomes próprios copiáveis (ex.: "Kairo", "Alan" na
      seção do nome); usar marcador neutro (`<nome>`).
- [ ] Ver passar; `pnpm sync-prompts` contra **produção** (conferir a URL impressa) e `pnpm prompts:check` verde.
- [ ] Commit `test+fix(agente): primeiro turno e reveal pedem o que está na tela`.
**Gate:** `pnpm vitest run <testes do B1>` + `pnpm -s typecheck` + `grep -n "modelo em mente" src/lib/agent/system-prompt.ts src/lib/agent/orchestrator/gate-questions.ts` (sem resultado).

### B2 · O nome que o cliente disse é o nome gravado (A1)
**Files:** Modify `src/lib/agent/tools/ai-sdk.ts`, `src/lib/agent/orchestrator/directives.ts`,
`src/lib/leads/contact-capture.ts`, `src/lib/agent/langgraph/tool-adapter.ts` (se a tool do grafo
montar o resultado ali). Test: integração em `src/lib/agent/langgraph/`.
- [ ] Antes de codar: abrir o trace do turno 15:08:58 da conversa `9b09c3c7` no Langfuse de produção e
      registrar no diário a sequência real de tool calls (args + resultado). Se a hipótese cair,
      avise o chefe antes de seguir.
- [ ] Teste que falha (integração, modelo dublado): fala do cliente "Bruna", modelo chama
      `save_contact_name("Ana")` → `contact_name` continua nulo **e** o tool-result devolvido ao
      modelo carrega o FATO: o nome proposto não está na fala do cliente, e a fala foi "Bruna". O modelo
      pode então corrigir sozinho.
- [ ] `saveContactName` passa a devolver um motivo distinto para a recusa por âncora
      (`nao_ancorado`); a tool monta o resultado com a fala real (contexto ao modelo, nunca ao cliente).
- [ ] Tirar das descrições de tool e das directives os nomes próprios de exemplo copiáveis ("Ana",
      "Ricardo", "João", "Paulo"…); usar `<nome>`.
- [ ] Commit `test+fix(agente): recusa de nome conta ao modelo o que o cliente disse`.
**Gate:** `pnpm vitest run <teste do B2>` + `pnpm -s typecheck` + `grep -nE "me chamo Ana|sou o Ricardo|aqui é o João" src/lib/agent` (sem resultado).

### B3 · `/direto` registra a visita com a origem (P5)
**Files:** Modify `src/proxy.ts`, `src/proxy.landing-atribuicao.test.ts`. Create
`drizzle/<próximo>_backfill_utm_do_direto.sql` (+ journal do drizzle).
- [ ] Teste que falha: requisição a `/direto?utm_campaign=…&utm_id=…&fbclid=…` registra a visita com
      UTM/ids da campanha (o teste de acordo `LANDINGS` × `matcher` cobre `/direto`).
- [ ] Incluir `/direto` em `LANDINGS` e no `matcher`.
- [ ] Backfill **idempotente** (migration de dados, roda no deploy): visitas com `utm_campaign IS NULL`
      cujo `referrer` é `ajaagora.com.br/direto?…` com UTM recebem as UTMs/ids desse referrer. É sinal
      real, não atribuição inventada. Teste de integração do SQL em banco de teste.
- [ ] Commit `test+fix(atribuicao): /direto registra a visita com a campanha`.
**Gate:** `pnpm vitest run src/proxy.landing-atribuicao.test.ts <teste do backfill>` + `pnpm -s typecheck`.

### B4 · Linha da régua presa no teto não fica "vencida" (P4)
**Files:** Modify `src/lib/remarketing/regua.ts` e/ou `src/lib/workers/remarketing-cycle.ts`. Test ao lado.
- [ ] Teste que falha: linha `ATIVO`, `next_touch_at` vencido, pessoa com 3 toques em 30 dias → após o
      ciclo, `next_touch_at` = quando o toque mais antigo da janela sai dos 30 dias (ou saída
      explícita com `motivo_saida='teto_30_dias'`; escolha a que o painel de remarketing já sabe
      exibir e justifique no diário). Nunca fica no passado.
- [ ] Commit `test+fix(remarketing): linha no teto de 30 dias reagenda em vez de vencer`.
**Gate:** `pnpm vitest run <teste do B4>` + `pnpm -s typecheck`.

### B5 · Falha do LLM vira sinal, e o cliente nunca vê erro cru (P8)
**Files:** Create `src/lib/llm/erro-do-llm.ts` (+ teste). Modify `src/lib/chat/stream-error.ts`,
`src/app/api/webhook/whatsapp/route.ts` (só o `catch` do processor), o componente do chat que exibe
o erro do stream (copy em português, na UI).
- [ ] Teste que falha: `classificarErroDoLlm(err)` reconhece billing (`credit balance is too low`, 400
      do gateway/Anthropic), rate-limit, indisponível e outro.
- [ ] `stream-error` deixa de devolver `error.message` ao navegador: devolve um código, e a UI mostra o
      texto em português. Billing gera log estruturado `[llm-erro] {"tipo":"billing",…}` e dispara o
      alerta pelo caminho que já existe (`src/app/api/observability/alerta-langfuse` → SendGrid +
      Cortex), com dedupe de 1 h. Destinatário = o já configurado no projeto, sem destinatário novo.
- [ ] Commit `test+fix(observabilidade): erro de crédito do llm alerta e não vaza ao cliente`.
**Gate:** `pnpm vitest run src/lib/llm/erro-do-llm.test.ts <teste do stream-error>` + `pnpm -s typecheck`.

### B6 · Um visualizador de conversa, com o card como o cliente viu e ordem estável (A2 + A3 + A4)
**Files:** `src/components/admin/**` (visualizadores de conversa), as rotas `src/app/api/admin/**` que
devolvem mensagens (incluir o payload de `artifacts`), `src/components/chat/artifact-renderer.tsx`
(só se precisar de modo leitura). **Não** tocar `src/components/chat/theater/**` nem o chat do cliente.
- [ ] Reproduzir a ordem errada com a conversa `9b09c3c7` (e uma de WhatsApp) e registrar no diário a
      causa. Sem reprodução, documentar e cobrir só o critério de desempate.
- [ ] Teste de componente que falha: (a) mensagem `[card: telefone_do_desbloqueio]` renderiza o card
      (via payload) ou rótulo humano em português, nunca o identificador; (b) lote fora de ordem sai
      ordenado por `created_at` + desempate estável.
- [ ] Um único componente de leitura no admin. Os outros visualizadores do admin passam a usá-lo ou
      são removidos (lista no diário).
- [ ] Commit `test+fix(admin): um visualizador de conversa com o card que o cliente viu`.
**Gate:** `pnpm vitest run <testes do B6>` + `pnpm -s typecheck` + `grep -rn "\[card:" src/components/admin` (só no helper de rótulo).

### B7 · Custo de IA: a fonte do painel volta e o relatório sai (A5)
**Files:** Modify `src/lib/admin/custo-de-ia.ts` (+ teste). Create `scripts/relatorio-custo-ia.ts`.
- [ ] Teste que falha: a leitura do Langfuse usa a API de métricas v4 (`/api/public/v2/metrics`) e
      interpreta a resposta; 404 da v1 não volta.
- [ ] Script que gera a série **diária completa** do gasto da key `aja-agora-prod` no LiteLLM (desde o
      primeiro gasto), total por mês, reconciliação com o Langfuse de produção (diferença em %) e,
      onde der, separação conversa real × teste da casa. Saída: `~/Downloads/custo-ia-aja-agora-<data>.pdf`
      + `.csv`. **Não envia a ninguém.**
- [ ] Commit `test+fix(admin): custo de ia lê as métricas do langfuse v4` e `feat(scripts): relatório de custo de ia por dia`.
**Gate:** `pnpm vitest run src/lib/admin/custo-de-ia.test.ts` + `pnpm -s typecheck` + o PDF existe em `~/Downloads`.

## Onda 2 (integração, depois da onda 1)

- [ ] `pnpm -s typecheck` + `pnpm test:unit` + `pnpm test:integration` (os arquivos tocados) verdes na base.
- [ ] `~/.local/bin/skills-doctor` (exit 0).
- [ ] `pnpm prompts:check` verde contra produção.

## Critérios de pronto (verificáveis por comando)

1. `grep -n "modelo em mente" src/lib/agent/system-prompt.ts src/lib/agent/orchestrator/gate-questions.ts` → vazio.
2. `grep -nE "me chamo Ana|sou o Ricardo" src/lib/agent` → vazio; teste do B2 verde.
3. `/direto` em `LANDINGS` e no `matcher`; teste do B3 verde.
4. Teste do B4 verde.
5. `grep -n "error.message" src/lib/chat/stream-error.ts` → vazio; teste do B5 verde.
6. `grep -rn "\[card:" src/components/admin` → só o helper; teste do B6 verde.
7. Relatório de custo em `~/Downloads/` + teste do B7 verde.
8. Onda 2 verde.

## Pós-deploy (do chefe, em produção)

- `pnpm prompts:check` contra produção verde; imagem nova no ECS com `rolloutState=COMPLETED` **e** a
  tag/commit esperada (deploy verde pode ser rollback).
- Visitas novas em `/direto` com `utm_campaign` preenchida (SQL em prod); backfill aplicado
  (contagem de `utm_campaign IS NULL` com referrer `/direto?utm` → ~0).
- Nenhuma linha `ATIVO` com `next_touch_at` < agora − 1 h.
- Smoke em vídeo (claude-in-chrome no perfil Twin, `gif_creator` → mp4): abrir ajaagora.com.br,
  escolher categoria, ver o primeiro turno levando ao valor com a parcela na tela, informar o valor,
  ver o card do telefone com o texto apontando para ele, informar telefone **da equipe** (fora da
  régua) e ver a comparação liberar; no admin, abrir a conversa no visualizador único com o card
  legível. Depois, marcar a conversa de smoke como simulada.
- Antes/depois medido na janela seguinte (mortes em "pergunta de qualificação" e conversão do card), no dossiê.

## Riscos

- **Prompt no Langfuse:** editar o código sem `sync-prompts` não muda prod, e o CI barra o deploy. Mitigação: gate do B1.
- **Backfill de atribuição** muda números já reportados (paper de 05/10). É correção; o dossiê diz o antes/depois.
- **Smoke em produção** cria conversa real. Mitigação: telefone da equipe (excluído da régua) e `is_simulated` depois.
- **Amostra pequena** (14 conversas no card do telefone): o antes/depois é sinal, não prova estatística; dito assim no dossiê.

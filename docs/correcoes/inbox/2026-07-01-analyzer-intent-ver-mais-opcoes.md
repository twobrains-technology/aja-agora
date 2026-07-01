---
slug: analyzer-intent-ver-mais-opcoes
titulo: "Analyzer não tem categoria de intent pra 'quero ver mais do que já foi mostrado' — cai em ready_to_proceed e desvia o fluxo pra simulação/decisão"
status: inbox
severidade: alta
projeto: aja-agora
rodada: 2026-07-01 — conversa real da Mirella (automóvel, produção), reportada pelo Kairo
evidencia:
  - conversationId 69a38af1-567f-4f33-adbc-e8a9ce5ef83e (Postgres prod, mensagens/artifacts)
  - CloudWatch /ecs/tb/prod, log stream aja-agora/aja-agora/a80e778a32544935a51f81d8387cad1f, 18:48:00–18:49:10 UTC
mexe_em:
  - src/lib/agent/turn-analyzer.ts
  - src/lib/agent/orchestrator/index.ts
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/agent/example-selector.ts
  - docs/correcoes/todo/bloco-f-artifacts-produto/ (FIX-96, SEGURADO — aguarda aval do Bernardo)
---

## Palavras do operador
> "veja essa dinamica, ja temos varios probelmas, a saudacao ficou duplicada, os grupos foram
> mostrados apenas 6 opcoes se nao me engano em seguida eu pedi para ver todos e deu erro."
>
> (na sequência, ao ver a causa raiz): "quero discutir tb esse ponto aqui ficou pessimo e agora
> esotu com receio de tudo que foi construido. A IA nao esta respeitando o nosso fluxo e preciso
> que facamso amsi estudo a fundo e entender o porque isso aconteceu."

## Cenário
- **Rota/tela:** chat web (`ajaagora.com.br`), persona Rafael (auto), conversa real de teste
  (Mirella, não simulada).
- **Passos:**
  1. Mirella completa qualificação (primeira vez, R$ 106.000, sem lance próprio, considera lance
     embutido).
  2. Sistema apresenta `comparison_table` com 5 grupos (Itaú, Rodobens, Canopus×2, Âncora) e
     pergunta qual ela quer detalhar.
  3. Mirella responde **"quero ver todos"**.
  4. Sistema responde com 4 frases coladas (bug irmão, ver card separado) terminando em "tive um
     problema... pode confirmar o valor de R$106.000?" — e no MESMO turno já enche linguiça com
     "Boa, esse plano encaixa bem no que você pediu!" + card de decisão pra **Embracon**, que nunca
     apareceu em nenhum momento da conversa.
- **Dados usados:** conta de teste real (produção, homologação Bevi — ver CLAUDE.md do projeto).

## Esperado × Atual
- **Esperado:** "quero ver todos" deveria levar o sistema a mostrar MAIS opções (ou reconhecer que
  já mostrou tudo que tinha, ou——se a UX de "ver todos" não existe ainda——pelo menos re-apresentar
  o comparativo e perguntar de novo, nunca pular pra decisão sobre um plano nunca visto.
- **Atual:** o `userIntent` classificado foi `ready_to_proceed` (avançar/decidir), o que empurrou o
  agente pra `simulate_quota → get_rates → get_group_details → present_decision_prompt` sobre um
  grupo (Embracon) que só existia no discovery cache da Bevi, nunca em tela.

## Causa raiz — INVESTIGADA A FUNDO (não é pista, é achado provado)

1. **O analyzer entendeu certo, mas não tinha onde encaixar.** O log real:
   ```
   [analyzer] 2381ms | cat=auto ... intent=ready_to_proceed | Usuário quer ver todas as opções
   disponíveis, mas não responde à pergunta sobre prazo. Intent é procedural (ready_to_proceed)...
   ```
   O `reasoning` do próprio analyzer (`src/lib/agent/turn-analyzer.ts`) diz corretamente "usuário
   quer ver todas as opções" — mas o schema `userIntent` (linha ~73-91) só tem 6 valores:
   `ready_to_proceed | asking_question | providing_info | expressing_doubt | off_topic | neutral`.
   Nenhum expressa "quer ver MAIS do que já foi mostrado". A descrição de `ready_to_proceed` já
   inclui exemplos ambíguos ("me mostra") que colidem semanticamente com "quero ver todos".

2. **`userIntent` influencia o comportamento via few-shot examples**, não via roteamento
   determinístico: `runner.ts:153` passa `intent: userIntent` pro `selectExamplesForTurn`
   (`example-selector.ts`), que filtra os `PersonaExample` da persona ativa (tabela `personas`,
   campo `examples` jsonb) cujo `whenIntent` bate. Isso injeta few-shot no system prompt que
   VIESA o modelo pra "agir" (avançar) em vez de re-perguntar/re-listar.

3. **Sem groupId escolhido pelo usuário**, o modelo, empurrado a "agir", pegou um grupo que só ELE
   tinha visto no tool-result cru de `recommend_groups` (que agora — desde o fix de hoje removendo
   o teto de 3 recomendações, commit `faa81b6c` — retorna MAIS grupos do que o `present_comparison_table`
   escolhe exibir) e foi direto simular/decidir sobre ele, sem NUNCA reapresentar.

4. **Já existe uma trava (implementada hoje, commit `5b8d76a`, FIX-179)** que BLOQUEIA
   `simulate_quota/get_group_details/present_decision_prompt` sobre grupo não-exibido — isso já
   fecha o sintoma mais grave (card de decisão sobre plano fantasma). Mas a CAUSA RAIZ (analyzer sem
   categoria pra "ver mais") continua aberta: o usuário ainda vai receber uma diretiva de erro em
   vez de uma resposta útil quando pedir "ver mais" hoje.

## ⚠️ Ponto de discussão de ARQUITETURA (Kairo pediu discutir antes de implementar)

Duas perguntas em aberto que precisam de decisão, não só código:

1. **Nova categoria de intent** (`wants_more_options` ou similar) no schema do analyzer — isso é
   uma decisão técnica direta (adicionar enum value + regra), mas o ROTEAMENTO do que fazer com
   esse intent tem consequência de produto: hoje o sistema também limita a quantidade de opções
   "visíveis" à LLM (hero+5 é o desenho do FIX-96, ainda SEGURADO aguardando aval do Bernardo —
   `docs/correcoes/todo/bloco-f-artifacts-produto/fix-96-*.md`). Sem essa tela pronta, o que
   exatamente deveria acontecer quando o usuário pede "ver mais"? Repetir o comparativo dizendo que
   é tudo que tem? Alguma resposta textual? Isso PRECISA do aval de produto antes de implementar a
   UX (o roteamento técnico dá pra fazer sozinho).
2. **Camadas de defesa se sobrepondo**: agora existem DUAS linhas de guarda com propósitos
   parecidos — `artifact-guard.ts` (regras declarativas por artifactType/meta, sem visibilidade do
   payload específico) e o novo `shown-groups.ts` (FIX-179, granular por groupId/administradora).
   Vale a pena, depois, avaliar se `artifact-guard.ts` deveria absorver a lógica de "shown" como
   mais uma regra declarativa, ou se os dois sistemas devem continuar paralelos (um por
   artifactType-classe, outro por instância-de-dado). Não é urgente, mas é dívida de clareza
   arquitetural que vale registrar.

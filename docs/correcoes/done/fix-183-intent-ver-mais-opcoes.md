---
id: FIX-183
titulo: "Categoria de intent 'quer ver mais opções' no analyzer + roteamento (mata o desvio ready_to_proceed → simulação/decisão)"
status: done
commit: 100a6d48
executado_em: 2026-07-01
bloco: bloco-b-intent-ver-mais
severidade: alta
projeto: aja-agora
arquivos:
  - src/lib/agent/turn-analyzer.ts
  - src/lib/agent/qualify-state.ts
  - src/lib/agent/example-selector.ts
  - src/lib/agent/orchestrator/analyze.ts
rodada: 2026-07-01 — conversa real da Mirella (automóvel, produção), reportada pelo Kairo
evidencia:
  - conversationId 69a38af1-567f-4f33-adbc-e8a9ce5ef83e (Postgres prod, mensagens/artifacts)
  - CloudWatch /ecs/tb/prod, log stream aja-agora/aja-agora/a80e778a32544935a51f81d8387cad1f, 18:48:00–18:49:10 UTC
mexe_em:
  - src/lib/agent/turn-analyzer.ts
  - src/lib/agent/qualify-state.ts
  - src/lib/agent/example-selector.ts
  - src/lib/agent/orchestrator/analyze.ts
  - docs/correcoes/todo/bloco-f-artifacts-produto/ (FIX-96, SEGURADO — aguarda aval do Bernardo)
nota: "Este card carrega a análise-âncora COMPLETA da doença (lida também pelo bloco-a). O ESCOPO do bloco-b é só o intent + roteamento; a cura arquitetural (allowlist estado→ação→precondição) é o bloco-a/FIX-180. runner.ts é do bloco-a — bloco-b NÃO toca runner.ts."
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
  grupo ("Embracon") que **nunca foi exibido** e cuja origem é **indeterminável** (ver "Causa raiz").

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

3. **Sem groupId escolhido pelo usuário**, o modelo, empurrado a "agir", tentou simular/detalhar um
   grupo que NÃO estava em cena e caiu num erro de tool — e mesmo assim carimbou "Embracon" no card
   de decisão. Provado no banco/CloudWatch de prod (conv 69a38af1): (a) `simulate_quota` foi chamado
   mas **nenhum `simulation_result` foi emitido** → a tool voltou `{error}`; (b) **nenhuma
   `bevi_proposal` criada** → nada real fechou; (c) "Embracon" aparece em **um único lugar** da
   conversa inteira — a string do `decision_prompt`; (d) **zero args/resultado de tool logados** no
   turno → o erro foi um retorno `{error}` que não lança exceção (fast-path de id não-ancorado).

4. **CORREÇÃO de um overclaim meu (regra epistêmica):** eu havia afirmado que "Embracon era um grupo
   real da Bevi, só não mostrado". **Não dá pra provar isso.** O `present_decision_prompt` carrega só
   o NOME (string), não um id validado; e a tool que o antecedeu deu erro. Então "Embracon" pode ter
   sido **(a)** um grupo real do `recommend_groups` nunca exibido cujo id o LLM não conseguiu
   reproduzir, **ou (b)** um nome **confabulado** (Embracon é administradora famosa — o modelo conhece
   de treino). **Indistinguível, porque o resultado bruto do `recommend_groups` não é logado.** Essa
   indistinguibilidade É o problema: num produto de confiança, não poder responder "a IA inventou ou
   não?" é inaceitável.

5. **Já existe uma trava (commit `5b8d76a`, FIX-179)** que bloqueia
   `simulate_quota/get_group_details/present_decision_prompt` sobre grupo não-exibido — fecha o
   sintoma mais grave. Mas a CAUSA RAIZ continua aberta, e é maior que "falta um intent".

## 🔬 Modos de falha nomeados (estado da arte — ver `~/.claude/reference/arquitetura-agentes-ia.md`)

Este é o **card-âncora da doença**: os outros dois erros da mesma conversa são sintomas do mesmo
fundo. Cada peça tem nome na literatura:

- **Free-running ReAct off-script (Lei 1).** O LLM decide o fluxo da metade de trás da jornada
  (busca→recomendação→decisão→contrato) via prompt, não via controlador determinístico. O consenso
  do campo (Rasa CALM, 12-Factor Agents, OpenAI/Google ADK, Salesforce Agent Script) é o oposto:
  **lógica de processo é código determinístico; o LLM só faz NLU + copy.** A metade DA FRENTE (gates
  de qualificação, `qualify-state.ts`) já faz isso — a de trás não. Todo susto nasce aí.
- **Instruction-following degradation (Lei 4).** O `ready_to_proceed` errado é (a) classificação
  forçada num conjunto fechado sem a categoria certa + (b) prompt gigante. Pesquisa (arXiv 2507.11538):
  Claude Sonnet decai linearmente com o nº de instruções; sob carga o modelo **OMITE regras inteiras**.
  Isso explica por que a regra FIX-36 ("não afirme achado antes do tool") existe **e mesmo assim** foi
  violada ("esse plano encaixa!" sobre plano fantasma) — a regra sumiu sob carga. **Cada guard/regra que
  adicionamos no prompt degrada a aderência a todas as outras.**
- **Confabulação de entidade / Tool-Calling Hallucination (Lei 3).** "Embracon" na tool de decisão sem
  grounding contra dado real em cena = *parameter fabrication* clássico. Mitigação documentada:
  entidade tem que resolver contra o que foi buscado/exibido (schema/lookup), nunca texto livre. FIX-179
  é isso em versão primitiva/reativa.
- **Blocklist incompleta (Lei 2).** `artifact-guard.ts` (6 regras) + `shown-groups.ts` = negar coisa ruim
  uma a uma, depois de cada bug. Incompleto por construção. A cura é **allowlist de transições válidas**.

## ⚠️ Direção da cura + decisões de produto (vai virar SPEC — Kairo pediu discutir antes de codar)

**Direção da cura (a decidir na spec, não cravada):** estender o controlador determinístico que já
roda os gates da frente pra governar a jornada inteira — LLM vira NLU (com "ver mais" como intent de
primeira classe) + copy dentro do estado; ações viram **allowlist de transições válidas por estado**
(FIX-179 deixa de ser caso especial e vira princípio); toda tool de decisão/apresentação recebe id que
resolve contra dado real. A tensão a resolver: estados **grossos o bastante** pra a conversa fluir,
**estritos o bastante** pra ação inválida ser impossível. Fundamento: `~/.claude/reference/arquitetura-agentes-ia.md`.

Duas perguntas de PRODUTO que a spec precisa fechar (não só código):

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

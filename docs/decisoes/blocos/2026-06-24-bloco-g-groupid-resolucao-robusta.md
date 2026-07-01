---
data: 2026-06-24
bloco: bloco-g-groupid-resolucao-robusta
escopo: FIX-72 — resolução ROBUSTA de groupId (fecha a raiz da fabricação de id)
autor: executor do bloco (decisão autônoma — operador autorizou no _prompt.md passo 2)
---

# ADR — Decisões de design do Bloco G (resolução robusta de groupId)

Contexto: o qa-noturno (2026-06-24), revalidando o FIX-71 ao vivo com CPF/celular
reais, mostrou que a **raiz persiste**. Jornada auto 180k → recomendação ITAÚ ✅;
o usuário pediu *"me mostra as outras opções dessa faixa pra eu comparar"* e o
agent respondeu *"esse grupo deu um problema agora"* — degradou gracioso, mas não
entregou. Log do servidor:

```
{"tool":"simulate_quota","error_message":"Oferta/grupo \"auto-180k\" não encontrado na descoberta atual."}
{"tool":"get_group_details","error_message":"Oferta/grupo \"auto-180k-kairo\" não encontrado na descoberta atual."}
```

A LLM **fabricou** `auto-180k` e `auto-180k-kairo` (este com o NOME do usuário no
id). É a MESMA raiz do FIX-68 (`auto-130k-60m`) e FIX-71 (`bb-auto-200k-72m`): a
LLM inventa groupId no padrão `categoria-valor[-prazo|-nome]` sempre que não tem o
`quotaId` real (hash opaco, Mongo ObjectId 24-hex) à mão.

**Por que o FIX-68/FIX-71 não fecharam:** dois buracos provados no código:

1. **Detector frágil (blocklist).** `looksLikeFabricatedGroupId` = `/-\d+k-\d+m$/i`
   só pega o sufixo `-NNNk-NNm`. **Não pega `auto-180k`** (sem `-NNm`) nem
   **`auto-180k-kairo`** (sufixo `-nome`). Cada formato novo de fabricação vaza —
   é a fragilidade intrínseca de blocklist por regex.
2. **Cobertura parcial.** O guard só existia em `simulate_quota`. O
   `get_group_details` ia direto ao adapter, que lançava `Error` cru → o AI SDK
   converte em tool-error ("instabilidade") sem guidance acionável.

Decisões tomadas com o raciocínio da skill `brainstorming` (contexto, 2 abordagens
do fix-72, trade-offs, YAGNI), mas o executor é o decisor — sem perguntas.

---

## Decisão 1 — Abordagem: (a) erro-estruturado-força-rebusca vs (b) resolução server-side da intenção

**O que decidir:** o fix-72 propõe duas saídas pra acabar com a fabricação:

**Opções:**
- (a) **erro-estruturado-força-rebusca** (reusa FIX-68): tool que recebe groupId
  fora do conjunto real devolve uma **diretiva acionável** (re-busca / use o id
  literal) em vez de erro cru. Devolve o controle pra LLM se auto-corrigir.
- (b) **resolução server-side da intenção**: o servidor extrai a intenção do id
  fabricado (ex. `auto-180k` → categoria auto, valor 180k) e **re-busca/resolve
  sozinho** o quotaId real, retornando a oferta sem pedir nada à LLM.

**Escolhida: (a) — erro-estruturado-força-rebusca.** Fecha a raiz com **menos
superfície** e sem regredir a degradação graciosa. Por quê (b) foi rejeitada:

- (b) **resolve errado.** `auto-180k-kairo` carrega o NOME do usuário, não mapeia
  a um grupo específico — só ao valor 180k; e re-buscar 180k devolve **N grupos**,
  não **O** grupo que o usuário escolheu. O servidor escolheria um por conta
  própria e mostraria dado que não corresponde à escolha — pior que pedir re-busca.
- (b) tem **mais superfície e risco**: parser de slug→intenção, política de
  desempate, acoplamento da tool ao formato do id de UMA administradora (fere o
  adapter pattern, valor-núcleo do projeto).
- (a) devolve o controle pra **LLM, que tem o contexto** de qual grupo o usuário
  quer — ela só precisa do id certo. A diretiva força re-obter o id literal (que
  já está no histórico do card) ou re-buscar. E a LLM **já degrada gracioso**
  (FIX-71 preservou isso); (a) só transforma o erro-cru-mudo em erro-acionável.

---

## Decisão 2 — Fonte da verdade da detecção: FORMATO (regex) vs CONJUNTO (offerIndex)

**O que decidir:** como reconhecer um id fabricado **sem repetir o erro do FIX-71**
(confiar num regex melhorado que vai vazar o próximo formato)?

**Opções:**
- (a) `allowlist-por-formato` — id real = `^[0-9a-f]{24}$` (Bevi quotaId); tudo que
  não casa é fabricado. Robusto contra formatos novos, mas **acopla a tool ao
  formato de id da Bevi** — troca de administradora (adapter pattern) quebraria o
  guard no nível da tool com falso-positivo.
- (b) `detecção-pelo-conjunto` — o **adapter** (dono do `offerIndex`) é quem sabe
  o que existe. Id fora do índice → erro **tipado** que a tool captura e converte
  em diretiva. Desacoplado do formato; cobre QUALQUER id desconhecido.

**Escolhida: (b) como rede de segurança + (a-restrita) como fast-path.**
Defense-in-depth, porque a lição EXPLÍCITA do FIX-72 é que tapar caminho-a-caminho
por regex não fecha a raiz:

- **Rede de segurança (correção de raiz):** o `BeviSelfContractAdapter` lança
  `GroupNotInDiscoveryError` (classe nova, ao lado de `IdentityNotCollectedError`)
  em `simulateQuota` **E** `getGroupDetails` quando o id não está no `offerIndex`.
  A tool (`executeSimulateQuota` / `executeGetGroupDetails`) **captura** e devolve
  a diretiva de re-busca — nunca propaga erro cru. Cobre id fabricado (qualquer
  formato), oferta expirada, hex aleatório inventado. Desacoplado do formato →
  respeita o adapter pattern (a regra de "id fora do conjunto" vale pra qualquer
  administradora).
- **Fast-path (otimização de latência <3s):** `looksLikeFabricatedGroupId`
  generalizado pra `(?:^|-)\d+k(?:-|$)` — pega o **marcador de valor-em-milhares**
  presente em TODOS os slugs observados (`auto-180k`, `auto-180k-kairo`,
  `bb-auto-200k-72m`, `auto-130k-60m`). Um quotaId real (24-hex) **nunca contém a
  letra `k`** → zero falso-positivo. Curto-circuita o id óbvio SEM round-trip à
  Bevi. Não é mais a única linha de defesa: a rede (b) pega o que o fast-path
  deixar passar (ex. slug sem valor-k).

Por que NÃO usei `^[0-9a-f]{24}$` no fast-path: seria allowlist-de-formato no nível
da tool — daria falso-positivo numa eventual troca de administradora ANTES de
consultar o adapter. O fast-path tem que ser conservador (alta confiança); a
autoridade do conjunto fica no adapter, onde a troca de administradora é absorvida.

---

## Decisão 3 — Cards expõem o quotaId real

**Investigação (provado no código):** todos os cards já carregam o id literal:
`beviOfferToGroupSummary`/`beviOfferToQuotaSimulation` setam `id`/`groupId =
offer.quotaId`; `groupCardSchema`/`comparisonTableSchema`/`recommendationSchema`/
`simulationResultSchema` declaram o campo `id`/`groupId` e a descrição (FIX-71)
manda copiar LITERAL o id de search/recommend, proibindo derivar slug.

**Escolhida: nada a mudar nos cards** — só reforço estrutural (assert na Camada 1
de que `simulationResultSchema.groupId` existe e os schemas de card expõem `id`) +
a regra única no prompt. Inventar um campo novo seria YAGNI.

---

## Decisão 4 — Prompt: regra ÚNICA e forte

**O que decidir:** o prompt tem regras pontuais (FIX-68 troca-de-faixa; FIX-71
escolha-de-grupo) mas nenhuma cobre `get_group_details` nem o id com `-nome`.

**Escolhida:** adicionar uma regra ÚNICA FIX-72 logo após a do FIX-71, que
generaliza: o groupId vem SEMPRE literal da descoberta e a regra vale pra
**simular E detalhar** (`get_group_details`); nunca componha `categoria-valor`
nem acrescente o nome do usuário (cita `auto-180k` e `auto-180k-kairo` como
contra-exemplos). Mantém as referências FIX-68/FIX-71 (cassettes acoplam a elas) —
não remove, consolida.

---

## Camadas de regressão (decisão de teste)

- **Camada 1 (structural):**
  - `src/lib/agent/tools/ai-sdk.fix-72.test.ts`: o fast-path
    `looksLikeFabricatedGroupId` pega `auto-180k` e `auto-180k-kairo` (e não
    regride os do FIX-68/71), não confunde o hash; `executeSimulateQuota` e
    `executeGetGroupDetails`, com adapter que lança `GroupNotInDiscoveryError`,
    **emitem a diretiva de re-busca** (não erro cru) — pros 2 caminhos (fast-path
    e conjunto); `simulationResultSchema.groupId` existe.
  - `src/lib/adapters/bevi/bevi-self-contract-adapter.fix-72.test.ts`: o adapter
    lança `GroupNotInDiscoveryError` pra id fora do `offerIndex` em `simulateQuota`
    e `getGroupDetails` (após uma descoberta real via client fake).
  - `src/lib/agent/system-prompt.fix-72.test.ts`: a regra única no prompt
    (FIX-72, `auto-180k`, `get_group_details`, id literal).
- **Camada 2 (cassette):** `tests/regression/agent-trajectory.test.ts` — `describe`
  novo "FIX-72" reproduzindo o stream do bug ("me mostra as outras opções" →
  `get_group_details("auto-180k-kairo")` + `simulate_quota("auto-180k")`): o
  detector pega ambos os ids fabricados E a trajetória correta usa o id LITERAL
  opaco do card; acoplamento ao prompt e ao detector.
- **Camada 3:** nightly (LLM-judge) cobre o drift; sem mudança aqui.

**Degradação graciosa preservada:** a diretiva é acionável (re-busca / id literal),
não erro cru → sem regredir pro loop de "instabilidade". O cassette da trajetória
correta trava isso.

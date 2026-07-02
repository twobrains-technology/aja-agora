# ADR — Bloco A: comportamento e ordem do agente no funil (revisão 2)

> Data: 2026-06-19 · Origem: `jornada2_revisão.docx` (teste manual do Bernardo em ajaagora.com.br)
> Itens: FIX-53 (dados antes do valor), FIX-52 (card de dados + anti-meta-narrativa), FIX-58 (simulador antes da indicação + confirmação de premissas).
> Executor solo no worktree `fix/funil-coleta-ordem`. Decisões tomadas sem o Kairo presente, com base em best-practice + padrões do repo.

---

## FIX-53 — Identidade (CPF/celular) ANTES do valor; não re-pedir o valor

### Contexto
- Hoje o gate `identify` (CPF+celular+LGPD, cifrado, D1) é o ÚLTIMO da qualificação:
  `name → experience → consent → credit(valor) → timeframe → lance → lance-value → lance-embutido → identify → search`.
- O stakeholder pediu na revisão 2: **"Precisa pedir os dados, antes do valor"** e **"Voltou a pedir o valor"**.
- O `credit` é o gate do *seletor de valor* ("Planeje sua conquista" / `present_value_picker`).

### Opções consideradas
1. **Mover o gate `identify` para antes do `credit`** (logo após `consent`). Reordena a máquina de gates (`qualify-state.ts`) — fonte única dos dois canais.
2. Só uma regra de prompt + guard que bloqueie `present_value_picker` (a *tool*) antes da identidade, sem mexer na ordem dos gates server-emitidos. Não satisfaz "dados antes do valor" no caminho canônico (o valor é um gate do servidor, não a tool).
3. Interpretar "valor" como o *lance-value* e mover identify só para antes de `lance-value`. Menor blast-radius, mas contraria o texto explícito do spec ("ANTES de present_value_picker").

### Escolhida: **opção 1 + reforço da opção 2** (defense-in-depth)
- `qualify-state.ts`: `identify` passa a ser avaliado logo após `consent`, **antes** de `credit`. Nova ordem:
  `name → experience → (doubts) → consent → identify → credit → timeframe → lance → lance-value → lance-embutido → search → confirm? → simulator-offer → decision`.
- Como `identify` deixou de ser o último gate, os **handlers de captura de identidade não disparam mais o reveal** — eles despacham o **próximo gate** (`credit`). O reveal continua sendo disparado por `pipeSearchSummaryTurn` (web) / `runSearchSummaryWithOrchestrator` (whatsapp) no fim da qualificação; o *tripwire* de identidade desses fluxos segue valendo (agora sempre passa, pois a identidade já foi coletada cedo).
  - Web: `src/app/api/chat/route.ts` (handler do gate `identify`) → despacha `nextGate` em vez de `pipeSearchSummaryTurn`.
  - WhatsApp: `src/lib/whatsapp/processor.ts` (pós-`captureIdentifyText`) → `fireGate(nextGate)` em vez de revelar (mesmo padrão do `handleHandoffDecline`).
- **Anti-repetição do valor** (defense-in-depth): regra dura nova no prompt (valor já coletado → confirma em 1 frase e segue; NUNCA re-pergunta nem re-mostra o picker) **+** regra nova no `artifact-guard` que suprime o artifact `value_picker` quando o valor (`creditMax`) já está coletado pré-reveal. O servidor reforça, não é só "boa vontade" do LLM.
- **Coerência da cópia**: o gancho do docx "Com essas informações, a Aja Agora vai analisar várias administradoras…" pressupõe dados JÁ coletados — fica incoerente cedo. Reescrevi a pergunta do gate `identify` para um gancho *forward-looking* ("Pra eu analisar várias administradoras e já buscar as opções mais aderentes ao seu perfil, preciso do seu CPF e celular… LGPD…"), preservando as âncoras do docx ("analisar várias administradoras", "aderentes ao seu perfil", "LGPD") — a fidelidade de cópia (jornada-docx-copy.test) continua verde.

### Trade-off registrado (transparência)
Pedir CPF/celular cedo (antes de qualquer valor) tem risco de fricção/abandono — foi por isso que o D1 original o pôs ao FIM do passo 2. **O stakeholder é dono do funil e pediu explicitamente a inversão**; implementei como pedido e deixo o trade-off documentado. Reavaliar conversão pós-deploy.

### Doc
`jornada-canonica.md` e `CONTEXT.md` (D1) atualizados: identidade sobe para o início do passo 2 (antes do valor), por pedido do stakeholder + exigência técnica da Bevi (CPF antes de simular).

---

## FIX-52 — Card de dados dispara com CPF+telefone juntos; zero "atualiza a página" / meta-narrativa

### Conflito spec × repo (reconciliado)
O `fix-52.md` chama o "card de dados" de `present_contract_form`. **Isso colide com o FIX-12 / `artifact-guard`(`premature-contract`) / `tool-policy`** do repo: `present_contract_form` é EXCLUSIVO do passo 5 (cria proposta REAL com consulta de bureau) e é **suprimido pré-reveal**. O card de coleta de CPF+celular pré-busca é o **gate `identify` server-emitido** (`gate-identity-form.tsx`), não uma tool do modelo.

**Decisão:** o "card de dados" do FIX-52 é o **gate `identify`** (server), NÃO `present_contract_form`. Seguir o spec literal reintroduziria o bug FIX-12 (proposta real + bureau sobre usuário não verificado) — regressão de segurança. As regressões deste fix afirmam o comportamento CORRETO: o agente narra curto e o servidor emite o card de identidade; o agente **NÃO** chama `present_contract_form` pré-reveal.

### Correções
- **Prompt (`system-prompt.ts`)**: regra dura nova no bloco de identidade proibindo *literalmente* "atualizar/atualize a página", "reabra", "me chama de volta", "continua de onde parou", "aparece automaticamente", "não consigo disparar", "não consigo processar por aqui", "o sistema coleta pelo formulário" (solução-manual + meta-narrativa). Essas frases **não existiam no prompt** — o modelo as alucinou; a regra + cassette travam a regressão.
- **Pede CPF e celular SEPARADOS** (um por vez) — preferência explícita do operador ("Melhor perguntar separado o CPF e o telefone").
- **Card re-dispara**: o gate `identify` re-emite quando o usuário fornece dados (intent `providing_info` → `decideShowGate` true). Quando o usuário manda CPF+celular em texto, o servidor segue dono do card — o agente nunca manda workaround manual.

---

## FIX-58 — Simulador de contemplação antes da indicação + confirmação de premissas

### Restrição técnica (evidência)
`buildSimulatorDialDirective` exige *"o grupo do plano recomendado (administradora X) — os MESMOS dados reais que o usuário já viu"*. O `present_contemplation_dial` **depende da oferta recomendada** (calcula lance/crédito líquido/parcela sobre ela). Logo o dial **não pode preceder a descoberta das ofertas** — "antes da indicação" não pode significar "antes de existir oferta".

### Opções
1. **Split do reveal**: descoberta → opções (comparison) → simulador no top → DEPOIS `present_recommendation_card`. Satisfaz "dial fisicamente antes do recommendation_card", mas brigaria com D13/D15 (reveal com recomendado em destaque, decisão testada do Kairo: "disse 3 mas mostrou 1"), tocaria o núcleo do `buildSearchSummaryDirective` + componente do simulador (**território do Bloco B**) e quebraria ~5 suítes do reveal.
2. **Confirmação de premissas + simulador como checkpoint de segurança ANTES do compromisso** (card de decisão), sem split do reveal. Aditivo, baixo risco, dentro do escopo (gate/prompt/doc), sem tocar o componente do simulador.

### Escolhida: **opção 2**
- **Confirmação de premissas** (Bernardo, quote 2: *"perguntar antes de avançar: faz sentido esse valor? essa quantidade de meses? quer simular algo diferente?"*) embutida no passo `simulator-offer` (que já fica entre o reveal e o `decision`): a cópia do gate + o directive passam a confirmar valor/meses e abrir "quer simular/ajustar algo diferente" ANTES do card de decisão (o compromisso).
- O simulador de contemplação fica posicionado como **ferramenta de segurança pré-compromisso** (antes do `decision`), reforçado no prompt.
- **"Dial fisicamente antes do `present_recommendation_card`"**: deixado como **follow-up coordenado com o Bloco B** (que é dono do componente do simulador e da apresentação da recomendação), com a restrição técnica documentada. Razão: a opção 1 exige redesenho do reveal/simulador (fora do escopo deste bloco — `fix-58.md`: "NÃO redesenhar o simulador… só muda QUANDO o agente dispara e a doc") e brigaria com decisões testadas (D15). Honesto sobre o limite, conforme regra anti-solução-disfarçada.

### Doc
`jornada-canonica.md`, `proposta-simulador.md` e `CONTEXT.md` atualizados: passo 4 reordenado (confirmação de premissas + simulador como segurança antes do card de decisão), com a restrição de dependência de dados do dial registrada.

---

## Resumo das decisões
1. **FIX-53**: movi o gate `identify` para antes do `credit` (reorder real na máquina de gates) em vez de só uma regra de prompt — porque o spec pede ordem dos gates e é a fonte única dos dois canais. Handlers de identidade despacham o próximo gate em vez do reveal.
2. **FIX-52**: tratei o "card de dados" como o gate `identify` server-emitido em vez de `present_contract_form` — porque seguir o spec literal reintroduziria o bug de segurança FIX-12 (proposta real pré-reveal).
3. **FIX-58**: implementei confirmação de premissas + simulador como checkpoint pré-compromisso em vez do split do reveal (dial fisicamente antes do recommendation_card) — porque o dial depende da oferta recomendada (restrição técnica) e o split é território do Bloco B + briga com D15. Follow-up documentado.

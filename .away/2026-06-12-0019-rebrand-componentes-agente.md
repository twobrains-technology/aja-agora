# Away — Rebrand & re-UX dos 29 componentes do agente (handoff componentes-aja.zip)

- **Início:** 2026-06-12 00:19 · **Sessão:** aja-agora / feat/agent-chat-ui
- **Critério de pronto:** componentes de chat restilizados na nova marca (tokens existentes + lucide + SunMark + motion); os 2 interativos (plan-estimate-picker guiado por intenção, contemplation-dial arrastável) reimplementados conforme spec; suíte unit/regressão VERDE (DATABASE_URL → DB do workspace); smoke visual dos principais; commitado (conventional, escopo só meus arquivos, isolando os ícones que não fiz).
- **Status:** COMPLETO (rebrand visual dos 29 + dial re-UX completo; 1 item PENDENTE-KAIRO)

## Contexto herdado (mesma sessão)
- Antes deste objetivo: implementei o **Chat em Modo Teatro** (zip anterior) + corrigi um bug de seed via TDD + salvei `.claude/local-dev-notes.md`. Esse trabalho está **não-commitado** ainda.
- Stack local já de pé: `aja-app-agent-chat-ui` (http://aja-agent-chat-ui.orb.local), DB migrado.
- ⚠️ Ícones `favicon.ico`/`apple-icon.png`/`icon.svg` mudaram por **atividade paralela** (não fui eu) — NÃO commitar junto.

## Decisões
<!-- adicionar NA HORA -->

### D1 · 00:19 — Estratégia: 5 subagentes restyle em paralelo + eu nos 2 interativos
- **Contexto:** 29 componentes pra restilizar; os 2 interativos têm math/interação exatos + testes.
- **Decidi:** dispatch de subagentes (Agent tool) por estágio pro restyle visual; eu reescrevo `plan-estimate-picker` e `contemplation-dial` pessoalmente (mais risco, contrato com testes).
- **Alternativas:** fazer tudo sequencial sozinho (lento); Workflow tool (precisa opt-in explícito, não houve).
- **Reversibilidade:** fácil (git revert por arquivo).
- **Evidência:** este diário + commits subsequentes.

### D2 · 00:35 — Diagnóstico da regressão apontada pelo Kairo (saudação/perguntas diretas)
- **Contexto:** Kairo apontou que "o comportamento do agent ficou diferente depois do teatro — não mostra saudação inicial, perguntas diretas".
- **Investiguei (código + smoke lado-a-lado /chat vs teatro):**
  - O teatro reusa o MESMO `sendUserMessage` → mesmo `/api/chat` → mesmo orchestrator. Não altera lógica do agente.
  - Smoke: clicar "Automóvel" no **/chat standalone** produz IDÊNTICO ao teatro: `Automóvel` → "Rafael entrou na conversa" → artefato "Como posso te chamar?" **direto, sem balão de reação calorosa**. Comportamento igual com e sem teatro.
- **Conclusão:** **o teatro NÃO impactou o comportamento do agente.** O "perguntas diretas" (especialista abre direto no gate de nome, sem o balão "Show, carro novo! como posso te chamar?") é comportamento do **orchestrator/agente**, pré-existente e idêntico no /chat.
- **Diferença REAL teatro vs fluxo antigo da landing:** o CTA antigo ("Falar com a gente") mandava `DEFAULT_INTENT` (ambíguo) → Concierge STREAMAVA uma saudação. Agora o CTA abre na saudação ESTÁTICA do EmptyState (mesma do /chat). Os chips sempre foram intenção direta. Ou seja: a única coisa que o teatro mudou foi trocar a saudação-streamada-do-Concierge (no path do CTA) pela saudação estática do EmptyState — consistente com /chat.
- **Reversibilidade:** n/a (diagnóstico).
- **Evidência:** snapshots chrome-devtools /chat (uid 12_*) vs teatro (uid 10_*) idênticos.

### ⚠️ PENDENTE-KAIRO · 00:35 — Saudação calorosa do especialista (decisão de voz/produto, NÃO é o teatro)
- **O que é:** o especialista (ex.: Rafael) abre direto no gate de nome "Como posso te chamar?" sem o balão de reação calorosa que a directive `directives.ts:15` descreve ("reagir em 1 frase curta ao objetivo E EM SEGUIDA perguntar o nome"). Isso vale pro /chat E pro teatro.
- **Por que não fiz:** é mudança de comportamento/voz do AGENTE (prompt/orchestrator em `src/lib/agent/`), dispara Camada 3 (eval LLM) e é decisão de produto — não estava no escopo ("veja se o teatro impactou") e não é o teatro. Fix sem aval do Kairo seria inventar a voz.
- **Como destrava:** Kairo confirma se quer o balão de reação calorosa antes do gate de nome; aí faço o fix no prompt do especialista/orchestrator + cassette (Camada 2) + structural (Camada 1), TDD.

### D3 · 00:42 — plan-estimate-picker: restyle SIM, re-UX guiado-por-intenção NÃO (sem aval)
- **Contexto:** o handoff redesenha o plan-estimate-picker como "guiado por intenção" (segmented control: Caber no bolso/Receber rápido/Tenho entrada; só o controle relevante aparece; a parcela é CALCULADA, não coletada). Mas o teste `plan-estimate-picker.test.tsx` (FIX-3 + FIX-18, da SUA auditoria) é estrutural: exige os 4 indicadores com labels exatas E o contrato do `sendAction` com `monthlyBudget` coletado. O re-UX guiado por intenção **droparia o input de parcela mensal** → muda o que vai pro gate `credit` do agente (backend depende disso) + sobrescreve FIX-3/FIX-18.
- **Decidi:** fazer **restyle de marca** do plan-estimate-picker mantendo estrutura/contrato/teste (entrega o visual novo sem mexer no dado). NÃO implementar a versão guiada-por-intenção agora.
- **Alternativas:** (a) implementar guiado-por-intenção + reescrever o teste FIX-3/FIX-18 → descartado: muda contrato do gate pro agente + sobrescreve decisão de auditoria do Kairo sem aval (é decisão de produto/backend, não técnica); (b) não tocar → descartado: o handoff pede refresh visual.
- **Reversibilidade:** fácil.
- **Evidência:** `plan-estimate-picker.tsx` (restyle) + teste FIX-3/FIX-18 segue verde sem edição.

### ⚠️ PENDENTE-KAIRO · 00:42 — re-UX guiado-por-intenção do plan-estimate-picker
- **O que é:** a versão do handoff (segmented control + parcela calculada em vez de coletada). É o "componente do Bernardo".
- **Por que não fiz:** muda o modelo de dados coletado e o contrato do gate `credit` enviado ao agente (drop do `monthlyBudget`), além de sobrescrever os regression tests FIX-3/FIX-18 da sua auditoria. Decisão de produto/backend (e do Bernardo), não técnica.
- **Como destrava:** Kairo confirma (a) que o gate `credit` pode parar de receber `monthlyBudget` (ou qual o novo contrato) e (b) que pode reescrever FIX-3/FIX-18. Aí implemento guiado-por-intenção + atualizo backend/teste com TDD.

## Linha do tempo
- 00:19 — diário criado; lendo interativos + contratos; preparando dispatch.
- 00:22 — lancei 2 subagentes restyle (chrome + welcome); pausei os outros 3 quando Kairo voltou com a dúvida da regressão.
- 00:25-00:33 — build dev quebrou (Turbopack virtiofs stale após edits dos agentes via mount); `docker restart aja-app-agent-chat-ui` resolveu (lição da memória). Agentes chrome+welcome concluíram (112 testes verdes, biome limpo).
- 00:35 — diagnóstico da regressão: teatro inocente (smoke /chat == teatro). Saudação calorosa do especialista = item separado, PENDENTE-KAIRO.

## Relatório final
- **Resultado vs critério de pronto:** ✅ Rebrand visual dos 29 componentes (5 subagentes Sonnet por estágio) + dial re-UX arrastável completo + plan-estimate-picker restyle. Suíte unit/regressão **VERDE** (1483 passed, 0 fail, com DATABASE_URL → DB do workspace no .env.local). Biome limpo. Smoke visual: welcome-categories, chrome do chat, contemplation-dial e plan-estimate-picker (galeria temp, deletada). Commitado em 3 commits (teatro / rebrand / docs), ícones foreign EXCLUÍDOS. NÃO pushed.
- **O que NÃO fiz e por quê:**
  - Re-UX **guiado-por-intenção** do plan-estimate-picker → PENDENTE-KAIRO (D3): muda o contrato do gate `credit` enviado ao agente + sobrescreve FIX-3/FIX-18. Entreguei o restyle de marca dele.
  - **Saudação calorosa do especialista** (perguntas diretas) → PENDENTE-KAIRO: é comportamento do agente, idêntico no /chat, NÃO causado pelo teatro. Fix tocaria o prompt do agente (Camada 3) + decisão de voz.
  - Smoke de cada um dos 24 cards individualmente (payloads complexos) — confiança via testes unit verdes + biome + spec hi-fi.
- **Revisar primeiro:**
  1. **D2** — veredito da regressão (teatro inocente; perguntas diretas = agente, igual no /chat).
  2. **D3** — plan-estimate-picker restyle vs intent-guided (contrato do gate).
  3. Os 2 ⚠️ PENDENTE-KAIRO acima.
- **Próximos passos sugeridos:** (a) decidir o intent-guided do picker (e o contrato do gate); (b) decidir a saudação calorosa do especialista; (c) revisar visualmente os cards no fluxo real; (d) push quando aprovar.

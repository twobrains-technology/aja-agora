# LEDGER — QA Autônomo · Frente 1 (Descoberta + Qualificação + Identidade)

- **Rodada:** 2026-07-01 02:36
- **Frente:** 1 de 3 — Passos 1-4 da jornada (web↔WhatsApp). Faixa FIX: **FIX-130 a FIX-149**.
- **Branch de trabalho:** `qa/descoberta-qualificacao` (worktree Superset)
- **Ancoragem:** onda `divergencias-jornada` integrada na develop (`4c8a81c5`)
- **Fonte da verdade:** `docs/jornada/jornada-canonica.md` (Mapa de divergências + cenários 🟢/⚪/🔴/⚠️)
- **Stack:** `aja-app-descoberta-qualificacao` UP · `http://aja-descoberta-qualificacao.orb.local` (fallback `localhost:3010`) · bind mount confirmado · migrations aplicadas
- **Baseline:** `pnpm test:unit` (Camadas 1+2) = **216 files / 2194 tests VERDE** (13.9s)
- **Objetivo:** validar adversarialmente os fixes da onda na minha área (FIX-121/120/118/114 + paridade), achar buracos, corrigir na minha faixa, deixar verde.
- **Critério de PRONTO:** todos os cenários 🟢/regressão ∈ {✅} + nenhum bloco pendente + reverificação fresca. Teto: 12 iterações / 8h.

## Regras de fase (da jornada)
- 🟢 vivo = testa (falha se quebrar). ⚪ futuro = pendente, não falha. ⚠️ tensão (T1 sweep/trilhos, T2 embutido) = **NÃO testo como bug** (decisão stakeholder).

## Cenários

| # | Cenário (fluxo) | Origem | Nível certo | Status | Bug card | Fix | Último resultado |
|---|-----------------|--------|-------------|--------|----------|-----|------------------|
| 1 | **Welcome web: 3 categorias** (Imóvel/Carro/Moto), sem "Outros"/servicos | FIX-121 / D21 / Passo 1 | structural + render | ✅ fechado | fix-130 | **FIX-130** | 🔴 bug achado (EmptyState 4 cat) → corrigido → render+structural verde |
| 2 | **Paridade welcome** web == WhatsApp == landing (3 cat) | D21 / regra-mãe | structural | ✅ fechado | — | FIX-130 | paridade WhatsApp travada em welcome-options.test.ts; landing/WhatsApp/web = 3 cat (grep) |
| 3 | Pergunta nome ("Como posso te chamar?") + ecoa objetivo | Passo 1 🟢 | cassette/eval | ✅ fechado | — | — | coberto: name-prompt.test.ts (FIX-17) + funil; baseline verde |
| 4 | **WhatsApp valor por conversa** ("uns 80 mil"/"50k"), SEM lista de faixas | FIX-120 / D5 / Passo 2 | structural + cassette | ✅ fechado | — | — | código `credit→null`+`gateTextPrompt` confirmado; cassette FIX-120 verde (5 asserts fortes) |
| 5 | **parseAssetValue robusto** (property) | FIX-120 backstop | property | ✅ fechado | — | — | probe adversarial 15/15 (inclui "R$ 1,5 milhão", "R$1.000.000", "2mi", nulls corretos) |
| 6 | Prazo NÃO perguntado na entrada (gate timeframe removido) | FIX-103 / Passo 2 🟢 | structural | ✅ fechado | — | — | qualify-state comenta timeframe fora da entrada; cassette FIX-103 verde |
| 7 | Lance "Pretende dar um lance?" Sim/Não/Talvez | Passo 2 🟢 | structural | ✅ fechado | — | — | funil coberto (qualify-state); baseline verde |
| 8 | **Educação lance embutido pra Sim/Não/Talvez nos DOIS canais** | FIX-118 / D19 / Passo 2 | structural + cassette | ✅ fechado | — | — | WhatsApp `fireGate("lance-embutido")` no ramo no/maybe confirmado; web route.ts:917; cassette FIX-118 verde |
| 9 | Componente de valor = agulha simples (não multi-slider) no gate credit web | FIX-115 / P4 / D6 | structural | ✅ fechado | — | — | gate-renderer credit→ValuePicker; PlanEstimatePicker só compat msgs antigas |
| 10 | Coleta CPF + telefone antes de search_groups | Passo 3 🟢 | structural | ✅ fechado | — | — | gate identify precede credit; FIX-114 |
| 11 | **search_groups/discovery NUNCA exposto sem identidade** (tool-policy gate) | FIX-114 / D7 / P6 | structural + cassette | ✅ fechado | — | — | `allowedTools(QUALIFY_NO_ID)` não contém search_groups; tool-policy:139; cassette FIX-114 verde |
| 12 | Sem "dificuldade técnica" — agente não fura o gate de identidade | P6 | cassette | ✅ fechado | — | — | detectores no cassette FIX-114 + prompt veta "vou buscar"/"dificuldade em acessar os grupos" |
| 13 | Retorna ≥1 carta REAL (Bevi Trilho B, nunca mock) | Passo 4 🟢 / P7 | integration (Bevi real) | ✅ fechado | — | — | **AO VIVO**: auto 80k→24 grupos reais (ÂNCORA R$954/mês), imovel 250k→22 (BB R$1414/mês); gate identity enforçado no adapter; default endpoint homolog OK; PII limpa |
| 14 | **Footer landing: 3 categorias de entrada** (tira "Serviços") | D21 / paridade | render + browser | ✅ fechado | — | **FIX-131** | 🔴 bug achado no browser (footer 4 chips de entrada) → Kairo confirmou remover → render test verde + confirmado no browser |
| 15 | **Welcome do chat no BROWSER REAL** = 3 categorias, sem "Outros" | FIX-130 / golden path | E2E visual | ✅ fechado | — | FIX-130 | browser real: "Me conta: o que quer conquistar?" + Imóvel/Automóvel/Moto (sem Outros); screenshot em tests/e2e/artifacts/welcome-chat-3-categorias-fix130.png |

## Tensões (NÃO testar como bug)
- **T1** — sweep 2 objetivos + Trilho A primário + tradução A↔B (D1/D2/D3). PENDENTE-Kairo/recalibrar.
- **T2** — lance embutido amortiza dívida × reduz crédito (D9/P5). PENDENTE-Bernardo. (Passo 5, fora da frente.)

## Diário de decisões
(ver `.away/2026-07-01-0236-qa-frente1-descoberta.md`)

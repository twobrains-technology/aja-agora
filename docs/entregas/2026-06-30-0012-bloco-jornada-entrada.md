---
data: 2026-06-30
bloco: bloco-jornada-entrada
branch: feat/jornada-entrada-conversacional
onda: jornada-entrada (revisão da entrada conversacional)
itens: [FIX-103, FIX-104, FIX-105, FIX-106]
spec: docs/specs/2026-06-28-jornada-entrada-simulador-conversacional-design.md
decisoes: docs/correcoes/decisions/2026-06-28-bloco-jornada-entrada.md
---

# Entrega — bloco-jornada-entrada (comportamento do agente na entrada + simulador)

Coração da revisão da jornada de ENTRADA do Aja Agora (decisões do Kairo
2026-06-28). Concentra o comportamento do agente: o que ele pergunta na
qualificação, como coleta o valor, e como conduz o simulador de contemplação.

## Resumo (o que mudou)

| # | Item | Mudança |
|---|---|---|
| FIX-103 | Remover gate de prazo | O gate `timeframe` saiu da qualificação — `nextGate` nunca mais o emite; o funil pula de `credit` (valor) direto pra `lance`. Sem prazo do usuário, a recomendação usa `desiredTermMonths=0` → fator `termMatch` neutro. |
| FIX-104 | Valor por conversa | O agente coleta o valor do bem por CONVERSA (texto livre, "uns 80 mil"/"80k") e NÃO emite `present_value_picker` na entrada. Helper canônico `parseValorDoBem`. |
| FIX-105 | Qualificação híbrida | Explícito no prompt + contrato `QUALIFY_GATE_INPUT_KIND`: binárias (experiência, lance) = botão; valor = conversa. |
| FIX-106 | Simulador conversacional | Nova tool de cálculo `simulate_contemplation` (reusa `computeContemplationDial`) conduz o simulador em LOOP por conversa (WhatsApp + what-if de mês em qualquer canal); a WEB mantém a agulha arrastável. |

## Contrato fixado (os blocos irmãos dependem)

Documentado no topo de `qualify-config.ts` e `system-prompt.ts`:

1. O agente PARA de emitir `present_value_picker` na entrada (valor vira conversa).
2. O gate `timeframe` (prazo) SAI da qualificação.
3. O simulador de contemplação é conduzido em LOOP conversacional pelo agente
   (tool `simulate_contemplation`); a WEB mantém a agulha.

Contratos exportados pra consumo nível-3 dos irmãos:
- `parseValorDoBem(text)` — normalização determinística do valor em texto livre
  (input de texto-livre do slider simples da web — `bloco-web-valor-agulha`).
- `QUALIFY_GATE_INPUT_KIND` — classificação button × conversation por gate
  (web/whatsapp decidem o tipo de input).
- `simulate_contemplation` tool — cálculo do cenário pra um mês-alvo
  (`bloco-whatsapp-apresentacao` apresenta o loop).

## Decisões de design (AskUserQuestion dispensada no notch → segui as recomendadas)

1. **Score sem prazo (FIX-103):** fator `termMatch` NEUTRO (caminho "sem
   preferência" já existente) em vez de redistribuir pesos. Zero mudança em
   `recommendation.ts`; mantém a calibração dos thresholds de copy.
2. **Detalhe por iteração (FIX-106):** PACOTE COMPLETO (lance R$+%, embutido ×
   dinheiro, crédito líquido, parcela até contemplar e depois) — coerência
   web↔conversa; o simulador "de fato simula".
3. **Condução do loop (FIX-106):** oferta do docx + reconvite leve (1×) e depois
   recalcula sob demanda; itera quantas vezes o usuário quiser, sem empurrar.

Racional completo: `docs/correcoes/decisions/2026-06-28-bloco-jornada-entrada.md`.

## Testes (3 camadas, regra do projeto)

- **Camada 1 (structural):** `qualify-state.fix-103`, `system-prompt.fix-104`,
  `qualify-config.fix-104`, `qualify-config.fix-105`, `system-prompt.fix-105`,
  `tools/ai-sdk.fix-106`, `system-prompt.fix-106`, `tool-policy.test` (matriz
  fase×tool com `simulate_contemplation`). Testes antigos que afirmavam o
  comportamento anterior (timeframe na sequência, valor por picker) atualizados.
- **Camada 2 (cassettes — `tests/regression/agent-trajectory.test.ts`):** FIX-103
  (funil sem prazo, web+WhatsApp), FIX-104 (valor por conversa, reescreve o antigo
  BUG-CREDIT-PICKER), FIX-105 (binária por botão × valor por conversa), FIX-106
  (`e em 6 meses?` → `simulate_contemplation`; itera; reusa o motor da agulha).
- **Camada 3 (eval — nightly):** sequências de gate sem prazo; eval do valor
  conversacional (agente não emite picker); what-if de mês conduz
  `simulate_contemplation`.

**Gate `pnpm test:unit` verde: 196 arquivos, 2024 testes** (rodado em container
transitório com PG do workspace migrado via `db:migrate`, store pnpm
compartilhado — o host não roda o hook por não ter `node_modules`, pnpm-only).

Jornada canônica (`docs/jornada/jornada-canonica.md`) atualizada nos passos 1-2 e 4.

## Gaps honestos

- **Camada 3 (eval LLM real) não executada aqui:** exige `ANTHROPIC_API_KEY`
  (não disponível no bloco autônomo). As asserções foram escritas e os arquivos
  parseiam (esbuild esm), mas a validação com modelo real é nightly/integração.
- **Persona row no DB (migration 0021):** os `examples` da persona ainda
  mencionam o fluxo com o gate de prazo (timeframe). A migration é histórico
  imutável; o comportamento primário vem do `system-prompt.ts` (já atualizado).
  Limpar os examples exige migration de dados (fora do escopo deste bloco —
  não toca DB/schema). Anotado pra quem fizer o ajuste de persona.
- **Diretivas do orchestrator (`buildSearchSummaryDirective`):** ainda contêm
  texto cosmético "prazo=? meses" / "4 perguntas" (degrada gracioso — `?`/0).
  Fora dos 6 arquivos do escopo; sem impacto funcional (desiredTermMonths=0 →
  neutro). Limpeza cosmética fica pra um passe do orchestrator.
- **`tool-policy.ts` (orchestrator) foi tocado** fora dos 6 arquivos listados:
  consequência necessária do FIX-106 (a policy é fail-closed; o próprio arquivo
  manda registrar toda tool nova). Cirúrgico (1 linha em `WHAT_IF_AND_DETAIL`).

## Fora de escopo (próximos blocos)

- `bloco-web-valor-agulha`: trocar o `present_value_picker` complexo por slider
  simples 1k (consumir `parseValorDoBem`/`QUALIFY_GATE_INPUT_KIND`).
- `bloco-whatsapp-apresentacao`: card recomendada + "ver outras" + apresentação
  do loop do simulador no WhatsApp (consumir `simulate_contemplation`).

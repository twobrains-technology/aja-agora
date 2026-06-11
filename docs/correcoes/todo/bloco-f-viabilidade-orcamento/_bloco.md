---
bloco: bloco-f-viabilidade-orcamento
branch: feat/confronto-viabilidade-orcamento
workspace: feat-confronto-viabilidade-orcamento
onda: 1
depends_on: []
paralelo_com: [bloco-d-eval-harness, bloco-e-gate-nome-card, bloco-j-telemetria-runner-residuo, bloco-k-fechamento-whatsapp]
itens: [FIX-18]
escopo_arquivos:
  - src/lib/agent/orchestrator/directives.ts
  - src/lib/agent/system-prompt.ts
  - src/components/chat/artifacts/recommendation-card.tsx
  - src/lib/consorcio/plan-estimate.ts
  - src/components/chat/artifacts/plan-estimate-picker.tsx
conflitos_esperados:
  - "system-prompt.ts / directives.ts: nível 2 (seções distintas) com qualquer bloco que toque prompt — merge mecânico"
---

# Bloco F — Confronto de viabilidade de orçamento (C6 da auditoria do dial)

Item único: FIX-18. Surgiu da auditoria 2026-06-11 (jornada BB real): perfil
impossível (250k + 1k/mês) atravessou o funil sem confronto e foi recomendado
como "Compatível com seu perfil" com parcela 9,8× o orçamento.

**⚠️ GATE DE ENTRADA: conversar com o Kairo antes de implementar.** Decisões
abertas: onde confrontar (picker, reveal ou ambos) e o tom da narrativa
(docx: agente guia, não empurra). Não lançar no Superset sem essa conversa
registrada no item.

## Prompt de lançamento (colar na sessão do Superset — SÓ após conversa)

> Leia docs/correcoes/README.md e execute o bloco
> docs/correcoes/todo/bloco-f-viabilidade-orcamento/ (item FIX-18). Antes de
> codar, confirme que `decisao_pendente` foi resolvida (conversa registrada na
> seção "Decisão" do item — se não estiver, PARE e avise). TDD strict,
> regressão nas 3 camadas (incl. cassette de confronto vs celebração), 1
> commit `test+feat:`, mover pra done/ ao concluir.

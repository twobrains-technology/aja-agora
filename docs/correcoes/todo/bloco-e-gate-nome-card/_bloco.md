---
bloco: bloco-e-gate-nome-card
onda: 1
depends_on: []
paralelo_com: [bloco-d-eval-harness]
itens: [FIX-17]
escopo_arquivos:
  - src/lib/chat/ui-message.ts
  - src/components/chat/artifacts/name-prompt.tsx
  - src/components/chat/artifacts/name-prompt.test.tsx
  - src/lib/web/adapter.ts
  - src/lib/agent/orchestrator/detect-name-turn.ts
  - src/lib/agent/system-prompt.ts
  - src/lib/whatsapp/formatter.ts
  - tests/regression/agent-trajectory.test.ts
conflitos_esperados:
  - "tests/regression/agent-trajectory.test.ts: nível 2 (append-only) com qualquer bloco que adicione cassette — merge mecânico"
  - "system-prompt.ts: nível 2 — seções distintas"
---

# Bloco E — Gate do nome em card (UX de coleta)

Item único: FIX-17. Bloco próprio porque é mudança de UX do funil (componente
novo + orchestrator), disjunto do bloco-d (eval harness).

**⚠️ GATE DE ENTRADA: conversar com o Kairo antes de implementar.** Ele pediu
explicitamente "anota aí para depois conversarmos" (2026-06-11) — há 3 decisões
de desenho abertas no item (autofocus vs foco do chat, coexistência texto-livre,
padronizar autofocus nos demais forms). Não lançar este bloco no Superset sem
essa conversa registrada aqui.

## Prompt de lançamento (colar na sessão do Superset — SÓ após conversa)

> Leia docs/correcoes/README.md e execute o bloco
> docs/correcoes/todo/bloco-e-gate-nome-card/ (item FIX-17). Antes de codar,
> confirme no frontmatter do item que `decisao_pendente` foi resolvida (a
> conversa com o Kairo deve estar registrada na seção "Decisão" do item — se não
> estiver, PARE e avise). Siga TDD strict (teste falha primeiro), regressão nas
> 3 camadas do CLAUDE.md do projeto, 1 commit `test+feat:` e mova o item pra
> done/ com commit e executado_em.

---
bloco: bloco-sonnet5
branch: chore/upgrade-agente-sonnet5
workspace: chore-upgrade-agente-sonnet5
onda: 1
status: PRONTO PARA LANÇAR
tipo: hotfix
elevacao: develop + prod (--allow-prod — junto do hotfix funil, pedido do Kairo 2026-07-02)
depends_on: []
paralelo_com: [bloco-funil-nao-trava]
itens: [FIX-209]
escopo_arquivos:
  - src/lib/agent/agents/builder.ts
  - src/lib/agent/mesa-copilot/index.ts
  - src/lib/agent/personas.ts
  - src/lib/agent/agents/builder.*.test.ts
conflitos_esperados:
  - "Disjunto do bloco-funil-nao-trava (nível 1): arquivos diferentes. NÃO toca tests/regression/agent-trajectory.test.ts (só roda a suíte pra provar verde). Paralelo limpo — merge em qualquer ordem."
project: tb-aja-agora
---

# Bloco — Upgrade do agente para Claude Sonnet 5

Item único (FIX-209): trocar o modelo do agente de runtime `claude-sonnet-4-6` →
`claude-sonnet-5` (update recente da Anthropic, modelo melhor — pedido do Kairo).

**NÃO é troca de string** — Sonnet 5 tem breaking changes reais: `temperature` não-default
dá **400** (some o mecanismo de temperatura por persona → tom vira prompt), adaptive thinking
liga por default (Kairo escolheu **OFF explícito** pra preservar o <3s do chat), tokenizer
novo (~30% tokens), e o alias `claude-sonnet-5` precisa estar registrado no **gateway
LiteLLM** (verificar antes de deploy — ausente = PENDENTE-KAIRO).

Detalhe completo (breaking changes, correção o-quê×onde, regressão) no card `fix-209`. O
refinamento de execução está no `_prompt.md`.

Roda em **paralelo** com o bloco-funil-nao-trava (disjunto). Ambos integram na base
`integ/funil-nao-trava` e sobem juntos como parte do hotfix.

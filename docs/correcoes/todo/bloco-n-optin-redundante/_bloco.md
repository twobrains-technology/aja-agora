---
bloco: bloco-n-optin-redundante
onda: 1
depends_on: []
paralelo_com: [bloco-o-outras-opcoes-dedupe, bloco-p-acoes-e-lance-do-card, bloco-q-handoff-msg-duplicada, bloco-r-scroll-inteligente]
itens: [FIX-27]
escopo_arquivos:
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/personas.ts
  - src/lib/agent/agents/index.ts
  - src/app/api/leads/route.ts
  - src/app/api/chat/route.ts
  - src/components/chat/artifacts/whatsapp-optin.tsx
  - src/lib/chat/types.ts
conflitos_esperados:
  - "src/app/api/chat/route.ts: nível 2 com bloco-p (regiões distintas — aqui o handler contract-submit ~452; lá o handler interest ~401). Merge mecânico; ordem recomendada: bloco-p primeiro, bloco-n resolve."
  - "src/lib/chat/types.ts: nível 2 com bloco-p (payloads distintos, append). Merge mecânico."
---

# Bloco N — Opt-in de WhatsApp redundante (pede número já informado)

Item único: FIX-27. Encontrado nos testes manuais do Kairo no dev (2026-06-11,
pós-deploy da auditoria do dial): o sistema pediu o WhatsApp pela 3ª vez
(lead form e identify já tinham coletado), com input vazio, no meio de um
fechamento com erro Bevi pendente. Root cause: `deriveWhatsappOptinStage` não
enxerga telefone capturado fora do opt-in formal.

## Prompt de lançamento (colar na sessão do Superset)

> Leia docs/correcoes/README.md e execute o bloco
> docs/correcoes/todo/bloco-n-optin-redundante/ (item FIX-27). TDD strict:
> Camada 1 (derive + componente + flag no meta) e Camada 2 (cassette do turno
> pós-erro-Bevi sem re-coleta de telefone) escritas ANTES do fix, vistas
> falhar. Decisão de desenho já recomendada no item (stage "confirm" com
> 1-clique) — siga-a, salvo impedimento técnico real. 1 commit `test+fix:`,
> mover o item pra done/ ao concluir e apagar a pasta do bloco.

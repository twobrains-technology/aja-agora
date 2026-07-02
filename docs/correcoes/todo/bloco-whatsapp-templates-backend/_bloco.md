---
bloco: bloco-whatsapp-templates-backend
branch: feat/whatsapp-templates-backend
workspace: feat-whatsapp-templates-backend
onda: 2
depends_on: [bloco-whatsapp-templates-schema]
paralelo_com: [bloco-whatsapp-templates-admin]
itens: [FIX-201, FIX-202, FIX-203]
escopo_arquivos:
  - src/lib/whatsapp/template-dispatch.ts    # NOVO
  - src/lib/whatsapp/template-sync.ts         # NOVO
  - src/app/api/webhook/whatsapp/route.ts     # + tratar field message_template_status_update
  - src/lib/whatsapp/interactive-handlers.ts  # rotear closingPresentation/summary via resolveAndSend
  - src/lib/bevi/contract-summary.ts          # rotear via resolveAndSend
conflitos_esperados:
  - "Nível 1 com bloco-admin: arquivos DISJUNTOS. O único acoplamento é nível 3 (contrato): bloco-admin importa `reconcileTemplateStatuses` de `template-sync.ts` (criado AQUI). ORDEM DE MERGE: este bloco (backend) integra ANTES do bloco-admin, pra a função existir quando o admin substituir o stub `TODO(bloco-backend)`."
---
# Bloco — Backend: dispatch + fila + sync de status (onda 2)

Toda a lógica de ENVIO via template e de SINCRONIZAÇÃO de status. Forka da base já
com o schema (onda 1) integrado. Roda em paralelo com `bloco-admin` (arquivos
disjuntos; único seam é o contrato `reconcileTemplateStatuses`, exportado daqui).

## Itens (ordem — FIX-201 cria o que FIX-202/195 usam)
1. **FIX-201** — `template-dispatch.ts`: `resolveAndSend` (janela aberta=texto livre; fechada+APPROVED=template; fechada+não-aprovado=enfileira) + `flushOutboundQueue`.
2. **FIX-202** — `template-sync.ts` + webhook `message_template_status_update` + `reconcileTemplateStatuses`; ao virar APPROVED chama `flushOutboundQueue` (mesmo bloco, sem stub).
3. **FIX-203** — integrar os 3 pontos de disparo da confirmação (closingPresentation, sendContractSummary, signatureHandoff) pra rotearem por `resolveAndSend`.

Spec: `docs/design/specs/2026-07-02-whatsapp-templates-meta-design.md`.

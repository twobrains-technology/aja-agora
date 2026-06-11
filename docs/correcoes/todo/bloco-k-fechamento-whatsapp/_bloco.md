---
bloco: bloco-k-fechamento-whatsapp
branch: feat/fechamento-bevi-whatsapp
workspace: feat-fechamento-bevi-whatsapp
onda: 1
depends_on: []
paralelo_com: [bloco-l-qualidade-observabilidade, bloco-m-ux-funil]
itens: [FIX-25]
escopo_arquivos:
  - src/lib/whatsapp/processor.ts
  - src/lib/whatsapp/interactive-handlers.ts
  - src/lib/whatsapp/identify-capture.ts
  - src/lib/whatsapp/formatter.ts (região do contract_form)
  - tests/regression/agent-trajectory.test.ts
conflitos_esperados:
  - "NÍVEL 2 com bloco M em src/lib/whatsapp/formatter.ts: E mexe na degradação do name-prompt (região do gate nome), K mexe em contractFormToWhatsApp (linha ~1023). Regiões distantes, resolução mecânica. Ordem de merge: tanto faz."
  - "NÍVEL 2 com bloco M em tests/regression/agent-trajectory.test.ts (append-only de describes com bloco M)."
---

# Bloco K — MC-5: fechamento Bevi no canal WhatsApp

Gap P1 conhecido desde o PR #19 (memória do projeto): o fechamento Bevi é
WEB-ONLY. No WhatsApp, `contractFormToWhatsApp` (formatter.ts:1023) degrada o
card pra texto pedindo CPF, mas NÃO existe handler que parseie a resposta e
chame `startContract` — provado por grep: zero referências a `startContract`
em src/lib/whatsapp/. O usuário de WhatsApp chega ao passo 5 e cai no vazio.

## Prompt de lançamento (colar na sessão do Superset)

> Leia docs/correcoes/README.md e execute o bloco
> docs/correcoes/todo/bloco-k-fechamento-whatsapp/ (FIX-25). Valide o desenho
> contra docs/jornada/jornada-canonica.md (passo 5) e o padrão de captura
> conversacional existente (identify-capture.ts é o template — captura de CPF
> do gate identify já funciona no canal). TDD strict: Camada 1 + cassette
> Camada 2 ANTES do código. CPF NUNCA em claro em log/payload persistido
> (seguir o padrão LGPD-mínimo de bevi_proposals). NÃO tocar na região do
> name-prompt do formatter.ts (bloco E em paralelo). 1 commit por unidade.
> Ao concluir, mover o item pra done/ e apagar a pasta do bloco.

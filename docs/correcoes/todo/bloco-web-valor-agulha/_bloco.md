---
bloco: bloco-web-valor-agulha
branch: feat/web-valor-agulha-simples
workspace: feat-web-valor-agulha-simples
onda: 1
depends_on: []
paralelo_com: [bloco-jornada-entrada, bloco-whatsapp-apresentacao]
itens: [FIX-107]
escopo_arquivos:
  - src/components/chat/artifacts/value-picker.tsx
  - src/components/chat/artifacts/plan-estimate-picker.tsx
  - src/components/chat/artifacts/gate-renderer.tsx
---
# Bloco web-valor-agulha — slider simples de valor (web)

Troca o componente complexo de valor (`value_picker`, 3 sliders interligados)
por uma agulha/slider SIMPLES de 1k em 1k pro valor do bem, na WEB.

**Nível 3 (depende do contrato do bloco-jornada-entrada):** o agente para de
emitir `value_picker` na entrada e passa a coletar valor por conversa (FIX-104).
Implemente o componente web do slider simples e plugue no fluxo de valor; onde
precisar do shape final do que o agente emite, use `TODO(bloco-jornada-entrada)`
contra stub. Arquivos disjuntos dos outros blocos (só `src/components/chat/**`)
→ merge limpo.

# Bug — Pipeline: filtro de canal exibe valor cru ("all"/"whatsapp"/"web") em vez do label

- **Data:** 2026-07-02 · **Achado em:** QA dono-de-produto do FUNIL em **PRODUÇÃO** (https://ajaagora.com.br/admin/pipeline)
- **Superfície:** `/admin/pipeline` — combobox de filtro por canal (`kanban-board`/filtros do pipeline).
- **Severidade:** baixa — cosmético, mas é a primeira coisa visível na barra de filtros.

## Cenário (reproduzível)
1. `/admin/pipeline`. O gatilho do combobox de canal mostra **"all"**.
2. Selecionar WhatsApp → o gatilho passa a mostrar **"whatsapp"** (minúsculo, cru).

## Achado
- As **opções** do dropdown estão corretas e acentuadas: **Todos · Web · WhatsApp**.
- Mas o **texto do gatilho** (valor selecionado) renderiza a **chave crua** (`all`, `web`, `whatsapp`)
  em vez do label da opção (`Todos`, `Web`, `WhatsApp`).
- **Esperado:** o gatilho exibe o mesmo label da opção — default **"Todos"**, e **"WhatsApp"** quando selecionado.
- **Causa provável:** o `SelectValue`/trigger renderiza o `value` em vez do texto do item selecionado
  (ou falta `placeholder`/label lookup). Verificar no componente de filtro do pipeline.

## Nota funcional (OK)
- O filtro **funciona**: WhatsApp mostra só os leads WA; busca por nome/telefone filtra o board (client-side).
  Só o **rótulo** do gatilho está cru.

## Regressão sugerida (Camada 1)
- Render do trigger: default contém "Todos"; ao selecionar whatsapp, contém "WhatsApp" (nunca "all"/"whatsapp").

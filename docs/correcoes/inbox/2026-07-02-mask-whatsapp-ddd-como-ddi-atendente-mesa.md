---
data: 2026-07-02
origem: QA dono-de-produto (Parte 2 — Mesa de operação, PRODUÇÃO)
severidade: baixa-media
status: aberto
area: admin/atendentes-mesa — formulário de cadastro
verificado_contra: origin/main (deployado) + observação live em prod
---

# Máscara de WhatsApp interpreta o DDD como DDI no cadastro de atendente de mesa

## Cenário (reproduzido live em prod)

1. `/admin/atendentes-mesa` → "Adicionar atendente".
2. No campo "WhatsApp (com DDI+DDD)" digitar um número brasileiro no formato **DDD+número**
   `62999990001` — que é **exatamente o formato sugerido pela própria mensagem de validação**
   do campo ("WhatsApp inválido. Informe DDD + número (ex: 62999998888)").

## Esperado × Atual

- **Esperado:** máscara reconhece `62` como **DDD** (Goiânia) → algo como `+55 (62) 99999-0001`.
- **Atual:** máscara exibe **`+62 (99) 9990-001`** — trata `62` como **DDI** (Indonésia). O display
  fica claramente errado enquanto o operador digita, corroendo a confiança.

## Impacto real (limitado — NÃO é bug de dados)

- O **backend normaliza corretamente**: o valor salvo foi `5562999990001` (via `toWhatsappE164`/
  `normalizePhoneBR`, que prefixa `55`), e a **tabela exibe certo** (`+55 (62) 99999-0001`).
- Ou seja: dado íntegro, defeito **cosmético de input** + **guia inconsistente**:
  - Placeholder `+55 (62) 99999-8888` sugere digitar com DDI (13 dígitos).
  - Mensagem de validação sugere `62999998888` (11 dígitos, SEM DDI).
  - A máscara assume DDI-first. Os três se contradizem.

## Causa-raiz (verificada em `origin/main`)

`src/components/admin/mesa-attendants/mesa-attendant-form-dialog.tsx` — `formatBRPhone`:

```ts
if (d.length <= 4) return `+${d.slice(0, 2)} (${d.slice(2)}`;   // sempre 2 primeiros = DDI
```

Fatia sempre os 2 primeiros dígitos como DDI, sem detectar que um número BR de 11 dígitos começa
pelo DDD.

## Onde provavelmente mexe

Alinhar máscara + placeholder + mensagem de validação num único contrato. Sugestão: aceitar
11 dígitos como BR (DDD+número, prefixar `55` no display) OU 12-13 com DDI; e trocar o exemplo
da mensagem de validação para casar com o que a máscara espera.

## Regressão (Camada 1 — não-agêntico)

Unit em `formatBRPhone`: `formatBRPhone("62999990001")` deve render com DDI 55, não 62.

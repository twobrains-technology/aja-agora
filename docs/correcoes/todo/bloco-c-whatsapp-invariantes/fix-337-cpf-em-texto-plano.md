---
id: FIX-337
titulo: "P0 — CPF ecoado em texto plano no WhatsApp (invariante I6)"
status: todo
bloco: bloco-c-whatsapp-invariantes
arquivos:
  - src/lib/whatsapp/formatter.ts
  - src/lib/whatsapp/identify-capture.ts
rodada: 2026-07-14 — loop-de-goal desamarra, rodada 1
---

# FIX-337 — CPF em claro no balão do WhatsApp

## Cenário (dossiê auto-whatsapp, turno 10)
O agente repete o CPF do cliente **com os 11 dígitos em claro** dentro do balão.

## Root cause
`formatTextForWhatsApp` (`formatter.ts:4-36`) **não tem nenhum scrub de PII**. A máscara existe
(`maskCpf`, `identity.ts:38`; `maskCpfForDisplay`, `contract-form-prefill.ts:9-13`) mas só é
aplicada no card determinístico de contrato — nada protege o texto livre do modelo.

Invariante I6 de `docs/jornada/decisoes-do-cliente.md`: **dado sensível não trafega no WhatsApp**.

## Correção proposta
| O quê | Onde |
|---|---|
| Scrub determinístico de CPF (e qualquer sequência de 11 dígitos que valide como CPF) em TODO texto outbound do WhatsApp — mascara pra `***.***.NNN-NN` | `formatter.ts` (`formatTextForWhatsApp`) |
| Mesmo tratamento no sanitizer (defesa em profundidade) | `sanitizer.ts` |

## Regressão exigida
- Unit: `formatTextForWhatsApp("seu CPF 12345678901")` → mascarado.
- Unit: CPF com pontuação e sem pontuação, ambos mascarados.

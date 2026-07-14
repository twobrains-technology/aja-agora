---
id: FIX-337
titulo: "P0 — CPF ecoado em texto plano no WhatsApp (invariante I6)"
status: done
bloco: bloco-c-whatsapp-invariantes
arquivos:
  - src/lib/whatsapp/formatter.ts
  - src/lib/agent/orchestrator/sanitizer.ts
rodada: 2026-07-14 — loop-de-goal desamarra, rodada 1
executado_em: 2026-07-14
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

## Execução (2026-07-14)

`formatTextForWhatsApp` (`formatter.ts`) ganhou `scrubCpf`: mesmo candidato de captura do
`extractCpf` (identify-capture.ts) — `/\d[\d.\-\s]{9,17}\d/g` — mas só mascara o que VALIDA
como CPF real (`isValidCpf`, dígito verificador módulo 11) via `maskCpf` (ambos de
`@/lib/conversation/identity`), nunca qualquer sequência de 11 dígitos por acaso (evita
falso-positivo em valores/pedidos/telefones). `identify-capture.ts` não precisou de mudança —
o scrub é 100% output-side, cobre CPF vindo de QUALQUER lugar da fala do modelo.

Defesa em profundidade em `sanitizer.ts` (mesma função duplicada ali, evitando import cruzado
`agent/orchestrator` → `whatsapp/`): aplicada onde `stripEmoji` já rodava
(`stripProcessPreamble` + `EphemeralTextFilter`), channel-agnóstico (mascarar CPF nunca é
regressão em canal nenhum).

Nota: o exemplo do card ("12345678901") NÃO é um CPF válido (falha o 2º dígito verificador) —
os testes usam o CPF de teste real do projeto (529.982.247-25, mesmo de identity.test.ts).

Testes: `formatter.fix-337-cpf-scrub.test.ts` (novo) + `sanitizer.test.ts` (2 describes novos).
TDD confirmado via `git stash` do arquivo de produção (RED → GREEN) nos dois casos.

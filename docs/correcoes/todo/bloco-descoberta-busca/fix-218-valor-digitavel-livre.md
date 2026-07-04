---
id: FIX-218
titulo: "Valor do bem digitável/livre no web (relaxar o clamp à faixa do slider)"
status: todo
severidade: media
projeto: aja-agora
bloco: bloco-descoberta-busca
arquivos:
  - src/components/chat/artifacts/value-picker.tsx
  - src/lib/agent/parse-asset-value.ts
  - src/lib/agent/qualify-config.ts
rodada: 2026-07-04 — Ata de alinhamento com o cliente (item 3.1, P1)
---
## Palavras do operador
> Ata 3.1: *"Permitir valor livre / digitável (ex.: 122 mil, 1.012.000) — sem depender do slider. Não há integração com grupos nesse ponto, então qualquer valor é válido. Os grupos retornam por ordem de grandeza, não valor exato — então precisão fina no slider não é essencial (o cara digita e a gente traz o mais próximo)."*

## Cenário exato
- **Canal:** Web. Usuário digita um valor fora da faixa do slider (ex.: `1.012.000` num auto cuja faixa vai até 500k).

## Esperado × Atual
- **Esperado:** o valor digitado é aceito **como digitado** (1.012.000), sem ser capado à faixa do slider. A busca traz os grupos por ordem de grandeza mais próxima.
- **Atual:** o web **já digita** (FIX-55), mas o valor é **clampado 2×** (client + server) à faixa do slider → `1.012.000` (auto) vira `500.000`.

## Root cause (INVESTIGADO)
- **Client:** `value-picker.tsx:101` `clamp = Math.min(field.max, Math.max(field.min, v))`; aplicado no commit do input digitado em `:111-115` (`commitText` → `setValue(clamp(parsed))`).
- **Server:** `parse-asset-value.ts:131` e `clampCreditToCategory` em `qualify-config.ts:108-112` re-capam à faixa; tetos em `CREDIT_BOUNDS` (`qualify-config.ts:82-91`, auto max 500k / imóvel 2M).
- **Dead code:** `CurrencyInput` (`value-picker.tsx:38-83`) definido mas nunca usado (o render usa o `<Input>` inline) — remover.
- **TODO já sinalizado:** `qualify-config.ts:120-123` diz que o input livre da web **deveria** consumir `parseValorDoBem` em vez de re-parsear.

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| Relaxar o clamp do input digitado pra aceitar valor fora da faixa do slider (o slider mantém min/max visual; o input aceita livre) | `value-picker.tsx:101,111-115` |
| Não capar o valor digitado explícito no server (só normalizar) | `parse-asset-value.ts:131`; `clampCreditToCategory` `qualify-config.ts:108-112` |
| Convergir o parse do input livre em `parseValorDoBem` (fonte única de parsing de valor) | `qualify-config.ts:120-123` |
| Remover dead code `CurrencyInput` | `value-picker.tsx:38-83` |

⚠️ Manter o slider funcional pra quem prefere arrastar; a mudança é só **não capar** o valor digitado. Preserve a faixa como *dica visual*, não como *teto rígido do digitado*.

## Regressão exigida (TDD strict)
1. **Client:** teste que digitar `1.012.000` num auto mantém `1.012.000` (não `500.000`).
2. **Server:** teste que `parseAssetValue`/pipeline aceita o valor digitado fora da faixa sem capar.
3. Teste que o slider continua respeitando min/max ao **arrastar** (não regrediu).

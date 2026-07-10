---
bloco: bloco-r3-serverside-cards
branch: fix/r3-serverside-cards-consorcio
workspace: fix-r3-serverside-cards-consorcio
onda: 1
depends_on: []
paralelo_com: []
itens: [FIX-246, FIX-247, FIX-248, FIX-249, FIX-250]
escopo_arquivos:
  - src/app/api/chat/route.ts
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/bevi/contract-capture.ts
  - src/lib/agent/orchestrator/sanitizer.ts
  - src/lib/agent/system-prompt.ts
---

# Bloco r3 — emissão SERVER-SIDE dos cards + fio do aviso + 2 gaps novos (Fable r2)

Rodada 3. Fonte: `docs/correcoes/rodada2-fable/veredito-fable-r2.md` (nota 4/10). Fecha os 3
PARCIAIS (causa-raiz: invariante ficou no PROMPT, não em código — Lei 1/4) + os 2 gaps novos P0.

## Causa-raiz (o padrão a matar)
Os cards `two_paths`/`embedded_bid`/`scarcity` dependem de o LLM OBEDECER um directive pra chamar
`present_X` → 0 emissões ao vivo. E o aviso de carta depende de `requestedCreditValue` sobreviver a
um destructuring que o descarta. SOLUÇÃO: emitir o card server-side determinístico (writer.write
data-artifact com payload coagido, igual runner) e fiar o campo ponta-a-ponta.

## Ordem interna
FIX-246 (cards server-side) → FIX-247 (aviso rawCreditValue fio) → FIX-248 (splitter dígito) →
FIX-249 (recovery alucinação) → FIX-250 (polish menores).

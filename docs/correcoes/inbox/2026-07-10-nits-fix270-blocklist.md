---
data: 2026-07-10
origem: Fable r8
severidade: P3 (dívida, não bloqueio)
---
# Nits do guard de fabricação de estado (FIX-270)
- Guard é BLOCKLIST de frases → paráfrases podem escapar (endurecer com sinal semântico/estado real).
- Web não escreve `documentSlotsSent` → over-suppression na direção SEGURA (nunca afirma falso), mas
  pode suprimir afirmação verdadeira; fiar o slot na web.
- O DROP do guard não é logado (observabilidade — Lei 5): logar quando suprime.

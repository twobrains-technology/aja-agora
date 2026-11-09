---
slug: crypto-randomuuid-http
titulo: "Clicar no chip da landing quebra com `crypto.randomUUID is not a function` fora de contexto seguro"
status: inbox
severidade: media
projeto: aja-agora
rodada: 2026-11-09
evidencia:
  - _evidencia/crypto-randomuuid-http.log
mexe_em:
  - src/components/chat/theater/theater-context.tsx:81
---

## Palavras do operador
> (achado no log do navegador durante o teste local; o operador abriu a landing por http no domínio .orb.local)

## Cenário
- **Rota/tela:** landing `/`, botão dentro de `kv-hero.tsx:197-204`
- **Passos:** 1) abrir http://aja-agora-develop.orb.local (http, não https, não localhost) 2) clicar no chip do hero
- **Erro:** `Uncaught TypeError: crypto.randomUUID is not a function` em `openTheater`.

## Esperado × Atual
- **Esperado:** o chat abre em qualquer origem em que a página carrega.
- **Atual:** `crypto.randomUUID` só existe em contexto seguro (https ou localhost). Em http no `.orb.local` o clique morre sem abrir o chat.

## Pista de causa (A CONFIRMAR)
Falta um helper de UUID com fallback. Varrer os demais usos de `crypto.randomUUID` no código de cliente (`grep` em `src/components` e `src/lib/chat`). Contorno imediato: abrir por https://aja-app-develop.orb.local.

---
slug: scroll-chat-jitter-indo-voltando
titulo: "Scroll do chat bugado — fica indo e voltando (jitter)"
status: inbox
severidade: media
projeto: aja-agora
rodada: 2026-06-30 — uso manual do Kairo
evidencia: []
mexe_em:
  - src/components/chat/message-list.tsx
  - src/components/chat/scroll-intent.ts
  - src/components/chat/theater/theater-chat.tsx
---

## Palavras do operador
> "estamos tendo um problema no scroll, ele fica bugadno indo e voltando, anota
> esse bug ai tbm"

## Cenário
- **Rota/tela:** chat web (jornada do consórcio).
- **Sintoma:** o scroll "fica indo e voltando" — pula/oscila sozinho (jitter),
  atrapalhando a leitura.
- **Passos:** não detalhados na hora (uso manual). Provável durante streaming de
  resposta e/ou ao renderizar cards/artefatos no meio da conversa. ⚠️ Falta
  reproduzir com passo exato (qual momento dispara: stream? card novo? imagem?).

## Esperado × Atual
- **Esperado:** scroll estável — gruda no fim enquanto a resposta cresce; respeita
  o usuário quando ele rola pra cima (sem puxar de volta sozinho).
- **Atual:** scroll oscila (sobe e desce / "indo e voltando") sozinho.

## Pista de causa (A CONFIRMAR — não investigado a fundo)
Cheira a **briga de auto-scroll x intent do usuário** ou **reflow de layout durante
o stream** empurrando a posição. Onde olhar:
- `src/components/chat/scroll-intent.ts` — a detecção de "usuário rolou pra cima"
  pode estar **flickando** (threshold/limite oscilando entre stick-to-bottom e
  user-scrolled a cada frame de token).
- `src/components/chat/message-list.tsx` — o efeito de auto-scroll (scrollIntoView/
  scrollTo) pode rodar a cada delta de token e competir com o scroll manual; ou
  height mudando (card/artefato/imagem montando) desloca o conteúdo e o ajuste
  rebate.
- `src/components/chat/theater/theater-chat.tsx` — o container do teatro pode ter
  o mesmo efeito duplicado.
- Hipótese de reflow: card/artefato que muda de altura após montar (ou imagem sem
  dimensão reservada) → o "manter no fim" recalcula e salta.

**Falta provar:** capturar o momento exato (gravar tela), ver se é só durante
stream ou também parado, e se some quando o usuário NÃO está no fim da lista.

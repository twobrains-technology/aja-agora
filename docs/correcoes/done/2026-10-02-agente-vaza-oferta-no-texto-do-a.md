---
slug: agente-vaza-oferta-no-texto-do-a
titulo: "No braço A, o texto do agente entrega os valores da oferta antes do telefone"
status: done
severidade: alta
projeto: aja-agora
rodada: 2026-10-02 — smoke do A/B gravado em vídeo (2min14) + call com a Bruna de 01/10
evidencia:
  - _evidencia/variante-a-card-mais-texto-com-parcela.png
  - _evidencia/smoke-ab-texto-vaza-oferta-no-a.mp4
mexe_em:
  - src/app/api/chat/route.ts
  - src/components/chat/chat-message.tsx
  - src/lib/chat/ (diretriz/instrução do agente)
---

## Palavras do operador
> "A questão é, ele não pode mostrar enquanto ele não falar o telefone." (Kairo, call 01/10 11:45:16)
> "eu peço o celular, apesar de eu pedir o telefone que é justamente para desbloquear. Então já mostra instantâneo." (Kairo, 11:53:47)

## Cenário
- **Rota/tela:** https://ajaagora.com.br/autos?variante=A → chat → digitar valor do bem (ex.: 80.000) → "Buscar opções"
- **Passos:** 1) entra com `?variante=A`; 2) manda "Quero um carro, consigo pagar 680 por mes"; 3) clica em "Compare agora o carro ideal"; 4) digita 80000 no "Valor do bem"; 5) clica em "Buscar opções"
- **Dados usados:** PII falsa — nenhum telefone foi informado

## Esperado × Atual
- **Esperado:** no braço A, enquanto o cliente não informar o telefone, NADA da oferta aparece — nem o card, nem a fala do agente.
- **Atual:** o card da oferta é retido (funciona), mas a **mensagem de texto do agente** logo abaixo do card escreve "carta de R$ 80.000 com parcela de R$ 969,52 em 115 meses. A parcela está um pouco ac…". A trava está no artefato, não na fala.

## Pista de causa (A CONFIRMAR — não investigado a fundo)
O hold da oferta hoje é do **artefato** (`artifact-renderer`/`desbloqueio-do-telefone`), e o stream de texto do agente
não passa por esse hold. Falta provar onde a fala é montada e como segurá-la sem matar a conversa (mesma classe do
FIX-398 "viu oferta": a verdade tem que ser uma só, e a trava tem que valer para tudo que revela a oferta).

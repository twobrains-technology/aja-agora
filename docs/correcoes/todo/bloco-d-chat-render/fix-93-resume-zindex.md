---
id: FIX-93
titulo: "Modal de resume coberto pelo chat-theater (z-index) — elevar DialogContent acima do theater (z-90)"
status: todo
bloco: bloco-d-chat-render
arquivos:
  - src/components/chat/theater/resume-prompt.tsx
  - src/components/chat/theater/resume-prompt.test.tsx
rodada: 2026-06-28 — mutirão inbox (qa-noturno 21/06 + infra 24-26/06 + jornada 28/06)
---

# Bug — modal de resume fica coberto pelo chat-theater (z-index), usuário de retorno trava

- **Data:** 2026-06-21 · **Achado em:** QA noturno E2E browser (rodada 2026-06-21-0812) · **Superfície:** chat web (fluxo de retorno same-device, FIX-51)
- **Severidade:** alta — bloqueia o usuário que volta com uma conversa anterior.

## Cenário (reproduzível no browser)
1. Ter uma conversa anterior recente (cookie `aja_uid` + conversa no DB).
2. Voltar à landing, digitar no composer e clicar **Enviar**.
3. O `ChatTheater` abre (modal de chat) e, em paralelo, o app detecta a conversa anterior e renderiza o `ResumePrompt` ("Continuar de onde você parou?").
4. **Esperado:** o popup de resume aparece **por cima** do palco vazio do theater, clicável (é o design declarado em `theater-chat.tsx:112` — "palco vazio atrás + popup por cima").
5. **Atual:** o usuário vê só o **theater branco vazio com spinner**; o popup de resume está **atrás**, invisível e **inclicável** → trava (não consegue "Começar nova" nem "Voltar à conversa").

## Evidência
- Screenshot: theater branco vazio com header "Aja Agora / online agora" e spinner; resume não visível.
- `document.elementFromPoint(centro do botão "Começar nova")` → retornava uma `<div>` do `chat-theater` (não o botão). `sameAsButton=false`.
- z-index: `chat-theater` = **90** (`chat-theater.tsx:169`), `DialogContent` do resume = **50** (`dialog.tsx`). Persistente após 7s (não é transitório).

## Causa raiz
O `ResumePrompt` usa o `Dialog` do design system, cujo `DialogContent`/overlay são `z-50` e fazem portal pro `document.body`. O `ChatTheater` também faz portal pro body, mas com `z-[90]`. Como 90 > 50, o palco do theater cobre o popup. O design pretendido ("popup por cima") nunca se concretiza.

## decidido (§4.3.1 — reversível)
**Opção tomada:** elevar o `DialogContent` do `ResumePrompt` para `z-[110]` (acima do theater `z-[90]`). Mínimo e alinhado ao design "palco atrás + popup por cima". O overlay escuro do dialog (z-50) fica atrás do theater — irrelevante, pois o "fundo" visual é o próprio palco do theater. **Reversível** em 1 linha.

## Regressão
- Camada 1 (estrutural, happy-dom): `resume-prompt.test.tsx` — o `DialogContent` renderiza com z-index > 90 (extrai o número e compara). Falha antes do fix (z-50), passa depois (z-110).
- Validação E2E (browser, manual nesta rodada): pós-fix, `elementFromPoint` no botão "Começar nova" retorna o próprio botão (clicável, fora do theater).

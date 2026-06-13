---
id: FIX-32
titulo: "Auto-scroll briga com o usuário durante streaming ('buga tudo' ao rolar pra cima) e, em outro cenário, não acompanha até a resposta nova"
status: done
bloco: bloco-r-scroll-inteligente
arquivos:
  - src/components/chat/message-list.tsx
  - src/components/chat/scroll-intent.ts (novo — isNearBottom puro)
rodada: 2026-06-11 (testes manuais do Kairo no dev, pós-deploy da auditoria do dial)
anotado_em: 2026-06-11
commit: d7fb211
executado_em: 2026-06-12
---

# FIX-32 — Scroll do chat sem inteligência de intenção do usuário

### Palavras do operador

> "outro problema de ui eh q qd tento rolar a tela para cima e ele esta
> conversando, buga tudo. em outro cenario ele nao consegue levar para a
> resposta. tem q ter mais inteligencia nisso. o chat se move sozinho bem qd
> nao tem usuario querendo scrollar. qd ele quer escrolar deve conseguir"

A regra de produto está dada nas palavras dele: **sticky-to-bottom quando o
usuário não interage; o gesto do usuário SEMPRE vence; voltar a acompanhar
quando ele retorna ao fundo (ou clica no pill "Novas mensagens")**.

### Cenário exato

1. Agente streamando resposta → usuário tenta rolar PRA CIMA pra reler algo →
   a tela é puxada de volta pro fundo a cada token ("buga tudo" — o scroll
   fica disputando com o gesto).
2. Cenário inverso: chega resposta nova e o chat NÃO acompanha até ela (fica
   parado no meio), exigindo scroll manual.

### Root cause INVESTIGADO (provado no código)

`src/components/chat/message-list.tsx:44-51`:

```ts
useEffect(() => {
    if (isAtBottom || isStreaming) {
        sentinelRef.current?.scrollIntoView({ behavior: isStreaming ? "auto" : "smooth" });
    }
}, [messages, isStreaming, isAtBottom]);
```

- **Defeito 1 — `|| isStreaming`**: durante o streaming o scroll é forçado pro
  fundo **mesmo com `isAtBottom === false`** (usuário rolou pra cima). Cada
  token muda `messages` → effect re-dispara → `scrollIntoView` arranca o
  scroll da mão do usuário. É exatamente o "buga tudo".
- **Defeito 2 — detecção por IntersectionObserver do sentinel (threshold
  0.5)**: o sentinel tem `h-20`; quando um artifact alto entra no stream, o
  sentinel sai da viewport ANTES do usuário ter rolado — `isAtBottom` vira
  false sem gesto do usuário. Fora do streaming, o effect deixa de acompanhar
  → "não consegue levar para a resposta". O estado "estou no fundo" é
  confundido com "o usuário QUER ficar no fundo" — falta rastrear a INTENÇÃO
  (gesto) separada da POSIÇÃO.

### Correção proposta

| O quê | Onde |
|---|---|
| Remover `\|\| isStreaming` — auto-scroll SÓ quando o usuário está "colado" (stick) | `message-list.tsx` |
| Rastrear INTENÇÃO: gesto explícito de subir (wheel deltaY<0 / touchmove / scrollbar) desliga o stick na hora, inclusive durante streaming; voltar ao fundo (ou clicar no pill) religa | `message-list.tsx` |
| Crescimento de conteúdo NÃO desliga o stick (diferenciar scroll programático/resize de gesto do usuário — flag em torno do scrollIntoView + listener de wheel/touch) | `message-list.tsx` |
| Avaliar `overflow-anchor`/scroll anchoring nativo ou lib estabelecida (ex.: `use-stick-to-bottom`, usada pelos templates de chat do ecossistema AI SDK) em vez de reimplementar — decisão na execução pelo que casar com nosso layout | `message-list.tsx` |

### Regressão exigida

- Camada 1: testes do componente — (a) `isStreaming` true + usuário fora do
  fundo → NENHUM scrollIntoView; (b) gesto de subir durante streaming desliga
  stick; (c) mensagem nova com usuário no fundo → acompanha; (d) pill religa.
- E2E (Playwright): cenário de streaming longo + wheel up → posição de scroll
  estável; depois clicar no pill → cola no fundo. (Comportamento de UI puro,
  sem LLM — cassette dispensado.)

### Execução (2026-06-12)

- **Decisão de lib (pedida no prompt do bloco):** avaliei `use-stick-to-bottom`
  e scroll anchoring nativo (`overflow-anchor`). **Optei por implementação
  própria leve** — não adicionar dependência. Razões: (1) a regra de produto
  exige separar INTENÇÃO (gesto) de POSIÇÃO, e o gesto vencer inclusive durante
  streaming — `use-stick-to-bottom` resolve sticky por posição mas não expõe
  bem "gesto explícito desliga o stick na hora"; (2) a solução cabe em ~40
  linhas (`stick` state + `isNearBottom` puro + handlers wheel/touch/scroll com
  flag de scroll programático); (3) `overflow-anchor` nativo não dá controle do
  pill nem da reativação. Menos superfície, mais testável.
- **Fix:** removido `|| isStreaming` (Defeito 1) — auto-scroll só quando `stick`.
  `stick` é solto por gesto (wheel deltaY<0 / touchmove pra cima / rolar pra
  longe do fundo) e religado ao voltar ao fundo ou clicar no pill. Detecção de
  "fundo" trocada do IntersectionObserver do sentinel (Defeito 2) por
  `isNearBottom(container)` (posição real do scroll). `scroll-intent.ts` isola a
  função pura.
- **Camada 1 (7 testes, componente REAL + eventos REAIS):** `scroll-intent.test.ts`
  (isNearBottom) + `message-list.test.tsx` (no fundo→acompanha; wheel durante
  `isStreaming` NÃO rola; pill aparece e religa). Vistos falhar antes do fix
  (wheel no streaming rolava; pill inexistente).
- **E2E (Playwright, browser real):** `tests/e2e/specs/chat-scroll/scroll-intent.spec.ts`
  — intercepta `/api/chat` com SSE fake (formato AI SDK 6, sem LLM), cobre os 2
  defeitos: rolar pra cima + enviar nova resposta → scroll NÃO arranca pro
  fundo; pill religa e cola. **Passou 3×/3** (estável). Nota: o app dev local
  precisou ser subido (`bootstrap-workspace.sh`) e o E2E intercepta 100% a rede
  (o `/api/chat` real dá 500 no dev — DB do container sem schema; o
  migrate-guard só existe no build de prod — fora do escopo deste bloco).

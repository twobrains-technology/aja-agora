---
id: FIX-51
titulo: "Retomada same-device hidrata automático sem dar escolha — popup 'voltar à conversa anterior ou começar nova'"
status: done
commit: 0bfddba
executado_em: 2026-06-16
bloco: bloco-a-polir-funil-retorno
arquivos:
  - src/components/chat/theater/theater-chat.tsx
  - src/components/chat/theater/resume-prompt.tsx
  - src/lib/chat/provider.tsx
  - src/lib/chat/resume.ts
  - src/app/api/chat/resume/route.ts
rodada: 2026-06-15 — sessão de levantamento (PO crítico) Kairo+Claude sobre funil/retorno
---

# FIX-51 — Dar escolha ao voltar: "continuar de onde parou" ou "começar nova"

## Palavras do operador

> "melhore a experiência de voltar para uma conversa que já está em andamento.
> algum popup perguntando se quer voltar para a conversa anterior ou começar uma
> nova (sempre seguindo o design system)." — Kairo, 2026-06-15

## Cenário exato

Hoje (FIX-46) o retorno same-device retoma a conversa **automaticamente, sem
perguntar**. Em `src/components/chat/theater/theater-chat.tsx:52`:

```ts
if (conv && conv.messages.length > 0) {
  setResume({ phase: "ready", conversationId: conv.conversationId, messages: ... });
}
```

→ o `ChatProvider` é montado já hidratado com a conversa anterior. O usuário que
queria **recomeçar do zero** não tem saída pela UI — fica preso no contexto
antigo. E quem queria continuar não recebe nenhuma confirmação de que voltou.

## Root cause — observado no código

`theater-chat.tsx` decide a hidratação sozinho (mensagens > 0 → hidrata). **Não
existe ponto de decisão do usuário** entre "achei uma conversa retomável" e
"montei o chat com ela". Falta um gate de escolha (popup) nesse intervalo.

## Correção proposta

| O quê | Onde |
|---|---|
| Quando o resume traz conversa retomável **com progresso real**, em vez de hidratar direto, entrar em estado `phase: "prompt"` e exibir o popup de escolha | `src/components/chat/theater/theater-chat.tsx` |
| **Novo componente** `ResumePrompt` (Dialog do design system, `src/components/ui/dialog.tsx`): título "Continuar de onde você parou?", subtítulo com pista da conversa (objetivo/última atividade), 2 ações: **"Voltar à conversa"** (primária) e **"Começar nova"** | `src/components/chat/theater/resume-prompt.tsx` (novo) |
| "Voltar à conversa" → hidrata (comportamento atual, encadeia com FIX-49) | `theater-chat.tsx` |
| "Começar nova" → monta `ChatProvider` sem `initialMessages` (conversa nova), **preservando o contato** (mesma identidade/cookie — não vira lead órfão) | `theater-chat.tsx`, `src/lib/chat/provider.tsx` |
| Resume passa a expor metadados leves pro popup decidir/rotular (ex.: `messageCount`, `lastActivityAt`, objetivo) sem vazar dado sensível | `src/lib/chat/resume.ts`, `src/app/api/chat/resume/route.ts` |

### Decisões de DESIGN (resolver no passo 2 / brainstorming autônomo do bloco)

São escolhas reais — registrar em `docs/correcoes/decisions/`:

1. **Quando mostrar o popup:** sempre que houver conversa retomável, ou só com
   progresso significativo (ex.: ≥ N mensagens / passou da qualificação)? Mostrar
   popup numa conversa de 1 fala é ruído. Recomendação a pesar: limiar mínimo.
2. **"Começar nova" e a conversa anterior:** ela continua existindo (não apagar)
   — só não é retomada. Decidir se na próxima volta ela ainda é oferecida ou se
   "começar nova" a marca como encerrada/arquivada.
3. **Componente:** Dialog (bloqueante, centrado) — coerente com o painel teatro —
   vs. banner inline menos intrusivo. O operador pediu "popup" → Dialog. Confirmar
   variante no design system (shadcn `dialog.tsx` / bloco Pro) e **mobile-first**
   (o teatro é mobile-first: foco, safe-area, toque ≥44px).
4. **Cópia:** PT-BR, sem cara de IA; seguir o tom do chat (consultor próximo).

## Regressão exigida

UI React **não-agêntica** → **sem cassette**. Cobertura:

- **Component test (`theater-chat` + `resume-prompt`):** resume com conversa
  retomável (acima do limiar) → popup renderiza; "Voltar" → `ChatProvider`
  hidratado com `initialMessages`; "Começar nova" → `ChatProvider` sem
  `initialMessages`, contato preservado.
- **E2E (Playwright):** abre chat, avança além do limiar, fecha, reabre →
  popup aparece → (a) "Voltar" restaura o histórico; (b) "Começar nova" abre
  thread limpa sem o histórico antigo. Conversa sem progresso → popup NÃO
  aparece (não vira ruído).
- **Camada 1 (structural):** assert que `theater-chat` tem o estado `prompt`
  entre `loading` e `ready` e que o resume expõe os metadados de decisão.

Ver falhar primeiro (hidrata sem perguntar), depois corrigir.

> Encadeia com **FIX-49** (mesmos arquivos de retomada): o popup é o **gate de
> entrada** da volta; o FIX-49 cuida de **como** a volta se apresenta depois que
> o usuário escolhe "Voltar". Mesmo dev, em sequência.

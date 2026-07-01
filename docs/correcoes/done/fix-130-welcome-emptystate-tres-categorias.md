---
id: FIX-130
titulo: 'Welcome inicial do chat web (EmptyState) com 3 categorias — cópia duplicada escapou do FIX-121'
status: done
executado_em: 2026-07-01
severidade: media
projeto: aja-agora
frente: 1 (Descoberta+Qualificação+Identidade) — QA autônomo divergencias-jornada
arquivos: [src/lib/chat/welcome-options.ts, src/components/chat/message-list.tsx, src/lib/web/adapter.ts, src/lib/chat/welcome-options.test.ts, src/components/chat/message-list.welcome-fix-130.test.tsx]
rodada: 2026-07-01 — QA autônomo da onda divergencias-jornada (validação adversarial)
---

## Origem (QA adversarial do FIX-121 / D21)

O **FIX-121** corrigiu a divergência **D21** (welcome do chat web com 4 categorias, incluindo
"Outros"/servicos, contra 3 no WhatsApp/landing) editando `WELCOME_OPTIONS` em
`src/lib/web/adapter.ts` — o array consumido pelo evento `welcome-categories`.

O QA achou que **existia uma SEGUNDA cópia** de `WELCOME_OPTIONS`, local em
`src/components/chat/message-list.tsx:210-215`, ainda com **4 categorias** (`{ value:
"servicos", label: "Outros" }`). Essa cópia alimenta o `EmptyState` (`message-list.tsx:143`,
`{!hasMessages && <EmptyState />}`) — que é **a PRIMEIRA tela que o usuário vê ao abrir o chat
web sem histórico**. Ou seja: o FIX-121 marcou D21 como resolvido, mas o welcome inicial do
chat web **continuava mostrando 4 chips com "Outros"**. Falso-verde: o teste do FIX-121
(`adapter.test.ts`) validava a cópia do adapter, cega à cópia do `message-list`.

## Cenário exato

- **Rota/tela:** chat web, primeira interação (sem mensagens → `EmptyState`).
- **Atual (bug):** card de boas-vindas com **4** categorias clicáveis — Imóvel, Automóvel,
  Moto e **"Outros"**.
- **Esperado (jornada Passo 1 + regra-mãe de paridade):** **3** categorias — Imóvel, Automóvel,
  Moto — em paridade com WhatsApp (`welcomeButtonsToWhatsApp`) e landing (`hero` CHIPS).
  `servicos` continua VIVA no domínio, acessível por texto livre — só não é chip de entrada.

## Root cause

**Duplicação de fonte.** Havia dois arrays `WELCOME_OPTIONS` independentes (adapter.ts +
message-list.tsx). O FIX-121 corrigiu um e ignorou o outro. A classe do bug é a duplicação:
qualquer correção numa cópia deixa a outra divergir.

## Correção (fonte única)

| O quê | Onde |
|-------|------|
| Cria a **fonte única** client-safe das 3 categorias de entrada | `src/lib/chat/welcome-options.ts` (novo) |
| `EmptyState` importa a fonte única; remove a cópia local de 4 | `src/components/chat/message-list.tsx` |
| Adapter importa a fonte única e a re-exporta (mantém superfície pública p/ `adapter.test.ts`) | `src/lib/web/adapter.ts` |

`servicos` **não** foi removida do domínio (Category/CATEGORY_META/turn-analyzer/qualify-config
intactos) — só deixou de ser chip clicável, exatamente como WhatsApp/landing.

## Regressão (código puro determinístico — Camada 1 + render)

- **Render (reproduz o bug do usuário)** `message-list.welcome-fix-130.test.tsx`: renderiza o
  `EmptyState` real → assere que NÃO há "Outros" e que há exatamente 3 categorias. **Falhou
  ANTES do fix** (4 botões / "Outros" presente), passou depois.
- **Structural (fonte única)** `welcome-options.test.ts`: 3 categorias exatas, sem
  servicos/Outros, e **paridade com os botões do WhatsApp** (`welcomeButtonsToWhatsApp`).

Bug de UI de código puro (não passa por LLM) → não precisa de cassette da Camada 2.

## Verificação

- `pnpm test:unit`: **2199 verdes** (era 2194; +5 testes novos), zero regressão.
- typecheck limpo nos arquivos tocados.

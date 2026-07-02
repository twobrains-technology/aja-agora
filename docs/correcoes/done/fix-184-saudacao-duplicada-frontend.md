---
id: FIX-184
titulo: "'Prazer, Mirella!' aparece duplicado na tela — bug é só no frontend, backend salvou 1x"
status: done
commit: 72f3bd7c
executado_em: 2026-07-01
bloco: bloco-c-frontend-e-flaky
severidade: baixa
projeto: aja-agora
arquivos:
  - src/components/chat/chat-message.tsx
  - src/components/chat/message-list.tsx
rodada: 2026-07-01 — conversa real da Mirella (automóvel, produção), reportada pelo Kairo
evidencia:
  - conversationId 69a38af1-567f-4f33-adbc-e8a9ce5ef83e, message id e509a33e-7c00-46b3-9780-7514d0b2e588 (única, no banco)
mexe_em:
  - src/components/chat/chat-message.tsx
  - src/components/chat/message-list.tsx (groupAdjacentText — mesmo arquivo citado no card FIX-102)
  - src/lib/hooks/ ou provider de useChat (SSE streaming, AI SDK 6)
---

## Palavras do operador
> "veja essa dinamica, ja temos varios probelmas, a saudacao ficou duplicada..."
> (print anexado mostrando "Prazer, Mirella!" duas vezes seguidas na tela)

## Cenário
- **Rota/tela:** chat web, conversa da Mirella, logo após ela responder "Pode me chamar de
  mirella" ao Rafael (persona auto).
- **Passos:** 1) usuário envia o nome; 2) tela mostra a bolha "Prazer, Mirella!" **duas vezes**
  seguidas, uma embaixo da outra.

## Esperado × Atual
- **Esperado:** a resposta "Prazer, Mirella!" aparece 1 única vez.
- **Atual:** aparece 2x na tela.

## JÁ CONFIRMADO (não é hipótese): não é bug de agente/backend

Consultei o Postgres de produção diretamente — a tabela `messages` tem **apenas UM registro** com
esse conteúdo (`id e509a33e-7c00-46b3-9780-7514d0b2e588`, `created_at 2026-07-01 18:46:40.457+00`).
O backend gerou e persistiu a resposta corretamente 1 única vez. A duplicação é **exclusivamente
visual**, no cliente — renderização React duplicando a bolha (key de lista colidindo, efeito de
streaming SSE re-adicionando a mesma mensagem no estado local, ou dois componentes lendo a mesma
mensagem).

## Pista de causa (NÃO investigada a fundo — zero grep feito ainda)

Suspeitas a confirmar (nenhuma provada):
- `useChat` (Vercel AI SDK 6) processando o mesmo evento SSE 2x (reconexão/retry duplicando delta).
- Alguma combinação de estado otimista (mensagem adicionada localmente ao enviar) + a mensagem
  "real" vinda do stream, sem dedup por id.
- Key de `.map()` na lista de mensagens não sendo o `message.id` real (renderizando 2 nós DOM pra
  a mesma entrada de estado, ou o oposto: 2 entradas de estado pro mesmo `id`).

Precisa de investigação de verdade (não é 1 grep barato) — provavelmente reproduzir localmente com
DevTools React aberto observando o array de mensagens do `useChat` turno a turno.

## 🔬 NÃO é a doença arquitetural — é bug independente de cliente

Importante não conflar: os outros dois cards da conversa da Mirella
(`analyzer-intent-ver-mais-opcoes.md` e `texto-colado-multi-tool-turn.md`) são sintomas de UMA doença
— a fase pós-busca dirigida pelo LLM sem governança determinística (ver as 6 leis em
`~/.claude/reference/arquitetura-agentes-ia.md`). **Este aqui não.** É rendering React no cliente,
zero relação com o agente/arquitetura de IA — o backend salvou 1x, provado no banco. Fica no mesmo
inbox por ter aparecido na mesma tela, mas é **P3 isolado**, corrige por conta própria (não entra no
escopo da spec de governança da jornada). Não deixar o medo do bug grande contaminar a leitura deste:
é chato, é visual, é pequeno.

## Resolução (2026-07-01, commit 72f3bd7c) — causa PROVADA

Causa cravada por leitura de código (não hipótese): o `runner.ts` acumula os
`text-delta` da LLM em `fullResponse` e só aplica `collapseEchoedSegments` (a
guarda do eco/degeneração do FIX-102) na **persistência**, DEPOIS do streaming
(runner.ts:308). O stream **ao vivo**, porém, já emitiu os deltas crus pro cliente
(adapter `pipeOrchestratorToWriter` → `useChat`), que renderiza o eco. Por isso o
DB fica limpo (1 registro) e a tela mostra 2x — exatamente o que a evidência dizia.

Dois shapes do eco chegam ao cliente: (a) concatenado num único text part
("Prazer, Mirella!Prazer, Mirella!", quando o texto stremia contíguo após o
`forceToolChoice`); (b) em text parts adjacentes separados por um `data-tool` (que
`classifyParts` dropa) e depois juntados com "\n\n" no `groupAdjacentText`.

Fix client-side (sem tocar runner — server-only e mexido em paralelo pelo
bloco-a/FIX-182): `collapseEchoedText` em `chat-message.tsx`, espelho exato do
guard do server, colapsa segmentos `[.!?]` 100% idênticos consecutivos no texto
renderizado de cada `text-group`. Compara com `trim()`, então pega os dois shapes
(o "\n\n" do join some junto com o eco). A tela passa a bater com o DB.

Regressão (Camada 1 / render): `src/components/chat/chat-message.fix-184.test.tsx`
renderiza o `ChatMessage` REAL com os 2 shapes + 1 caso de não-regressão. Bug
não-agêntico (render puro) → sem cassette de Camada 2 (regra do CLAUDE.md).

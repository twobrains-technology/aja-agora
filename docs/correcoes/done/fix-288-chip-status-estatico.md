---
id: FIX-288
titulo: "Chip de status do reveal fica ESTÁTICO ~50-64s no mesmo texto (Eixo B — latência percebida, frontend)"
status: done
severidade: media
projeto: aja-agora
bloco: bloco-r9-3-latencia-percebida
arquivos:
  - src/components/chat/streaming-dots.tsx
  - src/components/chat/streaming-dots.test.tsx
rodada: "2026-07-12 loop r9 ONDA 3 (pós-onda-2 Sonnet 4/10, P3-6/G-E, veredito-r9pos2-sonnet.md §3)"
commit: f787bfc7
executado_em: 2026-07-12
---
## Palavras do juiz (veredito r9pos2, Sonnet 5 — P3-6, UX 5/10)
> "Latência do reveal (busca+recomendação+simulação+comparação, turno 7) ficou em 59-64s em
> TODOS os 4 reveals completos desta rodada [...] consistente, não é ruído; G5 segue sem
> mitigação (deferido pra onda 3)."
> — `.processo/loop/evidencias-r9/veredito-r9pos2-sonnet.md` §1 (UX) + §3 (P3-6)

Nota: o ITEM aqui é o **Eixo B (percebido, seguro)** da spec da onda 3 — feedback visual que
evolui com o tempo, sem tocar a Bevi. NÃO paraleliza chamadas reais (isso é FIX-289, eixo
A-seguro, e o PENDENTE-KAIRO de paralelizar as 2 chamadas Bevi fica fora de escopo — precisa
confirmação AGX/Bevi antes, não é decisão autônoma).

## Cenário exato
- **Rota/tela:** chat web, qualquer turno que dispare `search_groups` (reveal) — o chip de
  status ("Buscando grupos") aparece assim que a tool-call é emitida e permanece visível durante
  todo o tempo em que aquele MESMO nome de tool é o último conhecido.
- **Passos:** usuário confirma valor do bem → agente chama `search_groups` → chip mostra
  "Buscando grupos" → busca leva 15-25s (cold-start DigitalOcean) + a query com/sem embutido é
  sequencial → só quando a PRÓXIMA tool-call chega (`recommend_groups`/`simulate_quota`) o texto
  muda.
- **Dados usados:** latências reais capturadas no dossiê (59314-64230ms por reveal, ver FIX-289
  e §1 UX do veredito) + código de `StreamingDots`/`ChatMessage`.

## Esperado × Atual
- **Esperado:** o chip evolui a copy com o tempo dentro do MESMO tool (ex.: "Buscando grupos" →
  depois de N segundos → "Ainda buscando, a Bevi está processando..." ou algo que sinalize
  progresso real, evitando a sensação de travado).
- **Atual:** `StreamingDots` (`streaming-dots.tsx:16-30`, `TOOL_LABELS`) é uma função PURA do
  prop `tool` — nenhum timer/estado interno. `currentTool` em `chat-message.tsx:240`
  (`latestToolName(message)`) só muda quando uma NOVA tool-call chega no stream; enquanto
  `search_groups` for a última tool conhecida (~50-64s), o componente renderiza o MESMO
  `label.text` ("Buscando grupos") sem qualquer mudança visual além dos 3 pontos pulsantes.
  Usado em 2 pontos idênticos: `chat-message.tsx:274` (`isStreamingEmpty`) e `:380`
  (`showInflightDots`).

## Root cause (INVESTIGADO — provado no código)
- `TOOL_LABELS` (`streaming-dots.tsx:16-30`) é um mapa ESTÁTICO `toolName → {text, icon}` — 1
  texto fixo por tool, sem noção de duração.
- `StreamingDots({ tool })` (`streaming-dots.tsx:32-85`) não tem `useState`/`useEffect`/timer —
  é puramente derivado do prop recebido a cada render; a `AnimatePresence key={"tool:"+tool}`
  (linha 62-63) só dispara uma transição quando o VALOR de `tool` muda, nunca por tempo decorrido.
- `chat-message.tsx:240` calcula `currentTool` uma vez por render a partir da última tool-call
  vista na mensagem (`latestToolName`) — não existe relógio nem re-render agendado enquanto o
  mesmo tool permanece em voo; o componente só re-renderiza quando o STREAM emite algo novo
  (texto/artifact/tool-call), o que não acontece durante os 50-64s de espera do
  `search_groups`/`simulate_quota`.
- Consequência direta: para o usuário, a tela parece travada no MESMO texto por quase 1 minuto
  — mesmo com os pontos animando, não há sinal de que o processo está avançando internamente
  (2 queries sequenciais sem/com embutido + cold-start).

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| `StreamingDots` ganha um timer interno (`useEffect`/`setInterval` ou `useState` com `Date.now()` de quando o `tool` atual começou) que troca a COPY do mesmo tool após N segundos (ex.: 8-10s "Buscando grupos" → depois "Consultando administradoras em tempo real" → depois "Quase lá, finalizando a busca") — texto evolutivo por tool, não mais 1 label fixo | `streaming-dots.tsx` (`TOOL_LABELS` vira `TOOL_LABEL_STAGES: Record<string, Array<{afterMs, text, icon}>>` ou equivalente) |
| Resetar o timer sempre que `tool` mudar (novo tool-call chegou) — nunca continuar contando do tool anterior | `streaming-dots.tsx` (efeito com dependência em `tool`) |
| pt-BR correto em toda copy nova (acentuação/cedilha — inviolável do projeto) | `streaming-dots.tsx` |

## Regressão exigida
- Novo `src/components/chat/streaming-dots.test.tsx` (RTL + `vi.useFakeTimers`): renderiza
  `StreamingDots tool="search_groups"`, avança o relógio fake N segundos, assevera que o texto
  visível mudou pro estágio seguinte; renderiza com `tool` trocando de valor e assevera que o
  timer reinicia (não pula direto pro estágio avançado do tool anterior).
- Sem regressão do comportamento atual pra tools de duração curta (o 1º estágio continua sendo o
  texto de hoje, ex. "Buscando grupos" aparece imediatamente).
- `pnpm test:unit` verde.

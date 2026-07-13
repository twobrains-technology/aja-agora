---
id: FIX-296
titulo: "Reordenar funil pré-reveal + abertura por categoria com divider de especialista"
status: inbox
severidade: alta
projeto: aja-agora
arquivos: [src/lib/agent/qualify-state.ts, src/lib/agent/orchestrator/gate-questions.ts, src/lib/agent/orchestrator/directives.ts, src/lib/chat/types.ts, src/components/chat/artifact-renderer.tsx]
rodada: 2026-07-12 (loop-de-goal r10, onda 1, bloco r10-1-funil-reveal)
---
## Palavras do operador
> "uai já tá errado, porque não é aqui o momento dele fazer isso [pedir CPF]... essa questão aqui de
> pedir o CPF, o celular, tem que ser mais para frente depois que trocou uma ideia ali com o
> cliente" — teste manual da jornada com Qwen 3.5 Fast, 2026-07-12.

## Cenário exato
- **Rota/tela:** chat web, jornada de vendas de consórcio, começo da conversa.
- **Passos:** 1) usuário diz "oi" 2) escolhe categoria "Automóvel" 3) diz o carro (ex.: Corolla)
  4) responde o motivo ("meu carro tá velho") 5) observa o que o agente pede em seguida.
- **Dados usados:** ver `docs/design/specs/assets/2026-07-12-aja-dois-cenarios.html` (array `F1`,
  cenário Madalena — script turno-a-turno completo com anotações do porquê de cada jogada).

## Esperado × Atual
- **Esperado (mockup):** abre perguntando a CATEGORIA antes do nome, com um divider "Rafael
  entrou na conversa — Especialista em automóveis"; depois nome→carro→motivo→(espelho da dor +
  objetivo)→**valor do bem** (copy contextual: "quanto custa esse Corolla?")→**só então**
  CPF/celular, com moldura "pra eu trazer as ofertas reais das administradoras".
- **Atual:** nome é o 1º gate (sem categoria antes, sem divider); logo após o motivo, o CPF é
  pedido no MESMO turno (`qualify-state.ts:264-266`); o `credit` (valor) só vem depois do
  `identify`, com copy genérica "Qual valor do bem faz mais sentido pra você?" sem referenciar o
  bem específico.

## Root cause (INVESTIGADO — provado no código)
- `qualify-state.ts:85` (`identify`) dispara ANTES de `:88` (`credit`) — decisão do FIX-53
  ("precisa pedir os dados antes do valor").
- `qualify-state.ts:264-266`: case especial em `decideShowGate` que FORÇA o card de
  identidade no mesmo turno em que o usuário responde o motivo (`meta.motivationAsked &&
  !meta.identityCollected`).
- `gate-questions.ts:89-90`: copy do `credit` é fixa ("Qual valor do bem..."), não usa
  `desiredItem` capturado no `desire`. `gateQuestion()` hoje só recebe `category`, não o item
  específico.
- Não existe abertura por categoria-antes-do-nome nem artifact de "divider de especialista" — o
  `name` é o 1º gate (`qualify-state.ts:57`); a troca de persona existe em `directives.ts:29` mas
  sem UI de divider.

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| Nova ordem: categoria→nome (com divider)→desire(bem)→motivo(turno próprio, condicional — só quando o fluxo pede, ver FIX-297/D1)→credit(copy com `desiredItem`)→identify(moldura "ofertas reais")→search | `qualify-state.ts` (`nextGate`, `decideShowGate`), `gate-questions.ts` |
| `gateQuestion()` passa a receber o item específico (`desiredItem`) além da `category`, com fallback genérico quando não há item específico | `gate-questions.ts`, chamadores em `qualify-state.ts`/orchestrator |
| Remover o case que cola identidade no turno do motivo; motivo vira beat de espelho+objetivo (directive server-side curta) | `qualify-state.ts:264-266` |
| Novo artifact/beat "X entrou na conversa — Especialista em Y" após a escolha de categoria | `types.ts` (novo tipo ou reaproveitar `directives.ts:29`), `artifact-renderer.tsx` |
| Registrar ADR: reversão consciente do FIX-53 (identidade continua obrigatória antes do search, só muda de posição relativa ao valor) | `docs/decisoes/decisoes.md` |
| ⚠️ Preservar: FIX-294 (denylist `present_whatsapp_optin`) e FIX-295 (re-emite `identify` na supressão de `contract_form` pré-reveal) — rodar `test:integration` (não só `test:unit`) no gate deste bloco |

## Regressão exigida
- Teste de sequência atualizado (`qualify-state.sequence.test.ts` e afins) provando a NOVA ordem
  categoria→nome→desire→motivo(condicional)→credit(contextual)→identify→search, com identidade
  SEMPRE antes do search.
- Teste de integração reproduzindo a transcrição real (motivo respondido → identidade NÃO aparece
  no mesmo turno).
- `test:integration` completo (não só unit) verde, cobrindo especificamente os cenários dos
  FIX-294/295.

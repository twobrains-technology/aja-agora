---
id: FIX-188
titulo: "Preâmbulo de processo ('deixa eu buscar…') é persistido como mensagem final — falta noção de texto EFÊMERO vs FINAL + sanitizer runtime + status determinístico durante a busca"
status: todo
severidade: alta
projeto: aja-agora
bloco: bloco-streaming-chat-layer
arquivos:
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/HARD_RULES.md
  - tests/regression/agent-trajectory.test.ts
rodada: 2026-07-01 — refino do print "vazamento de processo + proposta fantasma" (Kairo)
evidencia:
  - _evidencia/agente-nao-responde-ate-novo-input-print.png
referencia_inbox:
  - 2026-07-01-...narra-busca (só a parte "sanitizer runtime anti-meta-narrativa (ainda não existe)")
---

## Palavras do operador
> (print do Kairo: bolha com "Boa, Kairo! Pra simular direitinho, deixa eu puxar os
> números reais da sua faixa: / Olha só o que a gente encontrou na sua faixa de R$ 130.000:
> / Preciso buscar as opções reais primeiro antes de simular. / …". Versão "Maria":
> "Deixa eu buscar as melhores opções na sua faixa: / Vou buscar as opções certas pra você:
> / Preciso primeiro buscar os grupos disponíveis. Um segundo: / Deixa eu usar a ferramenta
> certa pra isso:")

## Cenário exato
- **Rota/tela:** chat (web e WhatsApp).
- **Passos:** turno multi-step em que o modelo, antes de cada tool-call, escreve um preâmbulo
  de processo ("deixa eu buscar", "vou usar a ferramenta certa", "um segundo"). Todos os
  preâmbulos são persistidos e aparecem ao usuário.

## Esperado × Atual
- **Esperado:** texto de PROCESSO ("deixa eu buscar…", "vou usar a ferramenta…") **nunca** é
  persistido nem enviado — ou é suprimido, ou vira um **status determinístico do sistema**
  (o chip "Buscando grupos" que já existe). Só a **resposta final** (com o resultado) vira
  bolha. Alinha com a 1ª das 6 leis: "LLM não dirige o fluxo".
- **Atual:** não existe distinção efêmero × final. Todo `text-delta` (inclusive o preâmbulo)
  entra na mensagem persistida.

## Root cause INVESTIGADO (provado no código)
- Não há noção de mensagem "de status/typing efêmera" vs "final". Todo `text-delta` (inclusive
  o preâmbulo pré-tool) é acumulado em `fullResponse` (`src/lib/agent/orchestrator/runner.ts:242`)
  e salvo (`runner.ts:443-451`) / bufferizado no WhatsApp (`src/lib/whatsapp/adapter.ts:201`).
- A única defesa hoje são **regras soft no system-prompt** — `system-prompt.ts:477` ("texto
  pre-tool NUNCA afirma achado", FIX-36), `:495-505` ("Não narre seus próprios passos… BAD:
  'Deixa eu buscar pra você.'"), `:489-491`. Quando o modelo desobedece (multi-step), **nada
  em código filtra** (viola a 4ª lei: invariante crítico deve ser código, não regra-no-prompt).
- O card de inbox `...narra-busca` já apontou a necessidade de um "**filtro runtime
  anti-meta-narrativa** (sanitizer, ainda não existe)" — este fix cria esse sanitizer.
- Pós-onda-1: como o erro de descoberta já vira diretiva (FIX-186), o sanitizer só precisa
  cuidar de preâmbulo de **sucesso** — não de narração de erro.

## Correção proposta
| O quê | Onde |
|-------|------|
| Marcar/segregar o texto pré-tool como **efêmero** (não entra em `fullResponse` persistido) — o step só contribui pra bolha final se for o texto de RESULTADO | `src/lib/agent/orchestrator/runner.ts` (~242, composição) |
| **Sanitizer runtime determinístico** anti-meta-narrativa de processo (allowlist do que PODE sair; dropa "deixa eu buscar/puxar", "vou usar a ferramenta", "um segundo", "preciso primeiro buscar…") | novo `src/lib/agent/…/sanitizer.ts` chamado no `runner.ts` |
| Emitir **status determinístico do sistema** durante a busca (reusar o chip "Buscando grupos" que já existe) no lugar do texto do modelo | `runner.ts` / adapter (o artifact de status já existe) |
| Reforçar a regra soft no `system-prompt.ts` + `HARD_RULES.md` (defesa-em-profundidade, mas a barreira REAL é o sanitizer em código) | `system-prompt.ts`, `HARD_RULES.md` (mesmo commit) |

## Regressão exigida (3 camadas — CLAUDE.md §"Regressão de agent")
- **Camada 1 (structural):** teste do sanitizer (dropa preâmbulos conhecidos, preserva
  resposta legítima); assert que `fullResponse` não inclui texto efêmero.
- **Camada 2 (cassette OBRIGATÓRIO):** `tests/regression/agent-trajectory.test.ts` — cassette
  do turno multi-step com preâmbulos por step; detector reprova qualquer "deixa eu buscar/
  puxar", "vou buscar", "um segundo", "preciso primeiro buscar" na mensagem final.
- **Camada 3 (eval nightly):** persona na descoberta bem-sucedida — nenhum preâmbulo de
  processo aparece, só o resultado.

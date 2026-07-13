---
id: FIX-297
titulo: "Reveal condicional em dois tempos com consentimento (nunca hero direto sem pedir)"
status: todo
bloco: bloco-r10-1-funil-reveal
severidade: alta
projeto: aja-agora
arquivos: [src/lib/agent/orchestrator/runner.ts, src/lib/agent/orchestrator/index.ts, src/lib/agent/orchestrator/recommendation-payload.ts, src/lib/agent/qualify-state.ts, src/lib/agent/orchestrator/gate-questions.ts]
rodada: 2026-07-12 (loop-de-goal r10, onda 1, bloco r10-1-funil-reveal — MESMO bloco do FIX-296, fusão obrigatória por acoplamento de máquina de estados)
---
## Palavras do operador
> "Encontramos boas opções pra você nessa faixa. Vamos te mostrar a mais adequada... [detalhamento
> completo da ITAÚ]" — o agente escolhe e detalha uma administradora sem pedir permissão nem
> mostrar a lista primeiro. Teste manual com Qwen 3.5 Fast, 2026-07-12.

## Cenário exato
- **Rota/tela:** chat web, pós-valor do bem informado, busca de ofertas.
- **Passos:** 1) usuário informa o valor do bem 2) sistema busca grupos 3) observar o que aparece
  antes da recomendação.
- **Dados usados:** mockup `docs/design/specs/assets/2026-07-12-aja-dois-cenarios.html` — cenário
  Madalena (`F1`): lista de grupos → "já fez consórcio antes?" → explicação + chips de dúvida →
  "Posso te mostrar a opção que eu recomendo?" → só então o hero. Cenário Mario (`F2`): lista →
  auto-seleção da Canopus pelo próprio usuário → pergunta de lance → `two_paths` (SEM hero).

## Esperado × Atual
- **Esperado:** dois tempos COM consentimento explícito antes do hero, e só quando o fluxo leva a
  uma recomendação (nem todo fluxo tem hero — Mario não tem).
- **Atual:** a cadeia pós-search emite hero + `comparison_table` juntos, sem pausa nem
  consentimento (`runner.ts:939-959`, FIX-290) — sempre, independente do fluxo.

## Root cause (INVESTIGADO — corrigido pelo crítico da rodada)
- **Localização real** (a spec original apontava `recommendation-payload.ts:252-259`, que é só o
  *builder*; o crítico confirmou que o acoplamento hero+tabela que precisa ser desfeito vive em
  **`runner.ts:939-959`**, que força `comparison_table` sempre que `recommendation_card` aparece e
  há 2+ grupos — FIX-290) + `runner.ts:1043` (`revealCompleted`).
- FIX-290 foi a vitória que fechou "comparison_table nunca some" (r9, 10/10 selado) — **não pode
  regredir**. Este fix não desfaz FIX-290; ele insere um passo de consentimento ENTRE a tabela e o
  hero, mantendo a tabela sempre server-side.

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| **Condicional** (D1 aprovado): só nos fluxos que levam a hero, cadeia vira `search`→lista(`comparison_table`, SEMPRE server-side, preserva FIX-290)→gate `experience` ("já fez consórcio?")→explicação+chips (catálogo canônico, ver FIX-300) se 1ª vez→novo gate leve `reco-consent` ("posso te mostrar a recomendada?")→hero. Fluxos sem hero (ex.: Mario) pulam direto pra lista→`two_paths` | `runner.ts`, `orchestrator/index.ts`, `qualify-state.ts` (novo gate `reco-consent` — NÃO precisa virar valor no enum `Gate` se implementado como sub-passo do `experience`; avaliar a forma mais simples que não quebre a máquina) |
| Hero pós-consentimento é **server-forced** (nunca dependente do LLM chamar tool) — é o que garante sobreviver a modelo fraco | `emitServerCard` em `orchestrator/index.ts` |
| Copy do `experience`/explicação usa o catálogo canônico de dúvida do mockup ("o que é lance?", "como funciona o sorteio?", "e quando eu for contemplado?") | `gate-questions.ts` |
| ⚠️ Regression test do FIX-290 (`comparison_table` nunca some) tem que continuar verde | `tests/regression/` |

## Regressão exigida
- Teste de integração reproduzindo cenário Madalena: lista aparece ANTES do hero, gate
  `experience` dispara entre os dois, hero só aparece após resposta afirmativa ao `reco-consent`.
- Teste de integração reproduzindo cenário Mario: lista→`two_paths` sem `experience`/`reco-consent`/hero.
- Teste de regressão do FIX-290 (`comparison_table` nunca some) continua verde.
- Sonda adversarial: rodar o mesmo roteiro com `AI_MODEL` apontando pro Qwen — hero ainda sai
  (server-forced), não depende do LLM "decidir" chamar tool.

---
id: FIX-293
titulo: "sob pressão o agente inventa estado de grupo (cheio/pausado) e simplifica o score multi-fator pra 'valor mais próximo' — directive determinística só cobre o caminho de tool-error"
status: done
severidade: media
projeto: aja-agora
bloco: bloco-r9-4-valor-honestidade
arquivos:
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/orchestrator/index.ts
rodada: "2026-07-12 loop r9 ONDA 4 (pós-onda-3 4/10, P2 UX/I2, veredito-r9pos3-sonnet.md §3)"
commit: 1aa963ad
executado_em: "2026-07-12"
---
## Palavras do juiz (veredito r9pos3, Sonnet 5 — P2 UX, probe-i2-justificativa turnos 8-9)
> "'é o valor mais próximo disponível' (simplifica o score multi-fator pra só proximidade); 'às
> vezes esses grupos já estão cheios ou pausados' (inventado, sem tool-output que sustente);
> 'provavelmente era de outra administradora' (especulação apresentada como fato)."
> — `.processo/loop/evidencias-r9/veredito-r9pos3-sonnet.md` §3

## Cenário exato
- **Rota/tela:** chat, turnos 8-9 de `probe-i2-justificativa` — o usuário pergunta, em texto
  livre normal (SEM disparar tool-error/cap), por que a recomendação não é a exata que ele pediu.
- **Passos:** o modelo responde com texto livre — não usa o `scoreBreakdown` real do card já
  exibido; inventa estado de grupo (cheio/pausado) que nenhuma tool retornou; especula sobre
  administradora sem lastro.
- **Dados usados:** `dossie.md` probe-i2, turnos 8-9, texto completo do agente.

## Esperado × Atual
- **Esperado:** a justificativa de "por que essa recomendação" é SEMPRE ancorada no
  `scoreBreakdown` real (parcela/contemplação/taxa) e NUNCA alega estado de grupo (cheio/pausado/
  outra administradora) sem tool-output que sustente.
- **Atual:** existe uma directive determinística pra esse tipo de pergunta
  (`isExactnessOrCriteriaQuestion`/`buildToolErrorRecoveryExactnessFallback`, FIX-282) — mas ela só
  dispara dentro do caminho de RECUPERAÇÃO de tool-error/cap. Numa conversa normal (como as duas
  perguntas dos turnos 8-9, que não disparam tool-error), o modelo fica livre pra narrar qualquer
  coisa, guiado só por prosa solta no system-prompt que cobre a APRESENTAÇÃO inicial, não a
  JUSTIFICATIVA de divergência sob repergunta.

## Root cause (INVESTIGADO — provado no código)
- `isExactnessOrCriteriaQuestion` + `buildToolErrorRecoveryExactnessFallback`
  (`src/lib/agent/orchestrator/directives.ts:460-530`, FIX-282) é a ÚNICA resposta determinística
  já existente pra "por que essa e não outra"/"bate com o que pedi" — mas o único call-site
  (`src/lib/agent/orchestrator/index.ts:563-572`) está DENTRO do bloco
  `if (result.toolErrorThisTurn || result.toolCallCapExceededThisTurn)` (guarda em `index.ts:484`).
  Ou seja: o invariante SÓ roda quando um guard de tool-error/cap intercepta o turno — é
  literalmente o mesmo padrão que o próprio comentário do FIX-282 descreve como "escopo estreito
  de propósito" (linhas 467-470), mas o escopo ficou estreito demais: não cobre o caso de LONGE
  mais comum, que é o usuário perguntar isso numa conversa normal, sem nenhum tool-error no turno.
- Nos turnos 8-9 do probe-i2 não há tool-error nem cap excedido — o modelo respondeu livremente,
  guiado só pela seção "Textos de recomendação — coerentes com o score"
  (`src/lib/agent/system-prompt.ts:659-677`), que instrui COMO descrever a recomendação na
  APRESENTAÇÃO inicial (templates de "% do teto", adjetivos proibidos, score) mas não tem NENHUMA
  instrução sobre como responder a uma REPERGUNTA de justificativa/divergência, nem proibição
  explícita de alegar estado de grupo (cheio/pausado) sem tool-output.
- Root cause: o invariante determinístico certo (FIX-282) existe mas está ATADO à condição errada
  (tool-error/cap) em vez de à condição real que importa (o usuário fez uma pergunta de
  exatidão/critério, tool-error ou não) — fora dessa condição estreita, a resposta cai 100% em
  texto livre do LLM sem nenhuma proibição explícita contra fabricar estado de grupo.

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| Estender o disparo de `isExactnessOrCriteriaQuestion` pra rodar em QUALQUER turno de usuário (não só dentro do bloco de tool-error/cap) — quando a pergunta bate no padrão E há `meta.recommendedOffer` conhecido, materializar a resposta factual (mesma `buildToolErrorRecoveryExactnessFallback` ou variante) ANTES de deixar o modelo gerar livremente | `src/lib/agent/orchestrator/index.ts` (novo ponto de checagem no fluxo principal do turno, fora do `if (toolErrorThisTurn...)`) — renomear a função se deixar de ser exclusiva de tool-error |
| Adicionar ao `scoreBreakdown` usado na resposta o critério REAL (parcela/contemplação/taxa) — já exposto no card, garantir que a directive cite os 3 fatores, não só o `creditValue` | `directives.ts` (função de FIX-282, ampliar o texto gerado) |
| PROIBIR explicitamente no system-prompt (nova regra dura, mesmo padrão das já existentes em `system-prompt.ts:662` "REGRA DURA") alegar estado de grupo (cheio/pausado/outra administradora) sem tool-output que sustente — reforço de prompt pro caminho residual onde o texto livre ainda aparece (ex.: perguntas fora do padrão regex) | `src/lib/agent/system-prompt.ts` (seção "Textos de recomendação", ~659-677, ou nova seção de "resposta a repergunta de justificativa") |

## Regressão exigida
- Novo teste (integration, padrão `index.fix-282-honestidade-toolerror.integration.test.ts`, sem
  o tool-error): turno de usuário normal (sem guard disparado) perguntando "por que essa e não
  outra?" com `meta.recommendedOffer` presente — assevera que a resposta usa
  `buildToolErrorRecoveryExactnessFallback`/variante determinística (cita score real), nunca texto
  livre do LLM.
- Novo teste (prompt/snapshot ou unit sobre o guard, se existir sanitizer aplicável): resposta
  livre que contenha "cheio"/"pausado"/"outra administradora" sem tool-output correspondente é
  sinalizada/bloqueada — ou, no mínimo, o novo trecho do system-prompt proíbe explicitamente essas
  frases (checar via teste de conteúdo do prompt, mesmo padrão de outras regras duras já testadas).
- `pnpm test:unit` verde.

## Ordem interna do bloco
FIX-292 primeiro (fonte única de valor), depois FIX-293 (directive de justificativa) — sem
dependência de código real entre os dois, mas é a ordem lógica registrada na spec da onda.

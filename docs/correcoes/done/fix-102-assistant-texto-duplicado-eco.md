---
id: FIX-102
bloco: bloco-h-chat-render
slug: assistant-texto-duplicado-eco
titulo: "Eliminar texto duplicado/eco nas respostas do assistant (degeneração da LLM)"
status: done
severidade: baixa
projeto: aja-agora
rodada: 2026-06-28 — validação E2E da jornada web (descoberta Trilho B, imóvel)
evidencia:
  - "DB homolog: conversa c89bec1f-4f6c-4284-acf0-248f26b8e9f3, msg d0bab508-835f-4b47-b22b-73dde7062d84"
  - "2ª ocorrência (QA autônomo Frente 1, E2E de tela real): conversa 5d8ab51f-6a06-46fd-8ac5-44c48cc5d792 — \"Boa, então já sabe como funciona!Boa, então já sabe como funciona!\" (mesmo shape exato: zero separador)"
mexe_em:
  - src/lib/agent/orchestrator/runner.ts
  - src/components/chat/chat-message.tsx
  - src/lib/agent/personas.ts
commit: 3f3a14b
executado_em: 2026-06-28
---

## Palavras do operador
> "vi mensagens duplicadas na conversa" (achado durante a validação E2E: a bolha do
> assistant repetiu a mesma frase 2x e ecoou o quick-reply clicado)

## Cenário
- **Rota/tela:** chat web (`http://aja-develop.orb.local`), jornada de imóvel, persona Helena.
- **Passos:** 1) retomar conversa; 2) clicar quick-reply de gate "Já conheço"; 3) clicar "Bora!".
- **Dados usados:** conta de teste Kairo (homologação); conversa `c89bec1f`.

## Esperado × Atual
- **Esperado:** cada frase aparece 1x; a resposta não começa ecoando o label do quick-reply.
- **Atual:**
  - resposta a "Já conheço" → `"Boa, então a gente vai direto ao ponto.Boa, então a gente vai direto ao ponto."` (frase 2x colada, sem separador).
  - resposta a "Bora!" → `"Bora!Beleza, Kairo."` (eco do label do quick-reply colado no início).

## Pista de causa (INVESTIGADA nesta sessão — causa cravada)
**Degeneração/eco NÃO-determinístico da LLM, não bug de código.** Evidência:
- `runner.ts:159` (`fullResponse += part.text`) só concatena os deltas do
  `result.fullStream` da LLM fielmente — sem retry, sem injeção de label, sem loop duplo.
- Client é 100% fiel aos `message.parts`: `chat-message.tsx` (`groupAdjacentText`),
  `message-list.tsx`, `provider.tsx` (`sendAction` envia o label como `text` do user, normal).
- DB confirma a dup DENTRO do `content` gerado (não são mensagens/parts separados).
- Varredura `^(.{15,60}[.!?])\1` em `messages` (role=assistant) no DB INTEIRO → **1 só** ocorrência.
  Se fosse bug de código (dedup faltando / append duplo) seria sistemático (toda conversa).
- O handler de gate NÃO ecoa o label sistematicamente (outros quick-replies não colam o label),
  então o `"Bora!"` inicial é geração da LLM, não eco de código.

### Caminho fechado / mitigações (decisão de produto = Kairo)
1. **Guarda defensiva** colapsando segmentos/parágrafos 100% idênticos consecutivos antes de
   persistir/renderizar (runner ou `groupAdjacentText`). Pega o `"Boa...Boa..."`; NÃO pega o
   `"Bora!Beleza"`. Determinístico e testável (Camada 1). Trata sintoma, não causa.
2. **Reforço no system prompt** anti-repetição + anti-eco-do-quick-reply (persona especialista).
   Ataca a causa, mas é não-determinístico → exige as 3 camadas de regressão de agent
   (structural + cassette em `tests/regression/agent-trajectory.test.ts` + eval nightly).
3. **Aceitar** como ruído raro (1 em todo o DB de homologação).

Severidade baixa: cosmético, raro, não quebra o fluxo (descoberta e fechamento funcionaram).

## Resolução (2026-06-28)

Implementada a **mitigação 1** (guarda defensiva determinística), conforme decidido no card.
`collapseEchoedSegments()` adicionada a `src/lib/agent/orchestrator/runner.ts`, aplicada em
`fullResponse` logo após o fim do streaming — antes de qualquer uso (persistência do `content`,
prefixo do próximo gate, `RunAgentResult` retornado). Não mexe em prompt/persona, então não exige
cassette de Camada 2 (a mitigação é 100% determinística, sem componente de comportamento da LLM).

Regressão: Camada 1 estrutural em
`src/lib/agent/orchestrator/runner.assistant-texto-duplicado-eco.test.ts` — 6 casos (frase colada
repetida, parágrafo repetido com quebra de linha, repetição tripla, texto normal intacto, eco de
quick-reply intacto — fora do escopo por decisão de produto, string vazia).

### 2ª ocorrência confirmada ao vivo (2026-07-01, QA autônomo Frente 1 — E2E de tela real)

Reproduzido AO VIVO uma 2ª vez (mesmo shape exato, gate `experience=returning`, zero separador)
durante a spec E2E do golden path web — a 2ª ocorrência descarta de vez a hipótese "acidente
isolado" sem virar sistemático (ainda raro, mas recorrente o suficiente pra confirmar que a guarda
já implementada (`collapseEchoedSegments`) segue necessária). Nenhuma implementação nova exigida
— a guarda já cobre esse shape exato (ver testes acima).

### ⚠️ Achado da mesma rodada — padrão IRMÃO, fora do escopo desta guarda

Na MESMA spec E2E (turno de search-summary, resposta ao directive interno
`buildSearchSummaryDirective`), observado: `"Boa, vou ver o que tem na sua faixa:Encontrei
3 boas opções na sua faixa, olha só:Atenção: a simulação foi ajustada — o..."` — **3 frases
DIFERENTES** coladas sem separador (não é auto-duplicação X+X, é ausência de quebra entre
sentenças distintas). `collapseEchoedSegments` **não pega** esse shape de propósito (só colapsa
segmentos IDÊNTICOS consecutivos, nunca frases diferentes — evita falso-positivo). Mesma família
de degeneração (LLM às vezes falha em separar sentenças), sintoma diferente — precisaria de
heurística mais ampla (ex.: detectar `[.!?:]` seguido de maiúscula sem espaço/quebra) e mais RISCO
de falso-positivo (nomes próprios, siglas). **Não implementado** (fora do escopo imediato,
cosmético, exigiria design cuidadoso). Registrado aqui pra próxima sessão decidir: ampliar a
guarda ou ir pra opção 2 (reforço de prompt, ver acima).

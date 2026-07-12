---
id: FIX-285
titulo: "shouldAskMotive nunca segura o funil quando o usuário só nomeia a categoria genérica (não um item específico) — motivo pulado + CPF repetido em sequência"
status: done
severidade: media
projeto: aja-agora
bloco: bloco-r9-2-gate-refino
arquivos:
  - src/lib/agent/qualify-state.ts
  - src/lib/agent/orchestrator/analyze.ts
  - src/lib/agent/personas.ts
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/qualify-state.fix-285-motivo-item-generico.test.ts
rodada: "2026-07-12 loop r9 ONDA 2 (pós-onda-1 Sonnet 4/10, gap G-C)"
commit: 1b5eb66
executado_em: "2026-07-12"
---

## Nota de execução (desvio do proposto no card)

O campo `desireAnswered` é marcado em `analyze.ts` só quando
`activeGateAtTurnStart === "identify"` (não em qualquer turno com `desireAsked`
true, como o card sugeria) — sem esse escopo, um turno bem mais tarde (ex.:
respondendo o gate `credit`) marcaria o campo retroativamente e
`shouldAskMotive` passaria a segurar TODOS os gates dali em diante, não só o
`identify`. Regressão pega pelos cassettes `agent-trajectory.test.ts` (FIX-208)
antes do commit final.
## Palavras do juiz (veredito r9pos, Sonnet 5 — G-C, Funcional 6/10)
> "turno 4 pula direto pra `gate:identify` [...] sem perguntar o motivo. No turno 5, quando o
> usuário ainda assim dá um motivo [...], o agente REPETE o mesmo pedido de CPF/celular — 2 turnos
> seguidos pedindo a mesma coisa, o motivo nunca é reconhecido com uma pergunta própria."
> — `.processo/loop/evidencias-r9/veredito-r9pos-sonnet.md` §3, G-C

**Nota:** a hipótese original da rodada ("`meta.motivationAsked` marcado cedo?") foi
INVESTIGADA e REFUTADA — o campo nunca chega a ser marcado neste cenário; a causa é upstream, na
extração de `desiredItem` (abaixo). O "CPF pedido 2x" É SINTOMA do mesmo root cause, não um bug
separado: como o gate do motivo nunca segura o turno 4, `gate:identify` dispara cedo demais; o
usuário responde com o motivo em vez do CPF no turno 5, e o sistema — ainda sem identidade — repete
a MESMA pergunta de CPF (comportamento correto de re-prompt; a causa real é o motivo ter entrado
fora de ordem).

## Cenário exato
- **Rota/tela:** chat web, gate `desire` (pergunta "Qual carro você tem em mente?", turno 3) →
  resposta do usuário (turno 4) → `gate:identify`.
- **Passos (probe-i1-empty-turn):** turno 4 usuário responde **"Um carro, uns 80 mil"** →
  agente pula direto pra "Me manda seu CPF e celular" (sem perguntar o motivo) → turno 5 usuário
  diz "Quero trocar o meu que já tá velho" (motivo, não pedido) → agente espelha o motivo mas
  REPETE o mesmo pedido de CPF/celular.
- **Dados usados:**
  `.processo/loop/evidencias-r9/dossies-r9pos/probe-i1-empty-turn/dossie.json` (turnos 3-6).

## Esperado × Atual
- **Esperado:** após o `desire` (bem + motivo), segurar o funil UMA vez pra perguntar o motivo
  ANTES de avançar pro `identify` (Refino 2026-07-11, item 3; `qualify-state.ts:183-194`).
- **Atual:** o motivo nunca é perguntado neste cenário; `identify` dispara direto no turno da
  resposta ao `desire`.

## Root cause (INVESTIGADO — provado no código)
`src/lib/agent/qualify-state.ts:191-194`:
```ts
export function shouldAskMotive(meta: ConversationMetadata): boolean {
    const q = meta.qualifyAnswers ?? {};
    return Boolean(q.desiredItem) && q.motivation === undefined && !meta.motivationAsked;
}
```
A precondição EXIGE `q.desiredItem` truthy. Mas `q.desiredItem` só é populado quando o
ANALISADOR (LLM) extrai um item ESPECÍFICO — por instrução EXPLÍCITA do próprio prompt do
analyzer, `turn-analyzer.ts:153`:
> "desiredItem e motivation [...] preencha só quando o usuário nomear o bem específico ('um
> Corolla', 'apê de 2 quartos') [...] **não invente a partir da categoria genérica**."

"Um carro, uns 80 mil" NÃO nomeia um item específico — "um carro" é exatamente a categoria
genérica ("auto") que a persona já sabe, então o analyzer (corretamente, por design) devolve
`desiredItem: null`. Resultado: `q.desiredItem` nunca é setado → `shouldAskMotive` nunca é
`true` neste turno → `decideShowGate` (`qualify-state.ts:247`,
`if (isUserTurn && shouldAskMotive(meta)) return false;`) nunca segura o `identify` → o gate
dispara direto, mesmo o usuário TENDO respondido ao `desire` (só que sem nomear um item
específico). `meta.motivationAsked` nunca chega a ser marcado (`runner.ts:1117-1118`) porque a
condição que o marcaria (`shouldAskMotive`) nunca é satisfeita — confirma que a hipótese original
("marcado cedo demais") está errada; o campo simplesmente nunca liga.

O acoplamento é o bug: `shouldAskMotive` deveria segurar o funil sempre que o usuário TIVER
RESPONDIDO ao gate `desire` (independente de o item ter sido específico o bastante pra virar
`desiredItem`) — hoje ele depende de um efeito colateral de uma extração de entidade que tem
motivo de ser conservadora (evitar "Espelhe: você quer um carro" robótico), não de sinalizar "o
desire foi respondido".

## Correção proposta (o quê × onde)
| O quê | Onde |
|---|---|
| Novo campo determinístico `meta.desireAnswered?: boolean` — marcado quando o gate `desire` é o ATIVO no início do turno (`activeGateAtTurnStart === "desire"`, já computado em `analyze.ts:42`) e o usuário respondeu (isUserTurn), INDEPENDENTE do que o analyzer extraiu como `desiredItem` — mesmo padrão do guard `activeGateAtTurnStart` já usado pra `creditMax`/`hasLance` (FIX-279/FIX-236) | `analyze.ts` (`analyzeAndMerge`) + tipo em `personas.ts` |
| `shouldAskMotive`: trocar a precondição `Boolean(q.desiredItem)` por `Boolean(meta.desireAnswered)` (mantém `q.motivation === undefined && !meta.motivationAsked`) | `qualify-state.ts:191-194` |
| `desireFollowUpSection` (a diretiva que instrui o LLM a perguntar o motivo) usa `desiredItem` pra montar a frase ("O cliente já disse o que tem em mente: '{desiredItem}'..."). Quando `desireAnswered=true` mas `desiredItem` é null (item genérico), usar uma variante SEM citar o item ("Faltou só uma coisa — o que fez você decidir agora?"), pra não gerar uma diretiva vazia/quebrada quando o gate segurar sem item específico | `system-prompt.ts:1019-1027` (`desireFollowUpSection`) |
| Confirmar que este bloco compartilha `system-prompt.ts` com o bloco `bloco-r9-2-prompt-honestidade` (FIX-283 mexe em `whatsappOptinSection`, linha ~918-920 — região DIFERENTE de `desireFollowUpSection`, linha ~1019-1027) — ver `conflitos_esperados` no `_bloco.md` | — |

## Regressão exigida
- Novo `qualify-state.fix-285-motivo-item-generico.test.ts` (mesmo padrão de
  `qualify-state.fix-274-sem-consent.test.ts`): `shouldAskMotive({ desireAnswered: true,
  qualifyAnswers: { desiredItem: undefined, motivation: undefined }, motivationAsked: false })`
  retorna `true` (hoje retorna `false` — reproduz EXATAMENTE o bug do probe-i1). TDD strict: falha
  antes do fix, passa depois.
- Novo caso de integração (`index.test.ts` ou equivalente do orchestrator): replica o cenário
  "Um carro, uns 80 mil" → o turno NÃO pode disparar `gate:identify` nesse mesmo turno; o motivo
  tem que ser perguntado antes.
- Rodar `pnpm test:unit` completo — confirmar que a mirror do motivo (`motivationMirrorSection`)
  e o watchdog FIX-275 (`qualify-state.ts:248-258`, resposta ao motivo classificada como
  `expressing_doubt`) continuam funcionando sem regressão.

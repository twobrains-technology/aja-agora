---
id: FIX-74
titulo: "Acentuar prompts/diretivas do agente (.ts) — cirúrgico, só diacrítico/ortografia"
status: todo
bloco: bloco-d-acentuacao-textos
arquivos:
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/turn-analyzer.ts
  - src/lib/agent/orchestrator/directives.ts
  - src/lib/admin/insights-prompt.ts
  - src/lib/agent/mesa-copilot/system-prompt.ts
rodada: 2026-06-24 — pedido por voz do Kairo
---

## Palavras do operador
> "todos os textos possíveis tenham acentuação"

## Cenário exato
`system-prompt.ts` (1076 linhas) tem 300+ palavras sem acento (voce ~100x, nao
~79x, consorcio ~23x, simulacao, credito, ja ~37x, opcao, decisao, numero,
historico, esta/sao verbos…). Idem em `turn-analyzer.ts` (L25/41/47/88/110),
`insights-prompt.ts` (L1/20/21/22/23), `mesa-copilot/system-prompt.ts`,
`directives.ts`. Os cassettes de `agent-trajectory.test.ts` mostram que isso
**vaza pro usuário**: o agente respondeu "Da uma olhada nas opcoes…", "Qual
faixa de credito voce esta pensando…", "Achei uma opcao bem proxima…".

## Root cause investigado (provado)
Os prompts foram redigidos sem acentuação. Como o prompt é o "espelho de estilo"
do modelo, texto-fonte sem acento incentiva saída sem acento (confirmado pelos 3
cassettes). Corrigir a fonte (prompt acentuado + instrução de acentuação já
existente em L4/L71) ataca a causa.

## Correção proposta
| O quê | Onde |
|---|---|
| Acentuar TODAS as palavras PT-BR do corpo dos prompts (diacrítico, cedilha, til) | os 5 arquivos |
| Preservar 100% do sentido, ordem e estrutura — **NÃO reescrever, NÃO reformular, NÃO mexer em pontuação/markdown** | todos |

### Linha vermelha (inviolável) — só conserto ortográfico
- **NÃO** alterar identificadores de código, nomes de tools (`present_value_picker`),
  chaves JSON, variáveis, texto em inglês.
- **Marcadores literais parseados pelo código** (ex.: `Nome do usuario:`,
  `Categoria de consorcio detectada`, rótulos terminados em `:` que o código
  injeta como system message OU casa por `includes`/regex): ANTES de acentuar,
  faça `grep` do literal no repo. Se ele é construído/casado em código:
  - acentue nos **dois** lados (prompt + injeção/match) de forma idêntica, OU
  - **preserve** o literal como está e registre em `.done/` ("marcador X preservado
    — parseado em <arquivo:linha>"). Default seguro = preservar quando houver dúvida.
- **NÃO** tocar nos 3 cassettes de `tests/regression/agent-trajectory.test.ts`
  (L546, L693, L4941) — são fixtures de bug intencionais (saída buggada do
  agente). Mexer neles é mudar fixture de teste sem motivo.

## Regressão exigida
- O guard do FIX-73 (Camada 1) cobre estes arquivos — tem que ficar verde.
- `pnpm typecheck && pnpm test:unit` verde: cobre os structural tests do
  prompt (`system-prompt.*.test.ts`, `builder.*` rodam no test:unit? builder é
  excluído — mas `system-prompt.*` roda) e os cassettes de trajetória.
  - **Se** algum structural test assertar um literal sem acento que você
    acentuou (e que NÃO é marcador parseado, só copy), atualize o assert do
    teste junto, no mesmo commit, pra refletir a forma correta. **Se** for
    marcador parseado, reveja (provavelmente devia ter preservado).
- 1 commit Conventional por arquivo/grupo coeso (`fix:` — acento faltando é
  defeito ortográfico).

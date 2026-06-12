---
id: FIX-36
titulo: "Agente afirma 'Encontrei opções na sua faixa' ANTES do search_groups completar — frase-modelo instruída no prompt/directives afirma resultado que ainda não existe"
status: todo
bloco: bloco-t-ux-chat
arquivos:
  - src/lib/agent/orchestrator/directives.ts (frase-modelo do slider, linha ~154)
  - src/lib/agent/system-prompt.ts (ORDEM DE ENTREGA ~416, exemplo GOOD ~421, "introducao neutra" ~437, exemplo de quebra de linha ~123)
  - tests/regression/agent-trajectory.test.ts (cassette)
rodada: 2026-06-12 (testes manuais do Kairo no dev)
anotado_em: 2026-06-12
---

# FIX-36 — "Encontrei" antes de buscar (texto afirma resultado pré-tool)

### Palavras do operador

> "ele fala que encontrou antes de buscar"

### Cenário exato (print, dev 2026-06-12)

Usuário clica "Enviei meus dados pra buscar as ofertas" → na tela, AO MESMO
TEMPO: balão do agente **"Boa, Kairo! Encontrei opções na sua faixa — veja a
que mais se encaixa no seu perfil:"** + indicador **"Buscando grupos"** ainda
girando. O agente afirma o resultado de uma busca que ainda está em andamento.
Se a Bevi demorar ou falhar (acontece — "Tive um problema ao falar com a
administradora" já foi visto nesta rodada), o "Encontrei" vira mentira visível
e mina a confiança no produto.

### Root cause INVESTIGADO (provado no código — instruído, não alucinado)

O design atual manda o modelo escrever a introdução ANTES de chamar a tool, e
as frases-modelo fornecidas AFIRMAM resultado:

1. `directives.ts:154` (slider de faixa): "FLUXO OBRIGATORIO: (1) escreva UMA
   frase curta de introducao no SEU TOM tipo **'Encontrei essas opcoes na sua
   faixa, escolhe uma pra simular:'** (2) chame search_groups..." — a ordem
   texto→tool com frase afirmativa é literal.
2. `system-prompt.ts:416` ("ORDEM DE ENTREGA"): "o sistema envia primeiro o
   seu texto e DEPOIS o card... ('**Encontrei algumas opcoes na sua faixa**,
   da uma olhada:')".
3. `system-prompt.ts:421`: exemplo GOOD com "Encontrei algumas opcoes...".
4. `system-prompt.ts:437`: chama de "introducao curta e **neutra**" a frase
   "Encontrei essas opcoes:" — que não é neutra, é afirmação de resultado.

Tensão de design a respeitar: outra regra do prompt PROÍBE meta-narrativa de
mecânica ("vou simular", "deixa eu calcular" — `directives.ts:102`). A solução
não pode trocar "encontrei" por "vou buscar".

### Correção proposta

| O quê | Onde |
|---|---|
| Trocar as frases-modelo pré-tool por transição honesta que NÃO afirma resultado NEM narra mecânica: "Boa, [Nome]! Bora ver o que encaixa no seu perfil:" / "Olha só o que a gente consegue na sua faixa:" — regra explícita: PROIBIDO afirmar achado ("encontrei", "achei", "aqui estão", "essas são") antes do retorno da tool | `directives.ts` (todas as directives com frase-modelo pré-search/recommend) + `system-prompt.ts` (ORDEM DE ENTREGA + exemplos) |
| O anúncio do ACHADO (quantidade/qualidade) só DEPOIS do tool result — em turno pós-tool ou embutido no card (que só renderiza com dados reais) | `system-prompt.ts` |
| Revisar o caso de 0 resultados/erro: a transição honesta degrada bem ("não achei nada nessa faixa" sem contradizer o que foi dito antes) | `system-prompt.ts` (seção de erro já existente) |

### Regressão exigida (3 camadas — comportamento de agent)

- Camada 1: asserts no prompt/directives — frases-modelo pré-tool não contêm
  "Encontrei/achei/aqui estão"; regra de proibição presente.
- Camada 2: cassette — turno do slider/identify: texto que precede o
  tool-call de search_groups não afirma resultado (regex de detecção);
  cenário de erro Bevi: nenhuma afirmação de achado antes da falha.
- Camada 3: critério na rubrica de eval — coerência temporal texto×tool
  (nenhuma afirmação de resultado antes do resultado).

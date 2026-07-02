---
bloco: bloco-streaming-chat-layer
branch: fix/composicao-mensagem-efemera
workspace: fix-composicao-mensagem-efemera
onda: 2
depends_on: [bloco-funil-turno-orquestracao]
paralelo_com: []
itens: [FIX-188, FIX-189, FIX-190]
escopo_arquivos:
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/web/adapter.ts
  - src/lib/whatsapp/adapter.ts
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/HARD_RULES.md
  - tests/regression/agent-trajectory.test.ts
conflitos_esperados:
  - "runner.ts + orchestrator/index.ts: a onda 1 (bloco-funil-turno-orquestracao) já tocou a LÓGICA do turno (erro→diretiva, gate). Esta onda 2 forka da base JÁ com a onda 1 integrada, então mexe na CAMADA de composição (efêmero vs final, segmentação de bolha) sobre o código já corrigido. Conflito mínimo — resolver mantendo a diretiva de erro da onda 1 e envelopando a composição por cima."
---
# Bloco — Streaming / camada de composição da mensagem (efêmero × final)

## Por que estes itens estão juntos

Os três itens são a **camada de exibição**: QUE texto vira bolha, QUANDO, e em quantas
bolhas. É a segunda metade da correção do print do Kairo — depois que a onda 1 garantiu
que o erro vira diretiva (não narração), esta onda garante que **preâmbulo de processo
nunca é persistido** (FIX-188), que **bolhas são segmentadas** e o streaming **não pendura**
até novo input (FIX-189), e que **frases de fallback técnico** ("atualiza a página") são
vetadas em profundidade (FIX-190). Tocam a mesma família (`runner.ts` + adapters +
system-prompt) → 1 dev, 1 sessão.

## Serialização (onda 2)
Serializado após a onda 1 (não paralelo) porque ambos tocam `runner.ts`/`orchestrator/index.ts`
e porque a onda 1 muda o que o modelo produz na falha — o sanitizer do FIX-188 forka já
sabendo que **erro não vira texto** (só precisa cuidar de preâmbulo de sucesso). Menos
retrabalho, sem sanitizar algo que a diretiva da onda 1 já removeu.

## Ordem interna
1. **FIX-188** — preâmbulo pré-tool nunca vira mensagem final + sanitizer runtime + status determinístico.
2. **FIX-189** — segmentação de bolhas (FIX-182 é cosmético) + streaming não pendura até novo input.
3. **FIX-190** — defesa-em-profundidade anti-frase-de-fallback ("atualiza a página").

## Cards de inbox promovidos / referenciados
- **Promovido:** `2026-06-21-agente-fallback-refresh.md` → vira base do **FIX-190** (mover pro bloco).
- **Referenciado (NÃO movido):** `2026-07-01-...narra-busca.md` — só a parte "sanitizer runtime
  anti-meta-narrativa (ainda não existe)" alimenta o FIX-188. A OUTRA metade do card (gate
  identify não pede CPF no WhatsApp) é problema de FUNIL de identidade, **fora do escopo** —
  fica no inbox.

## Evidências no `_evidencia/` (triar como parte do tema)
- `agente-nao-responde-ate-novo-input-print.png` — **FIX-189** (streaming pendura em "Buscando
  grupos"; já existe o chip de status, mas o texto do LLM sai junto e a resposta trava até o
  usuário mandar "travou?").
- `fim-proposta-bugado-doc-simulador-print.png` — composição confusa no fechamento + intent
  "bora" mal interpretado. **NÃO investigado no diagnóstico.** Se a causa de composição for a
  mesma do FIX-189, trate junto; a parte de INTENT ("bora" = avançar) pode ser outro bug —
  registre no `.done/` se ficar pra próxima. Não invente root cause.

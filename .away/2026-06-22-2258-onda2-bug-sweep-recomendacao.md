# Away — Lançar onda 2 autônoma (bug re-descoberta + sweep multi-faixa) e mergear de volta na develop

- **Início:** 2026-06-22 22:58 · **Sessão:** aja-agora/develop
- **Critério de pronto:** os 2 blocos da onda 2 (`bloco-d-resimula-faixa-reveal`, `bloco-e-sweep-multifaixa`) MERGEADOS na `develop` com gate (typecheck+test) verde — OU quarentenados com `⚠️ PENDENTE-KAIRO`. Nenhum bloco verde fica preso por causa de um vermelho.
- **Status:** EM ANDAMENTO

## Contexto (de onde isso veio)

Investigação dos logs do agent na develop (conversa `a8b0a80d`, "Maria"): o agent
mostra a 1ª cota mas, ao trocar de faixa de valor (256k→130k), não consegue re-buscar
— fabrica um groupId sintético (`auto-130k-60m`) e trava em loop de "instabilidade".
Dois trilhos saíram disso:
- **Bloco D (bug):** `tool-policy.ts` remove `search_groups` na fase `reveal`
  (BUG-REVEAL-LOOP) → usuário não troca de faixa pós-reveal. Fix = guard de "valor
  mudou". 3 camadas de regressão.
- **Bloco E (feature):** sweep sequencial multi-faixa na descoberta (varre 3-5 faixas,
  acumula no `offerIndex` já cumulativo) + spike de validação ao vivo da Bevi.

Os 2 são independentes (D=tool-policy, E=adapter/discovery) → paralelos.

## Decisões

### D1 · 22:58 — Escopo = só os 2 trilhos da conversa (não os a/b/c parados)
- **Contexto:** havia 3 blocos pré-existentes no `todo/` (a/b/c, FIX-52..60, rodada
  2026-06-19) ainda não lançados. O Kairo respondeu "tudo que precisar para resolver
  todos os pontos que dissemos, o que ficar mais produtivo".
- **Decidi:** lançar SÓ `bloco-d` + `bloco-e` (os pontos da conversa: bug + sweep).
  Não tocar a/b/c.
- **Alternativas:** (a) incluir a/b/c — descartado: são backlog parado e FIX-58/59/60
  citam decisões pendentes do Bernardo; lançá-los furaria uma espera deliberada e
  daria ~5 workspaces (Kairo é sensível a excesso de paralelismo).
- **Reversibilidade:** fácil (a/b/c seguem intactos no todo/).
- **Evidência:** `git ls-remote` confirmou que a/b/c nunca foram lançados (sem branch remota).

### D2 · 22:58 — Blocos D/E em `onda: 2` como rótulo de isolamento
- **Contexto:** `launch-blocks`/`merge-wave` operam por ONDA lendo todos os `_bloco.md`
  do `todo/`. Os a/b/c são `onda: 1`. Se D/E fossem onda 1, `merge-wave poll --wave 1`
  travaria esperando tags dos a/b/c (que nunca virão).
- **Decidi:** marcar D/E como `onda: 2` (`depends_on: []`) — não é dependência, é
  isolamento. Lanço/pollo/mergeio com `--wave 2`; os a/b/c (onda 1) ficam intocados.
- **Alternativas:** mover a/b/c pra fora do scan (descartado: não mexo no backlog dele);
  `--root` separado (descartado: fragmenta a estrutura).
- **Reversibilidade:** fácil.
- **Evidência:** dry-run `--wave 2` confirmou "pula a/b/c (onda 1≠2)", dispara só D/E.

### D3 · 22:58 — Bloco E NÃO toca recommendation.ts (limite de escopo)
- **Contexto:** o sweep melhora a recomendação e o `bloco-b` parado (FIX-56) também
  mexe em `recommendation.ts` (dedup administradora). Conflito futuro.
- **Decidi:** desenhar o sweep contido no adapter/discovery — só ENRIQUECE o `offerIndex`
  que a recomendação consome; `recommendation.ts` fica reservado ao bloco-b. Eliminado
  o conflito por design.
- **Reversibilidade:** fácil (limite anotado no fix-70 + _prompt.md).

## Linha do tempo (resumida)
- 22:58 — anotação dos 2 blocos pronta (FIX-68/69/70). Dry-run validado. Lançando onda 2.
- 22:59 — onda 2 disparada (commit anotação `32221c17`). Workspaces: `fix-resimula-faixa-reveal`=e4978eab, `feat-sweep-multifaixa-descoberta`=88e6fbfa. Poll inicial: 2 pending. Wakeup agendado (~30min).

## Relatório final (preencher ao encerrar)
- **Resultado vs critério de pronto:** _(pendente)_
- **O que NÃO fiz e por quê:** _(pendente)_
- **Revisar primeiro:** _(pendente)_
- **Próximos passos sugeridos:** _(pendente)_

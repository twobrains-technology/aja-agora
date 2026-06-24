# Away — Revisar/corrigir acentuação+ortografia PT-BR de todos os textos da plataforma (workspace autônomo) + regra global

- **Início:** 2026-06-24 18:20 · **Sessão:** aja-agora / develop
- **Critério de pronto:** (1) regra de "português correto em página/UI" adicionada ao `~/.claude/CLAUDE.md` global; (2) bloco `bloco-d-acentuacao-textos` (FIX-73) anotado, commitado e pushado; (3) workspace Superset autônomo lançado; (4) branch mergeada na `develop` com gate verde (`pnpm typecheck && pnpm test:unit`), ou quarentenada com `⚠️ PENDENTE-KAIRO`.
- **Status:** EM ANDAMENTO

## Decisões

### D1 · 18:20 — Regra de português correto vai no CLAUDE.md GLOBAL (não no do projeto)
- **Contexto:** Kairo pediu "coloquem isso no nosso cloud global ... sempre que fizer uma página, a página tem que estar com o português correto".
- **Decidi:** adicionar regra inviolável em `~/.claude/CLAUDE.md` (logo após "atrito de FLOW"), escopada a texto PT-BR voltado ao usuário, referenciando a memória `feedback_texto_sem_cara_de_ia`.
- **Alternativas:** colocar só no `CLAUDE.md` do projeto (descartado — ele disse "global", e a maioria dos projetos dele é PT-BR).
- **Reversibilidade:** fácil (edição de texto).
- **Evidência:** `~/.claude/CLAUDE.md` editado.

### D2 · 18:20 — Lançar só o meu bloco (`--block`), não a `--wave 1` inteira
- **Contexto:** já existem 3 blocos em `todo/` (bloco-a funil, bloco-b simulador, bloco-c landing-copy) marcados `onda: 1` mas AINDA NÃO lançados (sem branch remota). `launch-blocks.sh --wave 1` dispararia todos.
- **Decidi:** disparar apenas `bloco-d-acentuacao-textos` via `--block`, deixando a/b/c dormentes (decisão do Kairo lançá-los).
- **Alternativas:** lançar a onda toda (descartado — ele pediu UMA feature; e dispararia trabalho não solicitado).
- **Reversibilidade:** fácil.
- **Evidência:** `superset projects` + `git ls-remote` (sem branches fix/funil|simulador|landing).

### D3 · 18:20 — Overlap esperado com bloco-c (landing) e bloco-a (system-prompt) — Nível 2 mecânico
- **Contexto:** sweep de acentuação encosta em `src/components/landing/*` (bloco-c) e `src/lib/agent/system-prompt.ts` (bloco-a), que estão dormentes em `todo/`.
- **Decidi:** registrar como `conflitos_esperados` no manifesto. Como bloco-d mergeia ANTES (a/b/c nem lançados), quando o Kairo lançar a/b/c eles rebasam sobre o acento já corrigido — conflito mecânico. Bônus: a regra global nova obriga o copy reescrito (bloco-c) a já vir acentuado.
- **Reversibilidade:** N/A (documental).

### D4 · 18:24 — Escopo: prompts do agente + admin UI; landing fica de fora (já limpa); guard como teste-primeiro
- **Contexto:** Explore mapeou que landing/.tsx e metadata JÁ estão acentuadas (guardadas por `copy.test.ts` + `system-prompt.acentuacao.test.ts`). O epicentro é `system-prompt.ts` (~300+), `turn-analyzer.ts`, `insights-prompt.ts`, `mesa-copilot/system-prompt.ts`, `directives.ts` (.ts, NÃO cobertos pelo guard .tsx) + alguns .tsx de admin ("Visao geral", "Conversao"). Os 3 cassettes de `agent-trajectory.test.ts` mostram o agente FALANDO sem acento ao usuário — defeito real.
- **Decidi:** 3 itens num bloco só (1 dev): FIX-73 estende o guard (.ts + blocklist ampliado) como TESTE-PRIMEIRO (vê falhar) → FIX-74 acerta prompts .ts (cirúrgico, só diacrítico) → FIX-75 acerta admin UI/.tsx + templates. Verde = guard + `pnpm typecheck && pnpm test:unit`.
- **Armadilhas registradas no _prompt.md:** (a) NÃO tocar nos 3 cassettes (fixtures de bug); (b) marcadores parseados pelo código (`Nome do usuario:` etc.) só mudam se mudar nos DOIS lados — default = preservar; (c) identificadores (`computeConversaoDimension`) fora de escopo; (d) só diacrítico/ortografia, zero reescrita de sentido.
- **Reversibilidade:** média (system-prompt é core; gate central + quarentena protegem).

### D5 · 18:32 — Poll/merge escopados com `--block` + conserto de atrito na skill
- **Contexto:** `merge-wave.sh poll --wave 1` enxerga os 4 blocos da onda 1; os 3 dormentes (a/b/c, nunca lançados) ficam `pending` eternamente → `all_terminal` nunca true → loop travaria.
- **Decidi:** usar `poll/merge --wave 1 --block bloco-d-acentuacao-textos` (o script suporta `--block`). E consertei o atrito na fonte: adicionei nota no `~/.claude/skills/todo-blocks/SKILL.md` (seção Comandos do modo autônomo) avisando pra escopar `--block` quando se lança subconjunto da onda.
- **Reversibilidade:** fácil.
- **Evidência:** `merge-wave.sh poll --wave 1 --block bloco-d-...` → 1 pending; SKILL.md editado.

## Linha do tempo (resumida)
- 18:20 — Skills todo-blocks + to-saindo carregadas. CLAUDE.md global atualizado (D1). Explore disparado.
- 18:24 — Inventário recebido (epicentro = prompts .ts; landing limpa). Bloco-d desenhado (D4). Escrevendo manifesto/itens/prompt.
- 18:30 — Bloco-d (FIX-73/74/75 + _prompt) commitado e pushado na develop (`980fe627`). Workspace autônomo lançado: `fix-acentuacao-textos-ptbr` (wsId `348cf356-f536-4771-8736-c76604bc824d`, branch `fix/acentuacao-textos-ptbr`). Iniciando poll da tag-sentinela.

## Relatório final (preencher ao encerrar)
- **Resultado vs critério de pronto:** _(pendente)_
- **O que NÃO fiz e por quê:** _(pendente)_
- **Revisar primeiro:** _(pendente)_
- **Próximos passos sugeridos:** _(pendente)_

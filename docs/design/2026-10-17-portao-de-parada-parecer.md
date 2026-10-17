# Portão de parada — fases 1–3 entregues

17/10/2026 · campanha `aja-pi-limpo-local-dev` · worktree `kairogyn/refatoracao-completa-pelo-pi`

## Veredito, em uma linha

**A dor declarada — "mudar como o agente conversa exige engenheiro e deploy" — está
atendida sem trocar o motor.** A conduta que existia em código saiu de lá e agora é
editável na caixa, com efeito em ≤60s. O motor novo (pi) é a fase mais caro do
mandato e não é o que destrava essa dor.

## O que foi entregue, com evidência

| fase | entrega | prova |
|---|---|---|
| 0 | chão limpo: lint e typecheck verdes, hook pontual, sem script órfão | `pnpm lint` (898 arquivos) + `pnpm -s typecheck` exit 0 |
| 0 | workspace novo nasce com o schema certo | template recriado; banco novo a partir dele = **65 migrations, 38 tabelas, 4 personas** |
| 0 | local conversa de verdade, pelo gateway | sonda real: 2 turnos, `finishReason: ok`, `textChars: 128`, **0** erro de LLM |
| 1 | o seam está pinado antes de qualquer troca | **14 testes** (ordem do funil 8, seam 6), cada um com mordida demonstrada |
| 2 | a conduta saiu do código | **5 de 5** blocos de conduta fora de `converse.ts`; 17 de 22 são fato/invariante e ficam |
| 2 | a caixa governa, provado ponta a ponta | turno de fechamento real: o system prompt do modelo carrega `[situação: fechamento]` + a conduta da caixa |
| 2 | editar a caixa não exige deploy | prompt `aja-system-prompt` publicado no Langfuse até a **versão 11** (label `production`) por API |
| 3 | o juiz mede por campo vivo | `PersonaContext` → `displayName`/`category`/`expertise`; teste 3/3, mordida demonstrada |
| 3 | campos mortos: onde estão | grep: **o turno não lê nenhum dos 5**; o painel lê todos (editor de persona por IA) |

Total da campanha: **7 commits**, **31 testes pontuais verdes**, `converse.ts` com
**−67/+47** linhas (as 20 de conduta migradas) e a caixa com **+20** linhas de
orientação.

## O número que importa

Antes: mudar o texto do fechamento, do reveal, do "é sua primeira vez", do canal ou da
retomada pós-fecho exigia **editar `converse.ts` → PR → merge → deploy**.

Agora: são **5 seções da caixa** (`### fechamento`, `### reveal`, `### novato`,
`### canal`, `### retomada-pos-fechamento`), editáveis no Langfuse com **cache de 60s**.
Nenhuma delas é lida do código; o código só entrega o FATO do turno.

## O que NÃO foi provado (honestidade antes de seguir)

1. **O turno de reveal ponta a ponta.** O fechamento foi provado com turno real; o
   reveal, não — o turno de apresentação depende de `liberaHero` no `advance`
   (`pendingRecommendationCard` + sinal de consentimento) e a rota roteirizada não
   chega lá de forma determinística. Está provado por: fato puro + ausência da conduta
   no código + seção na caixa. Não está provado por execução.
2. **O efeito de 60s em produção.** Provado que a caixa é publicada e versionada; o
   efeito em produção depende do app apontando para o Langfuse de produção — não medi.
3. **O deploy no dev (fase 6) e o teste nos dois canais contra o dev** — não começou.

## Duas decisões suas pendentes

**A) Os 5 campos mortos** (`voiceTone`, `examples`, `forbiddenTopics`,
`handoffTriggers`, `activeCampaigns`). O turno não lê nenhum. Mas eles são a espinha do
editor de persona por IA do painel (`propose_patch`, rotas `admin/personas/[id]/*`,
4 seções de UI, colunas no schema). Dropar as colunas **apaga essa feature**. Três
caminhos: (a) deixar como está; (b) aposentar o editor junto com os campos; (c)
re-apontar o editor para a caixa de prompt — o único coerente com a fase 2, e o mais
caro. Detalhe em `docs/design/2026-10-17-campos-mortos-onde-e-por-que.md`.

**B) Seguir ou parar.** A fase 4 (spike do pi em controle total) é a mais cara do
mandato e a que **menos** entrega a dor que motivou a campanha — diagnóstico já
confirmado pelo próprio autor do conceito: o corte certo é a conduta, e ele já foi
feito. As fases 4–6 trocam o motor, entregam durabilidade e integração, e não mudam o
fato de que hoje a conversa é editável sem deploy.

## Recomendação

**Parar depois da fase 3** e levar a decisão de produto (A) para uma rodada própria.
Se o objetivo real for trocar o motor — e não destravar a conduta —, então seguir para
a fase 4 com a régua de durabilidade já decidida (Q1: hoje é `MemorySaver` in-process,
o estado do `interrupt` some no restart do container).
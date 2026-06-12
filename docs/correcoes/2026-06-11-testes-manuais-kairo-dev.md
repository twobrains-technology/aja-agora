# Ata — Testes manuais do Kairo no dev (2026-06-11, pós-deploy da auditoria do dial)

Sessão de anotação (todo-blocks). Kairo testou o funil no dev logo após o
deploy dos fixes do dial (C1-C5 + snapshot anchor) e reportou 4 defeitos por
print. Itens FIX-27..FIX-30, blocos N/O/P (onda 1, todos paralelos).

## Citações e itens

| Citação do Kairo | Item | Bloco |
|---|---|---|
| "nao faz setnio nenhum ter pedido o numero uma vez qo numero foi informado." | FIX-27 — opt-in WhatsApp pede o número pela 3ª vez (lead form e identify já coletaram), input vazio, no meio de fechamento com erro Bevi pendente | bloco-n-optin-redundante |
| "cliquei em quero ver mais opcoes e ele mostrou duplicado." | FIX-28 — comparativo das "outras opções" com 2 cards ÂNCORA idênticos (buildOtherOptions sem dedupe) | bloco-o-outras-opcoes-dedupe |
| "eh muita alucinacao, eu nao estou entendendo de verdade." | FIX-29 — clique "Ajustar valor" dispara fechamento determinístico ("vou reservar... te conectar com nosso consultor" + lead form) | bloco-p-acoes-e-lance-do-card |
| (mesma sessão — números contraditórios no card) | FIX-30 — "COM LANCE EMBUTIDO (74,43%)" rotulando o lance TOTAL necessário + "recebe R$ 80.000" (carta cheia) na mesma tela | bloco-p-acoes-e-lance-do-card |
| "bug msg duplicada nesse cenario." | FIX-31 — handoff ecoa a user message no bus com UUID novo; dedupe por id do provider nunca casa → bolha 2× | bloco-q-handoff-msg-duplicada |
| "qd tento rolar a tela para cima e ele esta conversando, buga tudo... o chat se move sozinho bem qd nao tem usuario querendo scrollar. qd ele quer escrolar deve conseguir" | FIX-32 — auto-scroll força o fundo durante streaming (`\|\| isStreaming`) e confunde posição com intenção do usuário | bloco-r-scroll-inteligente |
| "ele fala que encontrou antes de buscar" (2026-06-12, pós-merge dos PRs #28/#30) | FIX-36 — frases-modelo do prompt/directives instruem "Encontrei opções" ANTES do search_groups completar (visível com o spinner "Buscando grupos") | bloco-t-copy-pre-tool |

## Achado transversal

A percepção de "muita alucinação" veio de defeitos majoritariamente
**determinísticos**: kind único `interest` pra toda action do card (front),
copy fixa com "consultor" no backend, mapper reusando `bidPercentage` pro
embutido, e prompt MANDANDO oferecer opt-in porque o derive não enxerga
telefone já capturado. Nenhum exige mexer no modelo — todos têm fix de
código/prompt com regressão nas 3 camadas.

Derivada pra AGX: pergunta 8 adicionada em `docs/jornada/proposta-simulador.md`
(semântica do `bidPercentage` — embutido máximo × lance necessário).

## Consolidação 2026-06-12 (colisão com sessão paralela)

Uma sessão paralela (Superset) anotou na mesma noite um "bloco-n" com FIX-27/28
próprios (funil canônico pós-reveal + guardrail de carta). Resolução, pela
ordem de commit: os itens dela foram renumerados pra **FIX-33/34** e o bloco
virou **bloco-s-funil-canonico**. O FIX-29 (Ajustar valor) migrou do bloco-p
pro bloco-s — mesma região (`route.ts:401`, handler interest) e mesma decisão
de produto que o FIX-34 ("Tenho interesse" → passo 5 self-service, não lead
legado). O bloco-p ficou só com o FIX-30 e virou bloco-p-lance-do-card. Todos
os manifestos ganharam `branch:`/`workspace:` pra lançamento no Superset;
ordem de merge consolidada: **S → P → N → Q** (O e R disjuntos).

### Lançamento consolidado (decisão do Kairo, 2026-06-12: menos paralelismo)

Os itens fora do bloco S são pequenos — 6 workspaces não se justificam.
Lançamento em **2 sessões**:

1. **`fix/funil-canonico-pos-reveal`** → bloco S (FIX-34 → FIX-29 → FIX-33).
   O único bloco grande, com decisão de produto e cassettes.
2. **`fix/rodada-ux-2026-06`** → blocos Q → R → O → P → N em sequência na
   MESMA branch (FIX-31, 32, 28, 30, 27 — itens pequenos, arquivos disjuntos
   entre si; sequencial elimina os conflitos nível 2 anotados). N por último
   (é o maior dos cinco).

Ordem de merge: S primeiro, depois a rodada-ux resolve os conflitos
mecânicos em `route.ts`/`simulation-result.tsx`/`system-prompt.ts`.
Os manifestos por bloco seguem válidos como spec dos itens.

## Pesquisa de estado da arte (pedido do Kairo na mesma sessão)

Pesquisa web sobre o stack (AI SDK 6 / Next 16, mai-jun 2026) e estratégias
pros problemas da rodada: `2026-06-11-pesquisa-stack-padroes.md`. Itens
FIX-27..32 ganharam seção "Estado da arte" com os achados aplicáveis
(prepareStep/activeTools por slot, data parts tipados com enum Zod,
toModelOutput, id estável fim-a-fim, ai@6.0.202).

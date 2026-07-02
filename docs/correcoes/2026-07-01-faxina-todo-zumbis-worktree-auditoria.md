# Faxina do `todo/` — mata os blocos-zumbi (2026-07-01)

> Pedido do Kairo: *"mata esses todo zumbis por favor"*. Executada no worktree
> `feat/avaliacao-profunda-divergencia` (isolado), **sem tocar em `~/code/aja-agora`**
> onde havia uma sessão irmã viva (commit `e055871f` de 3 min antes, working tree limpo)
> — respeitando a regra de sessões concorrentes (não dois agentes no mesmo working tree).
> A faxina remove/move arquivos; se a sessão irmã fizer o mesmo na develop, a integração
> resolve como *both-deleted* (limpo).

## O que era "zumbi" (card no `todo/` que NÃO representa trabalho pendente real)

Classifiquei cada bloco do `todo/` contra o código atual + `done/` + tags `block-done`.
Antes da faxina o `bloco-funil-turno-orquestracao` (FIX-113/114/115) já havia sido
**integrado** por origin/develop (não era zumbi — foi executado; reconciliado sozinho).

### Deletados — órfãos-duplicata (gêmeo idêntico já em `done/`)

O card em `todo/` era cópia do que já está em `done/` (executado). O `done/` é o registro.

| Bloco removido | Itens | Gêmeo em `done/` |
|---|---|---|
| `bloco-a-funil-coleta-ordem` | FIX-52/53/58 | ✅ os 3 |
| `bloco-b-simulador-recomendacao` | FIX-54/55/56/57 | ✅ os 4 |
| `bloco-c-landing-copy-ui` | FIX-59/60 | ✅ os 2 |
| `bloco-g-groupid-resolucao-robusta` | FIX-72 | ✅ (+ tag `block-done/fix-groupid-resolucao-robusta`) |

### Movido para `done/` — órfão feito no código, SEM gêmeo em `done/`

| Card | Ação | Evidência de que já está feito |
|---|---|---|
| `bloco-b-chat-mesa-whatsapp/FIX-87` | movido p/ `done/`, `status: done`, `commit: 31137987` | endpoint `src/app/api/admin/conversations/[id]/message/route.ts` existe + `<textarea "Digite sua mensagem para o cliente...">` em `lead-detail-panel.tsx`. Commit `31137987 test+fix: auth por sessão e envio pro waId no chat do operador (FIX-87)`. Bloco esvaziou (85/86 já em done) → pasta removida. |

### Deletados — bug-morto (o bug JÁ foi corrigido inline por OUTRO commit; o card nunca executou)

`bloco-e-funil-qualificacao` inteiro (os 5 cards são os mesmos do inbox que a triagem
provou resolvidos):

| Card removido | Resolvido inline por |
|---|---|
| `fix-90-analyzer-infere-prazo` | `e71403d7` (gate de prazo removido no FIX-103) |
| `fix-91-funil-pula-experience-consent` | `b84cd772` |
| `fix-92-lance-embutido-pulado-no-maybe` | `3341629b` (FIX-4 / D10 — educa Sim/Não/Talvez) |
| `fix-93-prompt-ordem-gates-pre-valor` | `ebfd312a` + FIX-103 |
| `fix-94-agente-fallback-refresh` | `3de52ad2` (FIX-52) |

Cirúrgico em `bloco-h-chat-render`:

| Card removido | Resolvido inline por | Fica no bloco |
|---|---|---|
| `fix-101-resume-zindex` | `bae59378` (mesmo bug do inbox `resume-coberto-pelo-theater-zindex`) | **FIX-102** (eco/texto duplicado do assistant) — bug válido, baixa severidade, não resolvido |

## O que FICOU no `todo/` (pendente-válido — NÃO tocado)

- `bloco-a-documentos-cliente` (FIX-82/83/84)
- `bloco-c-fechamento-trilho-b` (FIX-88/89)
- `bloco-f-artifacts-produto` (FIX-95/96)
- `bloco-g-infra-teste` (FIX-97/98/99/100 — dívida de teste real)
- `bloco-h-chat-render` (FIX-102 — sozinho após poda)

## Como a lista de zumbis foi provada

Método: para cada bloco, cruzei os `FIX-NN` do `todo/` com `docs/correcoes/done/`, com as
tags `git tag block-done/*` e com o código real (grep dos artefatos citados nos cards). A
triagem anterior (sessão irmã) provou os 8 cards resolvidos do inbox com os commits acima;
os blocos-zumbi do `todo/` são o reflexo desses mesmos bugs mortos que nunca saíram do `todo/`.

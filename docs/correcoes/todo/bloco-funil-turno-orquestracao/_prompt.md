Você é o executor do bloco `bloco-funil-turno-orquestracao` no worktree isolado deste branch (`fix/funil-turno-orquestracao`).

## Contexto
3 bugs REAIS que o Kairo achou testando em **PRODUÇÃO (AWS prod)** logo após o último release. Todos na camada de **funil/gate/turno** do chat, com **root cause já evidenciado** (log de prod + inspeção de código). NÃO improvise causa — siga a evidência dos fix-NN.

## Passos

1. **Leia primeiro:**
   - `docs/correcoes/README.md` (regras do fluxo).
   - `docs/correcoes/todo/bloco-funil-turno-orquestracao/_bloco.md` (root cause unificado + ordem) e os 3 `fix-NN-*.md` (cada um com cenário, root cause investigado, correção, regressão). Prints em `_evidencia/`.
   - `CLAUDE.md` do projeto — seções **"Regressão de agent — 3 camadas OBRIGATÓRIAS"** e **"Regra de TDD pra bugs — STRICT"**. Os 3 tocam comportamento de agente/turno → exigem Camada 1 (structural) + Camada 2 (cassette em `tests/regression/agent-trajectory.test.ts`).

2. **NÃO é design novo — é bug-fix com causa provada.** Pule brainstorming. Confirme cada root cause no código (os fix-NN apontam o arquivo/linha exatos) e conserte.

3. **TDD STRICT, na ordem `itens:` (FIX-113 → FIX-115 → FIX-114):** teste de regressão PRIMEIRO, veja FALHAR com a assinatura certa, então conserte, veja passar.
   - **FIX-113 (trava):** `isTurnEmpty` (`empty-turn-guard.ts`) deve considerar SÓ emissão VISÍVEL (`textChars/toolCount/artifactCount`), IGNORANDO `gate`/`transitionedTo` (são estado interno). Structural: `isTurnEmpty({textChars:0,toolCount:0,artifactCount:0,gate:"value",transitionedTo:null})` = **true** (hoje false → veja falhar). Cassette: "ta bom"/"blz" numa continuidade NÃO fecha o turno mudo. E garanta que avançar um gate SEMPRE emite a UI/pergunta do gate. ⚠️ Não dispare fallback quando um gate legítimo já emitiu artifact (artifactCount>0).
   - **FIX-115 (componente de valor + RESILIÊNCIA — requisito literal do Kairo):** o componente de valor (agulha) DEVE renderizar no passo do valor; **E** se ele não renderizar, o valor por TEXTO ("50k") tem que ser parseado e **AVANÇAR o funil mesmo assim — nunca travar nem dead-end**. Os dois lados, não escolha um. Cassette: valor por texto avança o funil.
   - **FIX-114 (search antes de identidade):** o log de prod prova `IdentityNotCollectedError` — `search_groups` disparou sem CPF coletado. Gateie a tool `search_groups` na identidade (não ativar/oferecer antes de CPF+celular coletados) e/ou dispare o gate de identidade quando faltar, em vez de cuspir "dificuldade técnica". Mate a meta-narrativa ("deixa eu buscar / preciso buscar os grupos / usar a ferramenta certa") — 1 frase natural ou nenhuma. NÃO é Duplicated Hash (já tratado — não mexa nisso). Structural: tool-policy sem `search_groups` sem identidade; cassette: lance sem identidade → não chama search cru.
   - ⚠️ NÃO afrouxe/gamear teste. Teste falha ANTES do fix. Nada de `.only`/`skip`/`as any`/`@ts-ignore` mascarando.

4. **Gate antes de cada commit:** `pnpm test:unit` verde + os cassettes em `tests/regression`. Se o pre-commit reclamar de eval (Camada 3) por credencial/flakiness, isso é nightly — mantenha Camadas 1+2 verdes.

5. **1 commit Conventional (PT-BR) por item:** `test+fix: <descrição> (FIX-NN)`.

6. **Ao concluir cada item:** mova o `fix-NN-*.md` pra `docs/correcoes/done/` (`status: done` + `commit: <hash>` + `executado_em: 2026-06-30`) — best-effort (o orquestrador reconcilia). Pasta vazia → apague.

7. **Ao terminar TUDO:** `git push origin fix/funil-turno-orquestracao` + gere `.done/2026-06-30-funil-turno-orquestracao.md` (resumo de negócio + decisões + testes + gaps honestos). **NÃO abra PR, NÃO faça merge, NÃO rode deploy/restart.** A integração é do orquestrador.

8. **RESUMO FINAL:** decisões de design tomadas ("decidi X em vez de Y porque Z" por linha) + o que de root cause você CONFIRMOU. Se algum bug não reproduziu no código, diga explicitamente — não invente fix.

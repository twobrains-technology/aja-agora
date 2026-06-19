# Away — Transformar jornada2_revisão.docx em blocos de correção (todo-blocks) e lançar a onda no Superset

- **Início:** 2026-06-19 00:37 · **Sessão:** aja-agora/develop
- **Critério de pronto:** feedbacks do docx mapeados ao código real → itens `fix-NN` (FIX-52+) escritos com root cause investigado → agrupados em ~3 blocos paralelizáveis disjuntos (`docs/correcoes/todo/`) com `_bloco.md` + `_prompt.md` implement-and-push → onda lançada via `launch-blocks.sh --wave 1` (workspaces Superset criados + abertos). Anotação commitada (`docs:`).
- **Status:** COMPLETO

## Origem
`/Users/kairo/Downloads/jornada2_revisão.docx` — revisão 2 da jornada, feedbacks de teste manual do stakeholder (Bernardo) rodando o produto em ajaagora.com.br. 8 screenshots + comentários. Texto extraído em /tmp/jornada2.txt, imagens em /tmp/jornada2_imgs/.

## Feedbacks levantados (do docx)
Bugs do agente:
1. Pedir os DADOS antes do VALOR (hoje pede valor antes).
2. "Voltou a pedir o valor" — repete pedido já respondido.
3. CPF+telefone na mesma linha → card de completar dados NÃO aparece (pedir separado). [image4: agente cai em loop "atualiza a página" + meta-narrativa "não consigo disparar o formulário" — viola regra anti-solução-manual]
Simulador:
4. Carro indo só até 300k (teto hardcoded por categoria).
5. Simulador não sensível a números quebrados.
Recomendação:
6. Aparecem 2 grupos da mesma administradora (falta dedup).
7. Lógica meses×lance (deveria aumentar meses e reduzir lance).
8. "Ficou inconclusivo o que faz depois" — falta CTA/próximo passo.
Decisões Bernardo:
9. Mover simulador de contemplação pra ANTES da indicação do melhor grupo (aval dado no docx).
10. Antes de avançar, confirmar premissas: "faz sentido esse valor? essa qtd de meses? quer simular algo diferente?"
Copy geral (landing):
- Excluir "sem cadastro"; "o mercado inteiro"→"as melhores administradoras"; trocar "Acompanhamos…" e "Seguimos juntos" por textos novos; excluir "Consórcio Bevi · Grupo 1042"; "Estratégica"→"Alinhada/Convergente"; ampliar "Quem somos" (2 frases novas); figura mais brasileira; ícone WhatsApp mobile.

## Decisões

### D1 · 00:37 — Particionamento em 3 blocos (não 9 micro-workspaces)
- **Contexto:** 9 itens (FIX-52..60). Régua do Kairo: bloco = pacote de 1 dev, alvo ~3 sessões/onda; nunca 1 item por workspace.
- **Decidi:** 3 blocos por afinidade de código — (A) agente/fluxo do funil [coleta de dados, ordem, reposicionamento]; (B) simulador + recomendação de grupos; (C) copy + UI da landing. Disjunção real confirmada via Explores antes de fechar.
- **Alternativas:** 5 blocos por feature (reprovado: fragmenta demais); 1 bloco gigante (reprovado: nada paraleliza, anotação preguiçosa).
- **Reversibilidade:** fácil (só anotação em docs/, nada de código ainda).
- **Evidência:** a preencher com paths reais dos Explores.

### ⚠️ PENDENTE-KAIRO · 00:37 — FIX-58: redesenho do simulador de contemplação
- **O que é:** mover o simulador pra antes da indicação é mudança de FLUXO já avalizada pelo Bernardo no docx → vai no bloco. MAS a regra de produto (CLAUDE.md) diz "não implementar versão final do simulador sem aval do Bernardo" (proposta-simulador.md).
- **Por que não fiz:** o reposicionamento (ordem dos artifacts) entra; qualquer REDESENHO do simulador (novos campos, nova fórmula, novo visual) NÃO — é decisão de produto do Bernardo.
- **Como destrava:** Kairo/Bernardo confirmam se querem só reposicionar (escopo do bloco) ou redesenhar (fora do escopo, vira item próprio com aval).

### D2 · 00:55 — "Meses × lance" não é bug → vira clareza de copy
- **Contexto:** feedback "deveria aumentar meses e reduzir lance" parecia bug.
- **Decidi:** NÃO mexer no cálculo — `contemplation-dial.ts` já implementa a mecânica inversa correta (Explore confirmou). Tratar como microcopy de clareza dentro do FIX-57.
- **Reversibilidade:** fácil.
- **Evidência:** Explore simulador, `src/lib/consorcio/contemplation-dial.ts:66-129`.

### D3 · 00:55 — FIX-58 (reposicionamento) fundido no Bloco A, não bloco próprio
- **Contexto:** reposicionar o simulador toca a ordem do fluxo (system-prompt/orchestrator) — mesma região do Bloco A. Bloco próprio criaria overlap pesado em system-prompt com A.
- **Decidi:** FIX-58 vai no Bloco A; o componente do simulador (Bloco B) não é tocado por ele (só a ordem). Escopo limitado a reposicionar + confirmar premissas; redesenho fica fora (PENDENTE-KAIRO).
- **Reversibilidade:** fácil (anotação).

## Partição final (FIX-52..60, 9 itens, 3 blocos onda 1)
- **Bloco A** (fix/funil-coleta-ordem): FIX-52, 53, 58 — system-prompt, qualify-state, ai-sdk tools, artifact-guard, contact-capture, jornada docs.
- **Bloco B** (fix/simulador-recomendacao): FIX-54, 55, 56, 57 — qualify-config, pickers, recommendation, simulation-result.
- **Bloco C** (fix/landing-copy-ui): FIX-59, 60 — landing components + whatsapp-optin + asset hero.
- A×B nível 2 (ai-sdk.ts regiões diferentes + cassettes append-only) → mergear A antes. A×C, B×C nível 1.

## Linha do tempo
- 00:30 — docx convertido, 8 imagens extraídas, feedbacks mapeados.
- 00:37 — 3 Explores lançados. Diário criado.
- 00:55 — 3 Explores concluídos com arquivo:linha. 9 fix-NN + 3 _bloco.md + 3 _prompt.md + ata escritos. Partição fechada.

### D4 · 03:51 — Lançar só os 3 blocos da jornada2 via --block (pular bloco-pnpm)
- **Contexto:** dry-run mostrou que `--wave 1` dispararia 4 workspaces, incluindo `bloco-pnpm` (pré-existente, não é desta rodada; a migração pnpm já consta nos commits recentes da develop).
- **Decidi:** lançar via `--block` os 3 blocos da jornada2; deixar `bloco-pnpm` intocado (fora de escopo, não mexer em bloco de outra rodada em modo autônomo).
- **Reversibilidade:** fácil.
- **Evidência:** dry-run + commits "build: migra aja-agora pra pnpm".

## Relatório final
- **Resultado vs critério de pronto:** ✅ ATINGIDO. 9 itens (FIX-52..60) escritos com root cause investigado nos Explores (arquivo:linha), agrupados em 3 blocos disjuntos com `_bloco.md` + `_prompt.md` implement-and-push. Anotação commitada+pushada (`cdd6d14` em origin/develop). Onda 1 lançada: 3 workspaces Superset criados, agentes Claude disparados (ok:true) e abertos na sidebar:
  - bloco-a-funil-coleta-ordem → ws 982341c7 (branch fix/funil-coleta-ordem)
  - bloco-b-simulador-recomendacao → ws 835cdadc (branch fix/simulador-recomendacao)
  - bloco-c-landing-copy-ui → ws 88b097db (branch fix/landing-copy-ui)
  Cada agente vai implementar + push da branch + criar reminder de revisão (NÃO abre PR/merge — você revisa e mergeia).
- **O que NÃO fiz e por quê:**
  - Não mergeei nem abri PR (linha vermelha do fluxo — é sua decisão via reminders).
  - Não disparei o `bloco-pnpm` (fora de escopo; parece já concluído nos commits — vale mover pra done/ ou apagar do todo/ numa limpeza futura).
  - Não corrigi o bug do `launch-blocks.sh` (o `open` recebe o JSON do create em vez do id — contornei abrindo os 3 manualmente). Fora de escopo; mexer em tooling global autônomo é arriscado. Recomendo corrigir o parsing do id no script.
  - Não gerei a figura "mais brasileira" do hero nem decidi a interpretação de "ícone WA móvel" — deixei como decisão do executor (gerar candidata) + validação visual sua (FIX-60).
- **Revisar primeiro:**
  1. **D3 + FIX-58** — reposicionar o simulador antes da indicação toca a jornada canônica (regra de produto). Tem aval do Bernardo no docx pro reposicionamento; redesenho ficou fora de escopo. Confirme se é só isso que ele quer.
  2. **FIX-53** — mudar "dados antes do valor" altera a ordem da jornada canônica; o executor vai atualizar o docx da jornada. Confira se a nova ordem bate com a visão.
  3. **Ordem de merge A→B** (overlap nível 2 em ai-sdk.ts/cassettes) — mergeie A antes de B.
- **Próximos passos sugeridos:**
  - Acompanhar os 3 agentes na sidebar do Superset; revisar+mergear pelos reminders que cada um cria.
  - Limpeza: resolver o `bloco-pnpm` órfão no todo/.
  - Onda 2 (se houver) só após merge da onda 1.

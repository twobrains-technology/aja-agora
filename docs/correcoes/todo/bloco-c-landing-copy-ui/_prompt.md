Você é o executor do bloco **bloco-c-landing-copy-ui** no worktree isolado deste branch (`fix/landing-copy-ui`). Trabalha SOZINHO, sem o Kairo para responder: NÃO faça perguntas, NÃO espere aprovação — você É o decisor (best practice + padrões do repo).

## Contexto
Ajustes de copy e identidade visual da landing, vindos dos "Comentários Gerais" da revisão 2 da jornada (`jornada2_revisão.docx`, stakeholder Bernardo).

## Passos
1. Leia `docs/correcoes/README.md` e a pasta `docs/correcoes/todo/bloco-c-landing-copy-ui/` inteira: `_bloco.md` + `fix-59` (lote de copy, com tabela arquivo:linha) + `fix-60` (figura do hero + ícone WhatsApp). Leia `CLAUDE.md` (design system shadcn/studio Pro, regra de copy sem overclaim de IA).

2. DESIGN: a maior parte de FIX-59 é troca direta de copy (sem brainstorming). FIX-60 tem decisão real (qual figura "mais brasileira"; interpretação de "ícone WA móvel"). Para esses, use o raciocínio de `superpowers:brainstorming` e DECIDA sozinho. Registre em `docs/correcoes/decisions/2026-06-19-bloco-c-landing.md`. Commit `docs:`.

3. Execute NA ORDEM: **FIX-59 (copy) → FIX-60 (assets/ícone)**.
   - FIX-59: aplique as trocas exatas da tabela do fix (hero.tsx, trust.tsx, process.tsx, demo.tsx, institutional.tsx, brand-footer.tsx). Mantenha o tom da marca.
   - FIX-60: troque a referência da figura do hero por um asset "mais brasileiro" (pode gerar candidata via skill `open-design-gen`/GPT Image salvando em `public/brand/`; se gerar, deixe claro no `.done/` que é PROPOSTA e aguarda validação visual do Kairo/Bernardo). Troque o ícone `MessageSquare` em `whatsapp-optin.tsx` pelo logo do WhatsApp (SVG de marca), validando no mobile.

4. Regressão:
   - **Atualize/expanda `src/components/landing/copy.test.ts`** (Camada 1): assertar ausência de "sem cadastro", "mercado inteiro", "Consórcio Bevi · Grupo 1042", "Estratégica"; presença dos textos novos-chave (privacidade/CPF; "melhor plano… não o que paga mais comissão"). NÃO quebrar as regras existentes (sem overclaim de IA, termos educativos ancorados).
   - FIX-60: teste de componente de `whatsapp-optin.tsx` (ícone do WhatsApp renderizado, não `MessageSquare`); garantir que `hero.tsx` aponta para asset existente em `public/brand/` (build/Image não quebra).

5. Rode o lint/typecheck do projeto (Biome) e a suíte de testes da landing antes de fechar.

6. 1 commit Conventional (PT-BR) por item (`fix:`/`test+fix:`/`feat:` conforme o caso).

7. Ao terminar: **push da branch** (`git push origin fix/landing-copy-ui`) + gere `.done/{data}-bloco-c-landing-copy-ui.md` (resumo + decisões + o que ficou como proposta visual aguardando validação) + **crie reminder de revisão**:
   `osascript -l JavaScript /Users/kairo/.superset/projects/organizacao-produtiva/scripts/reminders.js add "[Aja Agora] Revisar+mergear bloco-c-landing-copy-ui: copy da landing + figura brasileira + ícone WhatsApp — branch fix/landing-copy-ui no aja-agora, copy.test verde — validar diff (e figura proposta) e decidir merge"`

8. **PROIBIDO**: PR, merge, deploy/restart, `--no-verify`. Sua linha vermelha é só push da branch.

9. RESUMO FINAL: liste as decisões que tomou (figura escolhida, interpretação do ícone WA) para o Kairo revisar de relance.

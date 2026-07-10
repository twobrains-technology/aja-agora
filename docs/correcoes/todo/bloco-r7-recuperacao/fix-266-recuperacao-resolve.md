---
id: FIX-266
titulo: "Recuperação é enlatada/lenta — pede 'me diz o nome' logo após o usuário ter dito o nome"
status: todo
bloco: bloco-r7-recuperacao
arquivos: [src/lib/agent/orchestrator/runner.ts, src/lib/agent/orchestrator/choose-offer.ts]
rodada: 2026-07-10 rodada 7 (Fable r6, o que segura o 7)
---
## Gap (veredito r6 — "o que segura o 7")
Turnos contidos (tool-error/recuperação) levam 72-112s até um fallback ENLATADO que pede "me diz o
nome" logo depois de o usuário JÁ TER dito o nome — e repete idêntico 2×. É contenção sem resolução.
## Correção
- No caminho de RECUPERAÇÃO (tool-error/fallback), rodar o resolver de menção (FIX-264) sobre a
  mensagem do usuário ANTES de cair no fallback enlatado — se o usuário nomeou uma administradora/
  valor exibido, RESOLVER (não pedir de novo). Transforma contenção em resolução.
- Fallback nunca repetir a MESMA frase 2×; se persiste, oferecer opção concreta (lista da tabela).
## Regressão (TDD)
- tool-error + usuário nomeou marca exibida → resolve (não pede "me diz o nome").
- fallback não repete idêntico.

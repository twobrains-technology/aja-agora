Você é o executor do bloco `bloco-r10-1-web-reengage` no worktree isolado deste branch
(`fix/r10-1-web-reengage`), projeto aja-agora.

1. Leia `docs/correcoes/README.md` e `docs/correcoes/todo/bloco-r10-1-web-reengage/` inteiro
   (`_bloco.md` + `fix-302-*.md`).

2. DESIGN: root cause e correção já fechadas no fix-card. A única decisão real é COMO o cliente
   web recebe a mensagem de reengajamento persistida (poll leve vs. reaproveitar o mecanismo de
   `/api/chat/resume`) — use `AskUserQuestion` se houver trade-off genuíno de implementação; sem
   resposta em tempo razoável, escolha o caminho que reusa mais infra existente. Registre em
   `docs/decisoes/blocos/2026-07-12-bloco-r10-1-web-reengage.md`.

3. Execute o item. TDD strict (é lógica de negócio — quando/como reengajar):
   - Teste de integração: gate pendente + 90s sem resposta no canal WEB → mensagem de
     reengajamento é persistida e fica disponível pro cliente sem reload manual.
   - Teste de integração: comportamento do canal WhatsApp NÃO regride (continua via `fireGate`).
   - Teste da escada completa (4 tentativas: pergunta direta → incentivo → reforço → oferta de
     especialista) reproduzida no canal web.
   Rode só os testes dos arquivos tocados. 🚫 Sem smoke de browser neste bloco.

4. 1 commit Conventional (PT-BR).

5. Mova o fix-NN concluído pra `docs/correcoes/done/`.

6. Push da branch (`git push origin fix/r10-1-web-reengage`) +
   `.done/{data}-bloco-r10-1-web-reengage.md`. NÃO abra PR, NÃO faça merge, NÃO rode
   deploy/restart.

7. RESUMO FINAL: decisão de entrega escolhida (poll vs resume) e por quê.

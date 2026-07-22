---
slug: resume-nao-reconhece-etapa-mesa
titulo: "Resume ('Voltei') deve reconhecer que a proposta já foi finalizada/está na mesa, não voltar a perguntar sobre etapa anterior"
status: inbox
severidade: alta
projeto: aja-agora
rodada: 2026-07-22 — Kairo testando manualmente o retorno de conversa (botão "Voltei")
evidencia:
  - _evidencia/2026-07-22-resume-nao-reconhece-etapa-mesa.png
mexe_em:
  - src/components/chat/theater/theater-chat.tsx (fluxo de resume/retomada)
  - src/components/chat/message-list.tsx (renderiza o prompt "Você voltou — continue de onde parou")
  - src/lib/chat/ui-message.ts (tipos/estado usados no resume)
---

## Palavras do operador
> "qd volto para uma proposta ja finalizada o agente entende que eu estava num passo anterior e parece nem saber que eu fechei um plano. O comportamento do agente aqui nesse caso deve ser, olha se o plano já está tem que ver a etapa que ele tá né nesse caso é que ele ta na mesa lá então se ele ta numa mesa ele deve ele deve notificar assim: 'Olha você está aqui, já recebemos... Que bom que você voltou cara! Já recebendo a sua proposta. Daqui a pouco o atendente fala com você no WhatsApp pedindo seus documentos.' Enfim dá uma explicação pra ele de que o atendimento vai seguir, entendeu? Vai ter uma pessoa que vai falar com ele em seguida. Então você precisa tranquilizar o usuário nesse caso aí e sempre orientar ele a ir para o WhatsApp para ele conversar lá, para ficar mais dinâmico o fluxo. Aí lá o pessoal vai atender."

## Cenário
- **Rota/tela:** Chat web do Aja Agora, consórcio Itaú.
- **Passos:** 1) Cliente finaliza a proposta — tela mostra "Parabéns! Agora você está oficialmente mais perto da sua conquista!" + card "O próximo passo é com a gente" (atendente vai chamar via WhatsApp pra adesão/documentos) 2) Cliente sai e volta depois (fecha e reabre, ou nova sessão) 3) Aparece o divisor "Você voltou — continue de onde parou" 4) Cliente clica em "Voltei".
- **Dados usados:** Proposta já com etapa avançada para "mesa" (pós-fechamento, aguardando atendente humano no WhatsApp).

## Esperado × Atual
- **Esperado:** Ao reconhecer que a proposta está na etapa "mesa" (já fechada, aguardando atendimento humano), o agente deve dar boas-vindas reconhecendo esse estado: algo como "Que bom que você voltou! Já recebemos sua proposta — daqui a pouco um atendente fala com você no WhatsApp pra pedir os documentos", tranquilizando o cliente de que o atendimento vai seguir com uma pessoa, e reforçando o direcionamento pro WhatsApp (mais dinâmico que continuar ali no web).
- **Atual:** O agente responde como se o cliente ainda estivesse numa etapa anterior, decidindo entre cenários de contemplação: "Beleza, Kairo! A gente tava vendo os cenários de contemplação pra esse consórcio da Itaú. Você decidiu qual caminho quer seguir — com lance ou só sorteio mesmo?" — ignorando completamente que a proposta já foi fechada e está na mesa aguardando atendente.

## Pista de causa (A CONFIRMAR — não investigado a fundo)
Suspeita: a lógica de resume (`theater-chat.tsx` / `message-list.tsx`) reconstrói o contexto a partir do histórico de mensagens ou de um estado de "última etapa ativa" que não está olhando pro estágio real do lead/proposta (ex.: campo de stage tipo "mesa"/"fechado" no lead — mencionado em outros cards do inbox sobre pipeline/stage). Pode estar pegando a penúltima pergunta feita pelo agente antes do fechamento, em vez de checar se já existe proposta/contrato fechado e em qual etapa do funil o lead está agora. Precisa confirmar: onde o resume busca "o que estava acontecendo" (mensagens vs. stage real do lead) e ajustar a saudação de retomada pra ramificar por stage (mesa/pós-fechamento vs. em qualificação).

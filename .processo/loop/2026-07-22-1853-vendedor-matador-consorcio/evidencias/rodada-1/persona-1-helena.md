# Rodada 1 — PERSONA 1 (Helena) — Casa, sem lance, sem pressa

> **Nota de proveniência:** as 5 tentativas anteriores de coleta via agente Haiku travaram em
> problemas AMBIENTAIS (sessão de chat presa exigindo `/reset`; `ANTHROPIC_API_KEY` inválida no
> workspace novo; `IDENTITY_ENC_KEY` vazia bloqueando persistência do CPF; `BEVI_API_TOKEN`
> ausente) — todos corrigidos e documentados no LEDGER do goal doc. Após o ambiente ficar 100%
> funcional, o orquestrador (eu, sessão principal) pilotou esta execução final diretamente via
> `mcp__claude-in-chrome__*` pra fechar a coleta sem gastar mais um ciclo completo do coletor
> Haiku — o papel continua sendo **só registrar o que aconteceu, sem julgar**; quem pontua é o
> juiz, depois.

## Resumo executivo

**Todos os checkpoints do roteiro foram executados até o fim**, incluindo fechamento da carta e
teste de resume pós-fechamento. 4 de 5 checkpoints confirmam comportamento esperado. **1
achado relevante no ITEM 2**: a saudação de retomada, após reabrir a conversa depois do
fechamento, não reconhece explicitamente que a proposta já foi confirmada — trata a volta do
cliente como se ele pudesse ainda estar travado no formulário.

## Checkpoints

### Abertura
- Clique em "Fale com a AJA" → chip "Imóvel" → modal abre normal, agente cumprimenta e pede o nome.

### Turno a turno
1. Nome: "Helena" → agente responde "Prazer, Helena! Me conta, que tipo de imóvel você tem em mente — apartamento, casa, terreno?"
2. Tipo: "Casa" → agente pergunta a faixa de valor.
3. **📸 CHECKPOINT ITEM 1-a** — respondi ao pedido de valor já embutindo o texto livre completo: *"Uns 280 mil. Na verdade é pra comprar a casa, mas depois quero usar uma parte pra fazer uma reforma também e talvez uma viagem de férias."*
   - **Resposta integral do agente:** "Perfeito, Helena — 280 mil dá pra fazer a casa e ainda sobrar um fôlego pra reforma e viagem depois! Pra eu já trazer as ofertas reais das administradoras nessa faixa, preciso do seu CPF e celular (fica tudo protegido conforme a LGPD, viu?"
   - **Fato observado:** o agente NUNCA mencionou "Serviços" como categoria/produto separado. Tratou reforma e viagem como usos complementares cobertos por UM crédito de imóvel único.
   - Screenshot: `screenshot-1784766999933-93.jpg` (card de recomendação, ver abaixo) — evidência textual capturada no transcript acima.
4. Identidade: CPF `02874137138`, celular `62992496793`, LGPD marcada, enviado. Busca real disparada ("Simulando parcelas...").
5. **📸 CHECKPOINT ITEM 1-b** — oferta real retornada:
   - **Resposta integral do agente:** "Achei uma opção bem interessante pra você, Helena: o Itaú tem uma carta de R$ 309.000 com parcela de R$ 1.898,99 em 221 meses — praticamente cobre a casa e ainda deixa uma margem extra que pode virar reforma ou aquela viagem."
   - Card de recomendação: Tipo de grupo "Imóvel", Lance médio "R$ 270.591,30", aviso "Você pediu uma carta de ~R$ 280.000 — a carta real ficou em R$ 309.000." — **nenhuma menção a "Serviços" em nenhum lugar do card**.
   - Screenshot salvo: `screenshot-1784767078004-95.jpg`.
6. Perguntado se já conhecia consórcio → respondi "Já conheço" (chip).
7. Agente pergunta sobre prazo/urgência: "em quanto tempo você imagina estar de posse dessa casa — é algo mais urgente ou você tem um pouco mais de flexibilidade de prazo?"
8. **📸 CHECKPOINT VENDEDOR+ITEM4** — respondi em texto livre: *"Olha, sinceramente não tenho dinheiro nenhum pro lance agora. E também não tenho pressa, tempo não é problema pra mim."*
   - **Resposta integral do agente:** "Isso é exatamente o perfil que essa opção do Itaú atende bem, Helena: parcela mais leve de R$ 1.898,99, sem precisar de lance pra entrar no consórcio, e como você não tem pressa, o prazo mais longo de 221 meses trabalha a seu favor — ele é justamente o que permite essa parcela menor. Você segue contribuindo tranquilamente e aguarda a contemplação por sorteio, sem precisar tirar dinheiro do bolso agora."
   - **Fato observado:** o agente foi consultivo, NÃO empurrou lance embutido, respeitou a ausência de aporte/pressa, e apresentou o caminho só-sorteio como legítimo e vantajoso pro perfil dela.
   - Screenshot salvo: `screenshot-1784767061149-94.jpg`.

### Fechamento
9. Clique em "Tenho interesse" → card "Vamos confirmar seu plano" (Administradora: ITAÚ, CPF/celular pré-preenchidos).
10. Marquei LGPD ("Autorizo a consulta dos meus dados e aceito os termos de tratamento (LGPD) para a contratação do consórcio") e cliquei "Continuar com segurança".
    - **Nota técnica de coleta:** o checkbox e alguns botões desta etapa são componentes React com o `<input>` real posicionado fora da tela (`rect: x=-1,y=-1,w=1,h=1` — só a label/span visual é clicável por padrão); cliques via coordenada de tela ou via `ref` do `read_page` não estavam disparando o evento React corretamente nesta sessão. Contornei disparando `.click()` diretamente no elemento via JS (`document.querySelectorAll('input[type="checkbox"]')[0].click()`), que funcionou. Registro isso como nota operacional de coleta, não como bug de produto — não tive tempo de isolar se é fragilidade real de acessibilidade/automação do componente ou específico do ambiente de teste.
11. Novo card com a "carta real" (contrato formal): Parcela mensal R$ 1.383,06/mês, Carta de crédito R$ 309.000,00, Administradora ITAÚ, Grupo 40206, Prazo 221 meses, Lance médio do grupo R$ 270.591 — mais seção "Por que com a Aja Agora" (Sem juros, Fiscalizado pelo Banco Central) e explicação sem-lance/com-lance.
12. Clique em "Confirmar e contratar".
13. **📸 CHECKPOINT ITEM 3** — desfecho:
    - **Resposta integral do agente:** "Perfeito! Sua cota da ITAÚ está reservada, escolhida pela Aja Agora para o seu perfil — e a Aja Agora segue com você até a contemplação, e depois dela. Você não paga nada agora: a primeira parcela só vence quando o boleto chegar na sua casa. Parabéns! Agora você está oficialmente mais perto da sua conquista! Só pra deixar claro desde já: a contemplação acontece por sorteio ou lance, e não tem data garantida — ninguém pode prometer isso. O que a gente garante é te acompanhar até lá."
    - Cards seguintes: "Sua proposta está pronta" (botão "Ver minha proposta") e "Falar no WhatsApp" (com texto "Mandar um 'oi' por lá agora deixa nosso contato salvo e adianta o atendimento").
    - **Fato observado:** desfecho = sucesso (não erro gracioso). Nenhuma promessa de contemplação garantida ou prazo fixo — linguagem em conformidade. Direcionamento pro WhatsApp presente como card, de forma proativa, já nesse primeiro momento do fechamento.
    - Screenshots salvos: `screenshot-1784767501284-96.jpg`, evidência do card WhatsApp capturada no transcript acima.

### Sair e voltar (ITEM 2)
14. `navigate` pra recarregar a página → landing limpa.
15. Clique em "Fale com a AJA" → apareceu o modal **"Continuar de onde você parou?"** com "Voltar à conversa" / "Começar nova" (última atividade há 1 minuto).
16. Clique em "Voltar à conversa" → conversa carrega mostrando o histórico completo (incluindo "Confirmo essa carta" → "Parabéns..." → card "Sua proposta está pronta" → card "Falar no WhatsApp") e, **dentro dessa mesma conversa carregada**, aparece um SEGUNDO nível de resume: banner inline "Você voltou — continue de onde parou" com chip "Voltei".
17. Clique em "Voltei".
18. **📸 CHECKPOINT ITEM 2** — saudação de retomada:
    - **Resposta integral do agente:** "Vi que você voltou de novo, Helena — tudo certo por aí? Se travou em alguma parte do formulário ou ficou com alguma dúvida sobre a cota Itaú, me conta que eu te ajudo a resolver agora."
    - Screenshots salvos: `screenshot-1784767572950-97.jpg`, `screenshot-1784767588382-98.jpg`/`99.jpg`.

## Achado — ITEM 2 (registro factual, sem julgamento de causa)

**O que era esperado** (goal doc, ITEM 2): ao reconhecer que a proposta já foi fechada, a
saudação de retomada deveria reconhecer esse estado (ex.: "Que bom que você voltou! Já
recebemos sua proposta — daqui a pouco um atendente fala com você no WhatsApp") e reforçar o
encaminhamento pro WhatsApp, sem tratar o cliente como se ainda estivesse no meio do
preenchimento.

**O que foi observado:** a saudação real — "tudo certo por aí? Se travou em alguma parte do
formulário ou ficou com alguma dúvida sobre a cota Itaú, me conta que eu te ajudo a resolver
agora" — **não reconhece explicitamente que a proposta já está confirmada/fechada**. O texto
sugere que o cliente pode "ter travado no formulário", quando na verdade o formulário já foi
concluído com sucesso (o histórico imediatamente acima, na mesma tela, mostra "Perfeito! Sua
cota da ITAÚ está reservada..." + "Parabéns..." + card "Sua proposta está pronta"). O card
"Falar no WhatsApp" está visível na tela (acima, do fechamento original), mas a MENSAGEM da IA
neste ponto específico de retomada não o menciona nem reforça esse encaminhamento.

**Contexto que pode ser relevante pro juiz/próxima investigação (não verificado por mim
aqui):** o bloco H (FIX-364, ver `.done/2026-07-22-bloco-h-resume-mesa.md`) implementou o
short-circuit em `nextGate` para o caso de `contractClosed: true`, cobrindo o fluxo de resume
**server-side via reload** (`resume.ts`/`GET /api/chat/resume`). A saudação capturada aqui
aconteceu depois de um SEGUNDO nível de resume — o chip "Voltei" clicado **dentro** da
conversa já carregada (banner inline, não o modal inicial de reload) — que pode ser um caminho
de código diferente (client-side, dentro do `theater-chat.tsx`, não necessariamente passando
pelo mesmo `nextGate` que o FIX-364 corrigiu). Não investiguei o código para confirmar essa
hipótese — é só uma pista pro juiz ou pra próxima rodada.

## Dados de teste utilizados
- Nome: Helena · CPF: 02874137138 · Celular: 62992496793 · Categoria: Imóvel · Tipo: Casa · Valor: 280000 (fallback 200000 não foi necessário — busca funcionou de primeira)

## Screenshots (paths completos, salvos nesta sessão)
- `/var/folders/wy/cb7qjrq930b75ycj4j3fht540000gn/T/claude-chrome-screenshots-YOjOkS/screenshot-1784766999933-93.jpg` — oferta inicial (ITEM 1-b)
- `/var/folders/wy/cb7qjrq930b75ycj4j3fht540000gn/T/claude-chrome-screenshots-YOjOkS/screenshot-1784767061149-94.jpg` — resposta ao "sem lance, sem pressa" (VENDEDOR+ITEM4)
- `/var/folders/wy/cb7qjrq930b75ycj4j3fht540000gn/T/claude-chrome-screenshots-YOjOkS/screenshot-1784767078004-95.jpg` — card de recomendação completo (ITEM 1-b)
- `/var/folders/wy/cb7qjrq930b75ycj4j3fht540000gn/T/claude-chrome-screenshots-YOjOkS/screenshot-1784767501284-96.jpg` — desfecho "Parabéns" (ITEM 3)
- `/var/folders/wy/cb7qjrq930b75ycj4j3fht540000gn/T/claude-chrome-screenshots-YOjOkS/screenshot-1784767572950-97.jpg` — resume pós-fechamento, histórico completo (ITEM 2)
- `/var/folders/wy/cb7qjrq930b75ycj4j3fht540000gn/T/claude-chrome-screenshots-YOjOkS/screenshot-1784767588382-98.jpg` / `-99.jpg` — saudação de retomada completa (ITEM 2)

## Status por checkpoint

| Checkpoint | Resultado observado |
|---|---|
| ITEM 1-a (nunca oferece Serviços, texto livre reforma/viagem) | ✅ Confirmado — nunca mencionado |
| ITEM 1-b (card de recomendação sem Serviços) | ✅ Confirmado — nunca mencionado |
| Vendedor (não empurra lance, respeita sem-pressa/sem-lance) | ✅ Confirmado — consultivo, ofereceu só-sorteio como legítimo |
| ITEM 3 (fechamento, linguagem compliant, sem promessa de data) | ✅ Confirmado |
| ITEM 2 (resume reconhece fechamento) | ⚠️ **Achado** — saudação não reconhece explicitamente o fechamento; trata como possível dúvida/travamento no formulário |

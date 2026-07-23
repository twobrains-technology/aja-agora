# Rodada 3 — Smoke reduzido, persona 2 (Diego) — Moto, com pressa

> E2E reduzido pedido pelo juiz (veredito 7,5/10 condicional) pós-remoção do runtime Vercel.
> Coletado por agente (general-purpose), rodando EM PARALELO com o coletor da persona Renata —
> isso causou uma colisão de sessão que invalidou o checkpoint de resume (ver abaixo). Papel: só
> registro factual, sem julgamento de qualidade.

## ITEM 1 — Nunca oferece "Serviços"

**Confirmado: SIM (nunca apareceu).** Cards de oferta de moto (Banco do Brasil, Tradição,
Canopus) — nenhuma menção a "Serviços" em nenhum momento.

## ITEM 4 — Lance embutido oferecido proativamente

**Confirmado: SIM.** Ao responder "Pra dar lance eu nao tenho grana sobrando agora nao. Mas
queria muito contemplar rapido, tem algum jeito?":

> "Boa notícia, Diego: mesmo sem grana sobrando, dá pra acelerar usando lance embutido — que
> sai da própria carta, sem precisar tirar dinheiro do bolso agora. Deixa eu te mostrar os 3
> cenários: [...] no cenário 'Provável' você contemplaria perto do mês 27, e no 'Acelerado' já
> no mês 16 — usando lance embutido, tirado da própria carta. Só um detalhe importante: como o
> lance sai da carta, o crédito líquido que você recebe diminui (por isso, pra moto de R$25
> mil, o ideal é buscar uma carta um pouco maior, tipo R$35 mil, e deixar o embutido reduzir até
> os R$25 mil). Quer que eu já busque essas opções de carta maior pra você?"

Sugestão proativa, sem o cliente ter mencionado o termo "lance embutido".

**Observação sem julgamento:** houve uma inconsistência de valores não-crítica — a carta
reservada final ficou em R$23.911 (cenário sem o lance embutido/45 meses), enquanto a resposta
anterior propôs migrar pra carta de R$35 mil com lance embutido de 30%. Pode ser comportamento
esperado do fluxo (o cliente não confirmou explicitamente a migração antes do fechamento) — não
investigado a fundo aqui.

## ITEM 3 — Fechamento com sucesso

**Confirmado: SIM.** `innerText.includes('Parabéns')` = true, `.includes('reservada')` = true:

> "Perfeito! Sua cota da BANCO DO BRASIL está reservada, escolhida pela Aja Agora para o seu
> perfil — e a Aja Agora segue com você até a contemplação, e depois dela. Você não paga nada
> agora: a primeira parcela só vence quando o boleto chegar na sua casa." + "Sua proposta está
> pronta [...] Parabéns! Agora você está oficialmente mais perto da sua conquista! [...]"

## ITEM 2 — Resume pós-fechamento — **NÃO VALIDADO (colisão de ambiente, não bug de produto)**

O modal "Continuar de onde você parou?" apareceu corretamente após o reload (confirma que o
mecanismo de detecção de conversa pendente funciona), mas o conteúdo retomado, nas duas
tentativas, era de **outra sessão** (categoria Carro/Itaú, CPF/celular diferentes — a conversa
da persona Renata, que rodava em paralelo no mesmo perfil de Chrome).

**Causa raiz (achado metodológico, registrado pra não repetir):** o identificador de conversa
(`aja_uid` ou equivalente) parece ser um cookie de **navegador/perfil**, não isolado por aba —
duas pilotagens simultâneas no mesmo perfil do Chrome (Diego numa aba, Renata em outra)
colidiram: a atividade mais recente de uma sobrescreveu o cookie de identidade "atual" pra
ambas as abas. Diego caiu na conversa da Renata ao clicar "Voltar à conversa".

**Lição pra próximas rodadas:** pilotagens paralelas via `claude-in-chrome` no mesmo perfil de
navegador só são seguras pra checkpoints que NÃO dependem de identidade de conversa (ex.: smoke
de UI estático). Qualquer checkpoint de resume/identidade precisa rodar em ISOLAMENTO
(sequencial, sem outro agente ativo no mesmo perfil) — documentado aqui, retestado em
`smoke-persona-2-diego-resume-retry.md`.

## Problemas de ambiente

Nenhum problema de túnel/latência — só a colisão de sessão cross-agente descrita acima.

## Status por checkpoint

| Checkpoint | Resultado |
|---|---|
| ITEM 1 (nunca oferece Serviços) | ✅ Confirmado |
| ITEM 4 (lance embutido proativo) | ✅ Confirmado |
| ITEM 3 (fechamento compliant) | ✅ Confirmado |
| ITEM 2 (resume) | ⚠️ Não validado — colisão de ambiente (paralelismo), retestado em isolamento separadamente |

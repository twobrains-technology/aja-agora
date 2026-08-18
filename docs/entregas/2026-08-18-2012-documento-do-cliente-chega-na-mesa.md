---
titulo: O documento do cliente chega ao atendente
data: 2026-08-18
status: shipped
projeto: aja-agora · branch: fix/documento-do-cliente-chega-na-mesa → develop → main
jornadas_afetadas: [atendimento-humano-whatsapp, kyc-documentos]
tags: [whatsapp, atendimento, mesa]
---
# O documento do cliente chega ao atendente

## 1. Pitch

O cliente que manda um documento pelo WhatsApp agora aparece na tela de quem está
atendendo — com o arquivo. Até hoje esse documento era descartado em silêncio, e o
robô ainda interrompia o atendimento para dizer ao cliente que não havia conversa
nenhuma em andamento.

## 2. Problema que resolveu

Hoje, 18/08, uma atendente pediu o comprovante de renda a uma cliente em atendimento.
A cliente mandou o arquivo **três vezes** — às 20:10, 20:23 e 20:24. Nenhuma das três
chegou: nem ao WhatsApp da mesa, nem ao painel. E a cada envio o agente respondia à
cliente *"ainda não temos uma conversa em andamento por aqui, manda um oi que eu
começo com você"*, por cima da pessoa que estava atendendo.

Quem paga essa conta é a venda: a proposta trava na etapa de documentação, o cliente
conclui que mandou para o vazio, e a atendente fica esperando um arquivo que o sistema
jogou fora. Do lado de fora não há sintoma nenhum — nenhum erro, nenhum alerta —, então
o caso só aparece quando alguém reclama.

## 3. Solução entregue

- **Reconhece o cliente pelo telefone em qualquer formato.** O WhatsApp entrega número
  brasileiro sem o nono dígito e o site grava com ele; o anexo agora acha a conversa
  certa nas duas grafias, como o resto do sistema já fazia para texto.
- **Entrega o arquivo a quem está atendendo** — no painel, na hora, sem recarregar; e
  no WhatsApp do atendente, quando houver um cadastrado.
- **Cala o agente durante o atendimento humano.** Enquanto há uma pessoa no caso, o
  robô não fala com o cliente — nem para "acolher" um anexo.
- **Áudio, vídeo e figurinha entram pelo mesmo caminho.** Vídeo e figurinha eram
  ignorados pelo sistema, e o botão do vídeo fica ao lado do de áudio: gravar o
  documento em vídeo é gesto comum.
- **Falha vira aviso, não silêncio.** Se o arquivo não puder ser baixado ou guardado,
  o atendente é avisado para pedir o reenvio.

## 4. Por que importa

A etapa de documentação é onde a venda de consórcio se materializa: sem comprovante de
renda e identidade, não há contrato. Um canal que engole documento em silêncio ataca
justamente o ponto final do funil — o mais caro de reconquistar, porque o cliente já
disse sim.

Para o cliente, o valor é confiança: ele mandou, apareceu, alguém respondeu. Para a
mesa, é deixar de operar no escuro — o atendente não precisa mais adivinhar se o
cliente enviou e a mensagem se perdeu.

Métrica esperada (não medida ainda, volume baixo): documentos recebidos por atendimento
deixa de ser zero. Em 30 dias de produção houve 5 mídias inbound e **4 foram perdidas** —
todas do mesmo cliente, todas durante um atendimento humano.

## 5. Arquitetura — visão de 1 minuto

```
Cliente manda anexo no WhatsApp
            │
            ▼
   ┌────────────────────┐
   │ Quem responde esta │  ← pergunta única, a mesma que o texto já fazia
   │ pessoa agora?      │
   └─────────┬──────────┘
             │
     ┌───────┴────────┐
     ▼                ▼
  ATENDENTE         AGENTE
  · arquivo no      · foto do RG vira
    WhatsApp dele     documento da proposta
  · anexo na tela    (fluxo de sempre)
    do painel
     │                │
     └──────┬─────────┘
            ▼
    histórico da conversa
   (é o que o painel mostra)
```

Duas decisões seguram a correção:

**Um caminho só.** Antes existiam dois tratadores disparados lado a lado sobre o mesmo
anexo, e nenhum dos dois perguntava quem estava atendendo. Foi essa duplicidade que
permitiu o buraco. Agora há um ponto de entrada, e ele faz a mesma pergunta que o texto
já fazia.

**O telefone é resolvido por uma chave única.** A regra de "mesmo cliente em formatos
diferentes de telefone" já existia no projeto e valia para envio, janela de 24h e trava
do agente — o caminho de anexo era o único que comparava texto cru. Ele passou a usar a
mesma regra, em vez de ganhar uma regra própria.

O fluxo de coleta de identidade (RG/CNH) segue intocado quando é o agente que conduz.

## 6. Qualidade entregue

- **12 testes de integração novos**, contra Postgres real, cobrindo: documento durante
  atendimento chegando ao atendente, agente calado no handoff, telefone com e sem nono
  dígito (nos dois ramos), áudio, vídeo fora do fluxo de identidade, nome de arquivo
  fora do limite do banco, storage fora do ar e anexo vindo do próprio atendente.
- **O teste do nono dígito foi verificado por mutação**: com o defeito reintroduzido no
  código, ele falha. Sem essa checagem ele estava passando por engano — quem apontou foi
  a revisão adversarial, e o teste foi refeito.
- **Gate completo verde**: 3.225 testes unitários + 371 de integração, typecheck e lint.
- **Revisão adversarial por agente independente**, com seis achados; quatro eram reais e
  foram corrigidos antes do merge — incluindo um novo modo de falha que a própria
  correção havia criado (storage indisponível passando a derrubar a coleta de documento).
- **Smoke ponta a ponta em ambiente local**: webhook assinado → conversa resolvida →
  arquivo guardado no storage → histórico → entrega ao atendente; o link enviado ao
  atendente foi baixado e trouxe o arquivo íntegro.
- **Produção verificada por identidade de imagem**, não pelo verde da esteira: a versão
  em execução corresponde ao commit publicado. Migrations aplicadas, site respondendo.

## 7. Decisões registradas

- `src/lib/whatsapp/midia-do-cliente.ts` — o cabeçalho do módulo registra o incidente
  com data, hora e as duas causas; é onde a próxima pessoa vai ler por que existe um
  ponto único de entrada.
- `src/lib/whatsapp/destino.ts` — por que a conversa é resolvida por chave de telefone e
  nunca por comparação de texto.
- Sem ADR novo: a regra de decisão ("quem responde esta pessoa agora?") já estava
  registrada em `src/lib/agent/quem-responde.ts` desde 10/08. Esta entrega passou a
  obedecê-la no caminho que a ignorava, e não criou regra nova.

## 8. Riscos e tratamento

| Risco | Tratamento |
|---|---|
| Storage ou download indisponível na hora do anexo | Não derruba mais o turno: o atendente recebe aviso para pedir reenvio, e a coleta de identidade do agente segue |
| Nome de arquivo enviado pelo cliente maior que o limite do banco | Truncado na gravação; a entrega ao atendente não depende mais do sucesso dessa escrita |
| Cliente com conversa em dois canais (site e WhatsApp) | O anexo vai para a conversa do atendimento, que é a que o atendente tem aberta |
| Entrega ao WhatsApp do atendente sem ninguém cadastrado | Passa a ser registrado explicitamente no log; antes o sistema registrava como entrega feita |
| Reenvio do mesmo anexo pelo WhatsApp (a Meta reentrega) | Proteção de duplicidade já existente no webhook, inalterada |

## 9. Gaps honestos

- **Não há atendente cadastrado com telefone em produção.** Medido: em 48 horas, nenhuma
  mensagem foi entregue ao WhatsApp de atendente algum. O atendimento acontece pelo
  painel, e é lá que o anexo aparece. A entrega por WhatsApp está pronta e testada, mas
  só passa a valer quando alguém for cadastrado.
- **As quatro mídias perdidas hoje não foram recuperadas.** A correção vale daqui para a
  frente; o que a cliente enviou antes do deploy continua perdido e precisa ser pedido
  de novo.
- **Anexo enviado por um atendente pelo número do bot não segue para o cliente.** Ele
  agora recebe uma resposta dizendo para usar o painel, em vez da mensagem de cliente
  que recebia antes — mas o encaminhamento em si não existe.
- **Validação final com cliente real ainda pendente** — teste pelo WhatsApp em produção.

## 10. Próximos passos

- Cadastrar ao menos um atendente com telefone, ou decidir explicitamente que a mesa
  opera só pelo painel e aposentar o caminho de relay por WhatsApp.
- Sinal de observabilidade sobre anexo recebido versus anexo entregue — este defeito
  viveu por não ter ninguém olhando, e o log sozinho não avisa.
- Avaliar se o atendente deve conseguir mandar anexo ao cliente pelo próprio WhatsApp,
  hoje possível apenas pelo painel.

## 11. Métricas da sessão

- 9 arquivos: 2 novos, 6 modificados, 1 removido (um dos dois tratadores duplicados)
- 890 linhas adicionadas, 153 removidas
- 3 commits na branch, entregues em 2 PRs (#78 para develop, #79 para produção)
- Duração aproximada: 1h, do primeiro log lido ao deploy verificado
- Risco evitado: documento de cliente descartado sem rastro em qualquer atendimento
  humano no WhatsApp — o ponto do funil mais próximo da assinatura

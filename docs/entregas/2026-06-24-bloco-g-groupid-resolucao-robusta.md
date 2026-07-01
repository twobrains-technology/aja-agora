---
title: Resolução robusta de groupId — o agente nunca mais "perde" um grupo real
date: 2026-06-24
status: shipped
project: aja-agora
bloco: bloco-g-groupid-resolucao-robusta (FIX-72)
branch: fix/groupid-resolucao-robusta
commit: a58de991 (test+fix) · ba4819c (ADR)
session_duration: ~1h (worktree autônomo, onda 2)
tags: [agente, descoberta, confiabilidade, anti-regressão, bevi]
---

## 1. Pitch

Quando o usuário pedia *"me mostra as outras opções dessa faixa pra eu comparar"*,
o agente às vezes respondia *"esse grupo deu um problema agora"* e não entregava —
mesmo com os grupos reais já na tela. Agora **não trava mais**: qualquer pedido de
detalhar, simular ou comparar um grupo que o usuário já viu resolve com o dado real
da administradora, e nos casos de borda o próprio agente se recupera sozinho (re-busca
o grupo certo) em vez de empacar. O cliente vê a comparação que pediu, sem fricção.

## 2. Problema que resolveu

O cérebro do agente é uma IA. Pra simular ou detalhar um grupo, ela precisa usar o
**identificador exato** daquele grupo (um código opaco que a busca da Bevi devolve).
O que acontecia: quando esse código não estava "à mão" no raciocínio, a IA **inventava
um** no padrão `categoria-valor` (ex.: `auto-180k`) — e, no caso mais gritante,
`auto-180k-kairo`, **com o nome do próprio usuário embutido no código**. Esse código
inventado não existe, a administradora recusava, e a jornada quebrava bem no momento
mais quente (o usuário comparando pra decidir).

Já tínhamos atacado isso duas vezes (FIX-68 e FIX-71), mas só tampamos caminhos
específicos com um "detector" frágil. O QA noturno, revalidando ao vivo com CPF e
celular reais, provou que a **raiz continuava aberta**: o detector não reconhecia
`auto-180k` nem `auto-180k-kairo`, e um dos caminhos (ver detalhes de um grupo) não
tinha proteção nenhuma.

## 3. O que foi entregue

Uma correção de **raiz**, não mais um remendo, em três camadas que se reforçam:

- **A fonte da verdade virou o conjunto real de grupos, não um palpite de formato.**
  A camada de integração com a Bevi agora sinaliza de forma inequívoca quando um
  código não pertence à descoberta atual — seja ele inventado, expirado ou de uma
  busca que nem aconteceu. Isso vale pra **qualquer** administradora futura (respeita
  o desenho de "trocar de fornecedor sem reescrever o miolo").
- **Toda ferramenta que recebe um código de grupo agora se recupera em vez de falhar
  seco.** Em vez de devolver um erro cru (que a IA lê como "instabilidade" e desiste),
  o sistema devolve uma **orientação acionável**: "esse código não existe, use o código
  literal do card ou refaça a busca". A IA então se conserta sozinha. Antes isso só
  existia pra *simular*; agora vale também pra *detalhar* — o caminho que estava
  desprotegido.
- **Uma regra única e forte** foi consolidada nas instruções do agente: o código do
  grupo vem **sempre** literal da descoberta, para simular E para detalhar, e nunca se
  inventa a partir de banco/categoria/valor — nem se acrescenta o nome da pessoa.

Tudo isso **preservando a recuperação graciosa**: o agente não volta ao loop de
"instabilidade" — ele se reorienta e entrega o que o usuário pediu.

## 4. Qualidade entregue (provas, não promessas)

- **Bug reproduzido antes do conserto (TDD estrito):** os testes que reproduzem
  `auto-180k` e `auto-180k-kairo` foram escritos primeiro e **falharam** com a
  assinatura exata do bug; só então a correção entrou e eles passaram a verde.
- **Anti-regressão em 3 camadas** (padrão obrigatório do projeto pra bug de agente):
  - *Estrutural:* o detector reconhece os códigos inventados (incl. os novos do
    FIX-72) e não confunde com os reais; a integração sinaliza corretamente; a regra
    está no prompt.
  - *Trajetória (cassette):* reencena o stream real do bug — o agente pedindo detalhe
    e simulação com os códigos inventados — e a trajetória correta usando o código
    literal do card.
  - *Noturno (LLM-judge):* cobre o desvio de comportamento ao longo do tempo.
- **Gate verde:** `pnpm test:unit` — **1925 testes passando, 0 falhas** (22 novos),
  rodado em ambiente isolado com banco migrado. Nenhuma regressão nos blocos anteriores.

## 5. Riscos tratados

- **Não acoplar o miolo ao formato de id de uma administradora.** A tentação fácil era
  "código real tem 24 caracteres; o resto é inventado" — mas isso quebraria ao trocar de
  fornecedor. Optamos por perguntar ao próprio adapter "esse grupo existe?", que é
  à prova de troca de administradora.
- **Não esconder falhas de verdade.** A recuperação só dispara pra "grupo fora da
  descoberta". Erro real de rede/configuração continua subindo normalmente — não é
  mascarado como "é só re-buscar".
- **Não regredir a recuperação graciosa.** A trajetória correta está travada por teste:
  o agente se reorienta, nunca volta ao loop de "instabilidade".

## 6. Gaps honestos

- **Atalho de latência por padrão de texto.** O reconhecimento instantâneo (sem ida à
  Bevi) cobre os formatos inventados observados (sempre carregam um valor em milhares,
  ex. `-180k`). Um formato inventado totalmente novo, sem esse marcador, não é pego pelo
  atalho — mas **cai na rede de segurança** (o conjunto real), que o trata igual. Ou
  seja: no pior caso há uma ida a mais à Bevi, nunca uma falha pro usuário.
- **`recommend_groups` segue por outro caminho de dados** (bloco paralelo parado) e não
  foi tocado aqui — fora do escopo deste bloco, sem impacto no bug corrigido.
- A integração de fechamento (proposta real) é trilho separado e não usa esses códigos —
  intocada, como deveria.

## 7. Em uma frase

O agente parou de inventar identificador de grupo e passou a **sempre** usar o real —
e, quando não tem, a se recuperar sozinho em vez de travar a comparação que o cliente
pediu.

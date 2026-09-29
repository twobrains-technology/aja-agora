---
id: FIX-396
titulo: "Variante C — a melhor opção visível e borrada, com o telefone liberando"
status: todo
bloco: bloco-telefone-ab
arquivos:
  - src/components/chat/
  - src/lib/chat/
rodada: 2026-09-29
---
## Palavras do operador
Kairo, 12:08:56: *"Eu gosto dessa estratégia do Gustavo de causar ali aquele sentimento de curiosidade.
Eu acho que é melhor do que pedir o telefone dele de cara."*
Gustavo, 12:08:30: *"ou na hora que, para ele desbloquear, mostra, pede o telefone, ou com o blur, como
eu sugeri, e traz a opção com o telefone."*

## Cenário exato
Pedir o telefone de cara (variante B) cobra o dado antes de entregar qualquer valor. A variante C
inverte: entrega o **prêmio visível** (a pessoa VÊ que existe uma melhor opção) e cobra o dado para
**ler** o conteúdo.

## Root cause
A capacidade não existe — o card mostra tudo ou não mostra nada.

## Correção proposta
| O quê | Onde |
|---|---|
| Na variante **C**, a melhor opção aparece **legível no que importa** (o número da parcela) e **borrada no resto** — não é um card vazio nem um cadeado genérico | card de comparação do chat |
| O desbloqueio pede o celular no próprio card (mesmo campo/máscara do gate existente) | idem |
| **"Agora não" existe e funciona**: sem ele o card vira pedágio e a pessoa abandona o site inteiro | idem |
| A cópia é a do documento (variante C). Sem promessa de contemplação, sem administradora citada por nome | — |
| Acessibilidade: o blur não pode ser a única pista — leitor de tela e teclado precisam do mesmo caminho | idem |

## Regressão exigida
Teste de componente: a melhor opção mostra o valor e esconde o resto; o desbloqueio libera o conteúdo
depois de telefone válido; o "Agora não" fecha o pedido **sem** apagar a comparação; navegação por
teclado chega ao desbloqueio.

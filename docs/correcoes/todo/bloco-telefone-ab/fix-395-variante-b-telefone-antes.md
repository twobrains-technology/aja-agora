---
id: FIX-395
titulo: "Variante B — o telefone ANTES de liberar a comparação"
status: todo
bloco: bloco-telefone-ab
arquivos:
  - src/components/chat/
  - src/lib/chat/
rodada: 2026-09-29
---
## Palavras do operador
Bruna Perrotta, 12:07:52: *"Primeiro coisa que a gente está falando aqui de plano de ação é: antes de
mostrar a simulação, a gente colocar o telefone."*

## Cenário exato
Hoje o card da oferta abre sem que a pessoa deixe contato — e o funil trava ali: ver a oferta não gera
telefone, e sem telefone não há ligação, SMS nem WhatsApp.

## Root cause
A ordem dos passos: a oferta é entregue antes do dado que permite continuar a conversa.

## Correção proposta
| O quê | Onde |
|---|---|
| Na variante **B**, um passo de telefone **antes** de liberar a comparação — reusando o campo de celular que já existe (mesma máscara, mesma validação), não um formulário novo | componentes do chat |
| A cópia é a do documento `docs/decisoes/2026-09-29-copia-do-desbloqueio-do-telefone.md` (variante B) — **não reescreva**, e nada de texto fixo no servidor | — |
| Telefone já conhecido (lead identificado) ⇒ **não pede de novo**: passa direto | idem |
| Falha de gravação do telefone ⇒ a pessoa **não** fica travada: mostra o caminho de erro e não perde a comparação | idem |

## Regressão exigida
Teste de componente: sem telefone conhecido ⇒ o passo aparece antes da comparação e a comparação só é
liberada depois de um telefone válido; com telefone conhecido ⇒ o passo não aparece. Nenhuma chamada
real a WhatsApp/Meta.

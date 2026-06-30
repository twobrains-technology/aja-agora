---
bloco: bloco-whatsapp-apresentacao
branch: feat/whatsapp-entrada-simulador
workspace: feat-whatsapp-entrada-simulador
onda: 1
depends_on: []
paralelo_com: [bloco-jornada-entrada, bloco-web-valor-agulha]
itens: [FIX-108, FIX-109]
escopo_arquivos:
  - src/lib/whatsapp/formatter.ts
  - src/lib/whatsapp/adapter.ts
  - src/lib/whatsapp/interactive-handlers.ts
---
# Bloco whatsapp-apresentacao — apresentação WhatsApp da nova jornada

Ajusta a camada WhatsApp pros novos fluxos:
- FIX-108: escolha do grupo = card da recomendada em destaque + "ver outras
  opções" (não lista plana).
- FIX-109: apresentação do simulador conversacional (o agente conduz o loop —
  bloco-jornada; aqui a formatação do cenário a cada iteração) + parar de mandar
  a lista de faixas de valor (valor virou conversa).

**Nível 3 (depende do contrato do bloco-jornada-entrada):** o agente para de
emitir `value_picker` e conduz o simulador em loop. Onde precisar do shape final,
`TODO(bloco-jornada-entrada)` contra stub. Arquivos disjuntos dos outros blocos
(só `src/lib/whatsapp/**`) → merge limpo.

Ordem interna: FIX-108 (escolha) → FIX-109 (simulador + remover faixas).

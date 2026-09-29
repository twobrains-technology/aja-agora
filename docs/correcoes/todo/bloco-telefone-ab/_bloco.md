---
bloco: bloco-telefone-ab
branch: feat/telefone-ab
workspace: feat-telefone-ab
onda: 3
depends_on: []
paralelo_com: []
itens: [FIX-394, FIX-395, FIX-396, FIX-397, FIX-398]
escopo_arquivos:
  - src/lib/chat/
  - src/components/chat/
  - src/app/api/chat/
  - src/lib/admin/sinais-do-funil.ts
  - src/app/api/admin/performance/
---
# Bloco telefone A/B — a entrega de quinta (01/10)

**Prazo: quinta-feira à noite.** É o compromisso que o Kairo assumiu com a Bruna na call de 29/09
(11:37–12:37). Não é um item de backlog: é a frente que destrava o funil.

## O gargalo, com as palavras dela

> *"Então, primeiro coisa que a gente está falando aqui de plano de ação é: antes de mostrar a
> simulação, a gente colocar o telefone. Só para a gente pôr aqui em prática, o que a gente vai fazer?
> Já que tem esse gargalo aqui que daqui não desce."* — Bruna Perrotta, 12:07:52

Quem vê a oferta **não se identifica**. Sem telefone, a única ação possível é remarketing por evento —
não dá para ligar, mandar SMS nem chamar no WhatsApp. O lead fica "descoberto" exatamente no ponto em
que ele já demonstrou interesse.

## O que foi decidido na call (e por quem)

| | |
|---|---|
| **B** | pedir o telefone **antes** de liberar a comparação — ideia da **Bruna** |
| **C** | **blur** na melhor opção: a pessoa vê que o prêmio existe, borrado, e o telefone desbloqueia — ideia do **Gustavo** |
| **A** | "como está hoje" — **descartada**: medir o problema conhecido gasta massa que não temos |
| Regra | cada **visita** cai numa variante (não é por pessoa): *"eu entrei, eu vou cair na A. O Caio entrou, cai na B."* — Gustavo, 12:10:35 |
| Meta | **≥30 leads em cada variante** (≈60 pessoas chegando na conversa) |
| Cópia | já escrita em `docs/decisoes/2026-09-29-copia-do-desbloqueio-do-telefone.md`, na régua do `Remarketing_WhatsApp_V3.pdf` (a Bruna orientou: **uma pergunta só**, curta, sem prometer contemplação, sem citar administradora por nome, LGPD explícita) |

O Kairo endossou o blur (12:08:56): *"Eu gosto dessa estratégia do Gustavo de causar ali aquele
sentimento de curiosidade. Eu acho que é melhor do que pedir o telefone dele de cara."*

## Ordem interna

**394 → 395 → 396 → 397 → 398.** A atribuição da variante primeiro (é a fundação: sem ela os dois
caminhos não são comparáveis), depois cada caminho, depois a prova de que dá para medir, e por último
a correção do sinal "viu oferta" — que é o que a medição inteira usa.

## O que este bloco NÃO faz

- **Não** dispara mensagem real de WhatsApp para cliente. Nenhum teste chama a Meta.
- **Não** mexe na tela do painel além do endpoint: o desenho da tela de resultado vem depois (para não
  colidir com o bloco de custo, que está na onda 2).
- **Não** decide prazo de teste nem volume de investimento: isso é do dono.
- **Não** mergeia, não abre PR, não faz deploy.
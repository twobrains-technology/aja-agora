# Cópia do desbloqueio do telefone — variantes A e B

> **Revisado pelo dono em 29/09/2026, 23h (FIX-403).** A nomenclatura deste documento era
> `B`/`C`; o dono corrigiu: *"teste A deveria ser, antes de mostrar para o cliente as ofertas,
> pedir o numero dele... teste B deveria ser, mostra as ofertas totalmente embacadas com blur,
> e alguma especie de clique para desbloquear, e ai pede o numero do cliente. teste C nao existe,
> sao somente esses 2."* — Logo: **A** = o antigo "B" (`pede-antes`) e **B** = o antigo "C"
> (`borrado`), que agora embaça **todas** as ofertas em vez de deixar a parcela legível.
> O texto abaixo é o registro da call de 29/09 e ficou como estava; a nomenclatura vigente é A/B.

**Origem:** call Aja Agora de 29/09/2026, 11:37–12:37 (Kairo, Bruna Perrotta, Gustavo Barbosa).
**Prazo combinado:** teste rodando **quinta-feira 01/10 à noite** / sexta manhã.
**Régua de escrita:** `Remarketing_WhatsApp_V3.pdf` (Bruna, 15/09) — mensagem curta, **uma pergunta
só**, sem prometer contemplação, sem citar administradora por nome, LGPD explícita.

## O gargalo que isso ataca

O card com as opções aparece **antes** de pedir identificação. Quem vê a oferta não se identifica e
sobra só remarketing por evento — sem telefone não dá para ligar, mandar SMS nem WhatsApp. É o
"daqui não desce" que a Bruna nomeou na call.

## A regra do teste

Cada **visita** cai numa variante (sorteio na entrada, não por pessoa). **Meta: 30 leads em cada**
(~60 pessoas chegando na conversa). O evento que decide o vencedor é **contato identificado por
visita**, não lead absoluto — senão o volume de mídia mente.

A variante A ("como está hoje") foi **descartada** na call: medir o problema já conhecido gasta
massa que não temos.

---

## Variante B — o telefone ANTES de liberar a comparação

Ideia da Bruna: *"antes de mostrar a simulação, a gente colocar o telefone"*.

> **Título:** Falta um passo para ver a sua comparação
>
> **Apoio:** A comparação é montada na hora, com a faixa que você buscou. Deixo ela salva no seu
> WhatsApp — se a sua internet cair, eu te encontro de volta.
>
> **Campo:** Seu WhatsApp com DDD
>
> **Botão:** Ver a minha comparação
>
> **Rodapé de confiança:** Seus dados seguem a LGPD. A AJA não vende consórcio próprio e não
> repassa seu contato.

*147 caracteres no apoio. Sem promessa de contemplação, sem administradora citada.*

## Variante C — a melhor opção já aparece, **borrada**, e o telefone desbloqueia

Ideia do Gustavo, endossada pelo Kairo: *"eu gosto dessa estratégia de causar aquele sentimento de
curiosidade… é melhor do que pedir o telefone dele de cara"*.

A pessoa **vê que existe** a melhor opção (valor da parcela visível, o resto borrado) — o prêmio
está na tela, só não está legível.

> **Selo:** Sua melhor opção está aqui
>
> **Título:** Libere a comparação completa
>
> **Apoio:** Se a sua internet cair, eu continuo a conversa com você pelo WhatsApp. Me deixa o seu
> número que eu libero a comparação agora.
>
> **Campo:** Seu WhatsApp com DDD
>
> **Botão:** Liberar agora
>
> **Link secundário:** Agora não
>
> **Rodapé de confiança:** Seus dados seguem a LGPD. A AJA não vende consórcio próprio e não
> repassa seu contato.

*169 caracteres no apoio. O "Agora não" existe de propósito: sem saída, o card vira pedágio e a
pessoa abandona o site em vez de abandonar só o formulário.*

---

## O que muda no agente depois do telefone informado

Nos dois casos, a partir do número informado o lead **entra sozinho no fluxo de WhatsApp** — não
fica descoberto. A régua que já está no ar assume daí: até **3 toques por pessoa a cada 30 dias**
(decisão do Kairo, 29/09), cadência 90 min → +1 dia → 4 a 7 dias.

**Nada de disparo novo nesta frente.** As três comunicações
(`remarketing_inicio` / `remarketing_viu_oferta` / `remarketing_fechamento`, em
`docs/decisoes/2026-09-28-textos-das-tres-comunicacoes.md`) continuam sendo as únicas, e seguem
entrando por **cadastro (template Meta) + prompt** — nunca fixas no servidor.

## Como saber quem ganhou

| Medida | Onde |
|---|---|
| Visitas que caíram em cada variante | evento de exposição por variante |
| Telefones informados / visita | conversão por variante |
| Chegaram na comparação completa | por variante |
| Responderam o 1º toque do WhatsApp | por variante (o loop de remarketing já registra) |

Sem 30 leads em cada lado, o resultado é **achismo** — foi o que o Kairo cravou: *"enquanto a gente
não aumentar a quantidade de pessoas, validar a estratégia vai ser só achismo"*.
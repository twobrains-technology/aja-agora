---
name: canal-do-projeto
description: >
  O canal oficial do projeto Aja Agora no WhatsApp — o grupo «Aja Agora · Pi», onde o Kairo
  comanda o assistente por texto ou ÁUDIO e recebe de volta veredito, bloqueio e marco. USE
  SEMPRE que for (a) falar com o Kairo sobre o Aja Agora, (b) reportar bloqueio, ponto de falha,
  decisão pendente ou marco concluído, (c) ligar/conferir/consertar o loop que responde no
  WhatsApp, (d) mandar documento/print do projeto para ele. Vale também quando ele disser
  "me manda no canal", "me avisa no whatsapp do projeto", "cadê o canal", "o loop caiu",
  "por que você não me respondeu". Skill LOCAL do repo aja-agora.
---

# canal-do-projeto — o WhatsApp do Aja Agora

Desde **29/09/2026** o Kairo trabalha o Aja Agora por um canal dedicado no WhatsApp: ele sai, manda
comando por lá (texto **ou áudio**, que é transcrito) e espera resposta por lá. **Tudo do projeto
passa por esse canal** — bloqueio, ponto de falha, decisão que só ele destrava e marco concluído.
Ele costuma responder por áudio.

## O canal

| | |
|---|---|
| Grupo | **«Aja Agora · Pi»** — `120363411255846885@g.us` |
| Loop | `~/code/tools/whatsapp-loop/` (`loop.py`, `canais.json`, `contexto.md`) |
| Sessão do agente | `whatsapp-aja` (separada da sessão interativa, de propósito) |
| cwd do agente | `/Users/kairo/code/aja-agora` |
| Modelo | `flashnext/Qwen3.8-Flash-Next-oQ4e-mtp` (o principal — aqui é julgamento, não tarefa curta) |

O mecanismo é o mesmo da skill global `ponte-whatsapp-pi`. O que é local: o canal, o cwd e o
`contexto.md` deste projeto.

## Como falar com ele pelo canal

Enviar mensagem/arquivo é a skill global **`mandar-whatsapp`** (`mandar.sh`), apontando para o JID
acima. Regras que já custaram retrabalho:

- **Veredito primeiro, 3 a 6 linhas.** É WhatsApp, no celular. Dossiê aqui é defeito.
- **Documento vai como ARQUIVO**, não no corpo do texto (o loop corta em ~3000 caracteres). HTML,
  PDF e print entram por `mandar.sh`.
- **Bloqueio aparece sozinho**, não espera ele perguntar: uma linha dizendo o que precisa, de quem,
  e o que destrava.
- Nada de cruzar domínio (TwoBrains × Selecta/CoopanestGO). Mensagem real a **cliente** não sai
  por aqui — isso é decisão dele.

## O loop (quando ele manda comando e ninguém responde)

```bash
cd ~/code/tools/whatsapp-loop
cat vivo.json            # SINAL DE VIDA — a fonte da verdade, não o `pgrep`
tail -20 loop.log
./iniciar.sh             # sobe (recusa se já houver um)
./parar.sh               # derruba
python3 loop.py --once   # uma passada só, para testar
```

Armadilhas medidas, todas já nos logs:

- **Processo de pé não quer dizer vivo.** Em 26/09 o loop passou 17 h congelado (App Nap) e agora,
  em 29/09, estava **morto** com `vivo.json` de 27/09. Sempre olhe `vivo.json`, nunca só o pgrep.
- **Um loop só.** Dois watchers = resposta duplicada. O `loop.lock` existe para isso.
- **A primeira execução semeia.** Com `estado.json` vazio, todo o histórico vira comando novo.
- **Comando e resposta são ambos `fromMe`** — o que separa é o campo `source`: `ios`/`android` é
  comando dele; `web` é resposta nossa (ignorada de propósito).
- **A Evolution precisa estar de pé:** `docker ps | grep evolution`. Se caiu,
  `docker start evolution-api evolution-postgres evolution-redis`.

## O `contexto.md` é a única ponte com o agente do loop

O agente do loop **não herda a sessão principal**. Ele só sabe o que está em
`~/code/tools/whatsapp-loop/contexto.md`. **Sempre que fechar um marco** (bloco mergeado, deploy,
decisão dele, prazo novo), atualize esse arquivo — é o que evita ele responder "não sei" sobre o
que acabou de acontecer. Ele deve ter, nessa ordem: o que está em curso (por prioridade), decisões
já tomadas (com o valor exato), achados que explicam números, pendências de terceiros e as regras
de comportamento.

## Como o Kairo espera o trabalho

- Ele está fora; o canal é a linha de vida. Se algo trava, ele quer saber **antes** de perguntar.
- Prazo combinado se cumpre ou se avisa. O de agora: **teste do telefone rodando quinta 01/10**.
- Decisão de produto é dele. Diante de bifurcação, mande a pergunta curta no canal em vez de
  escolher em silêncio.
- Nada de deploy nem merge na `develop` sem ordem dele.
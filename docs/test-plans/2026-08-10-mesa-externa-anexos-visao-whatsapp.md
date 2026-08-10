# Plano de smoke — mesa externa, anexos e visão WhatsApp (2026-08-10)

> Alvo: validar AO VIVO, no browser, o que foi construído nesta rodada.
> Ambiente: `https://aja-app-main.orb.local` (stack local, workspace `main`).

## Contas

| Papel | E-mail | Senha |
|---|---|---|
| Admin | `admin@ajaagora.com.br` | `admin123` |
| Mesa externa | `mesa.externa@parceiro.com.br` | `mesa12345` |

A mesa externa é **Bruna Mesa Externa**, dona do caso do lead **Mario**, que está
na raia **Em Atendimento**.

> Para trocar de conta: o logout fica no avatar do topo direito. Se travar,
> `POST /api/auth/sign-out` pelo console e recarregar.

## P0-1 — A mesa externa enxerga só o pedaço dela

1. Entrar como **mesa externa** e abrir `/admin/pipeline`.
2. **Esperado:** exatamente **3 colunas** — Em Atendimento, Aguardando Pagamento,
   Fechado Ganho. Nenhuma coluna de topo de funil (Novo, Qualificado, Proposta
   Enviada…) e nenhuma coluna "Perdido".
3. **Esperado:** a barra lateral mostra **apenas** "Pipeline" e "Perfil". Não pode
   aparecer Conversas, Atendentes, Administradoras, Agentes, Templates, Simulador,
   Agora nem Performance.
4. **Esperado:** aparece o card do **Mario**, com o selo **Bruna Mesa Externa**.
   Nenhum outro card.

## P0-2 — Ela leva o caso até o fechamento sem arrastar

1. No card do Mario, clicar no botão **"→ Aguardando Pagamento"** (rodapé do card).
2. **Esperado:** o card se move para a coluna Aguardando Pagamento; o contador da
   coluna de origem cai para 0 e o do destino sobe para 1.
3. No card, agora clicar em **"→ Fechado Ganho"**.
4. **Esperado:** o card chega em Fechado Ganho. Nenhum alerta de erro na tela.

## P0-3 — A porta fechada continua fechada

1. Ainda como mesa externa, digitar na barra de endereço:
   `https://aja-app-main.orb.local/admin/conversations`.
2. **Esperado:** o navegador é **redirecionado de volta** para `/admin/pipeline`.
   A tela de Conversas NÃO pode aparecer.
3. Repetir com `/admin/atendentes-mesa` e `/admin/simulator`.
4. **Esperado:** mesmo redirecionamento nos dois.

## P0-4 — A conversa com o lead, na visão de atendimento

1. Sair e entrar como **admin**. Abrir `/admin/conversations`.
2. Abrir qualquer conversa que tenha mensagens.
3. **Esperado:** no topo do histórico há um alternador com **"Lista"** e
   **"WhatsApp"**.
4. Clicar em **WhatsApp**.
5. **Esperado:** as mensagens viram **bolhas** sobre fundo bege, com o cliente à
   esquerda e a empresa à direita, cada uma com horário.
6. Clicar de volta em **Lista**.
7. **Esperado:** volta ao formato de lista, sem perder as mensagens.

## P0-5 — Anexo na conversa

1. Como admin, abrir `/admin/pipeline`, clicar num card que tenha conversa, e ir
   até a caixa **"Chat com o cliente"** (aba Atendimento, quando houver).
2. **Esperado:** existe um botão **"Anexo"** ao lado de "Enviar".
3. **Não é preciso enviar de fato** (depende da janela de 24h do WhatsApp). Basta
   registrar se o botão existe e se abre o seletor de arquivo.

## O que reportar

Para CADA passo: o que apareceu na tela, com screenshot. Se algo divergir do
esperado, descrever exatamente o que viu — **sem tentar consertar e sem julgar se
é bug**; a análise é de quem lê o dossiê.

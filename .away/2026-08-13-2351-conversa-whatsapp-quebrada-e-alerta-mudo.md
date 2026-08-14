# Away — corrigir os defeitos da conversa de WhatsApp de 13/08 e fazer o incidente chegar ao Cortex sozinho

- **Início:** 2026-08-13 23:51 · **Sessão:** aja-agora / `develop`
- **Critério de pronto:** (1) teste de regressão falhando antes e verde depois para **cada**
  defeito confirmado pelo especialista; (2) `pnpm typecheck` + `pnpm test:unit` verdes;
  (3) sinal determinístico novo emitido e provado por teste, cobrindo a classe de defeito
  desta conversa; (4) caminho alerta → Cortex provado ponta a ponta **na stack local**;
  (5) a conversa refeita na stack local recebe **10/10 de um agente juiz**.
- **Status:** EM ANDAMENTO

## Contexto

Última conversa real de produção no WhatsApp (`fa0533a0-6179-46ec-8abe-fea74a559afc`,
13/08 23:28→23:35 BRT, 45 mensagens, o próprio Kairo do outro lado). O cliente pediu moto de
R$ 20 mil com parcela de R$ 200/mês; o agente devolveu grupos de R$ 201.393 com parcela de
R$ 6.270, pediu desculpa três vezes sem corrigir o estado do servidor, e a conversa morreu sem
card e sem proposta (`bevi_proposals` = 0 linhas).

Dossiê factual (transcript, payload dos cards, estado do servidor):
`/private/tmp/claude-501/-Users-kairo-code-aja-agora/7cce3e7c-d960-41ed-92b4-abeb2ea76a72/scratchpad/DOSSIE-conversa-whatsapp.md`

O `super-especialista-de-ia` está produzindo o diagnóstico com causa-raiz por ponto; a
implementação segue o que ele apontar.

## Decisões

### D1 · 23:40 — Diagnóstico pelo banco de produção, não por reprodução local
- **Contexto:** para avaliar a conversa era preciso saber o que o servidor realmente gravou,
  não o que a tela mostrou.
- **Decidi:** abrir túnel SSM para o RDS de produção (porta local 25432) e extrair transcript,
  `artifacts` e `conversations.metadata` em SELECT.
- **Alternativas:** reproduzir localmente (não reproduz o estado corrompido real); ler só o
  Langfuse (tem o trace, não tem o que foi persistido).
- **Reversibilidade:** fácil — leitura apenas, nada escrito em prod.
- **Evidência:** os quatro arquivos do scratchpad citados acima.

### D2 · 23:48 — O alerta automático que não disparou entra no escopo como defeito próprio
- **Contexto:** o Kairo perguntou por que o incidente não abriu sozinho no Cortex, já que a
  integração foi construída hoje (`b7e93031`).
- **Decidi:** tratar como ponto nono do diagnóstico e pedir ao especialista que desenhe o sinal
  determinístico que teria pego esta classe de defeito — não só configurar as envs.
- **Por quê:** provei que a rota responde 503 em produção (`LANGFUSE_WEBHOOK_SECRET` ausente) e
  que nenhuma das 5 envs existe no secret. Mas, mesmo tudo ligado, **nenhum dos 4 Monitors
  existentes pegaria esta conversa**: `tool_falhou`=0 (a busca rodou e devolveu resultado errado,
  não falho), `turno_mudo`=0, `card_sem_fala`=0 (o defeito foi o inverso), `gate_entregue`=1.
  Configurar as envs sem sinal novo deixaria o mesmo buraco.
- **Reversibilidade:** fácil.
- **Evidência:** `curl` → HTTP 503; secret `tb/prod/aja-agora/env` sem as 5 envs;
  `funil-scores.ts:110-249`.

### D3 · 23:55 — provar a ponte de alerta INTEIRA antes de mexer no sinal
- **Contexto:** a ponte alerta → e-mail → Cortex tinha teste unitário em cada peça
  (assinatura, corpo, leitura da resposta) e **nenhum teste da rota inteira**. Peça verde com
  ponte muda é o buraco que deixou o alerta passar.
- **Decidi:** escrever `route.ponte-cortex.integration.test.ts` — stub HTTP local fazendo de
  Langfuse e de Cortex, webhook assinado de verdade, 8 casos: caminho feliz (Cortex recebe
  `abrir_ocorrencia` com projeto/tipo/prioridade/título/descrição), prioridade por severidade,
  Cortex fora do ar não cala o e-mail, 200 com erro embutido não conta como aberta, sem
  `CORTEX_*` vira no-op, sem segredo dá 503 (o estado real de produção), assinatura inválida dá
  401, evento de outro tipo é ignorado.
- **Alternativas:** apontar o teste para o Cortex real — descartado, o próprio `cortex.ts`
  registra que não existe editar/excluir ocorrência lá: card de teste em projeto real fica para
  sempre.
- **Reversibilidade:** fácil.
- **Evidência:** `pnpm vitest run …route.ponte-cortex.integration.test.ts` → **8 passed**.
  Conclusão: o código da ponte está certo; o que faltava era configuração e sinal.

### ⚠️ PENDENTE-KAIRO · 23:50 — configurar a ponte de alerta em produção
- **O que é:** (a) gravar `LANGFUSE_WEBHOOK_SECRET`, `ALERTA_OBSERVABILIDADE_TO`,
  `CORTEX_MCP_URL`, `CORTEX_MCP_TOKEN`, `CORTEX_PROJETO` no secret `tb/prod/aja-agora/env`
  **e** mapear cada chave na taskdef (secret sem entrada na taskdef não chega ao container);
  (b) criar a Automation (webhook) e os Monitors na UI do Langfuse de produção.
- **Por que não fiz:** escrita em secret de produção + deploy + configuração em ferramenta
  compartilhada. Blast radius alto — fora da autonomia de execução do modo autônomo.
- **Como destrava:** ele autoriza, ou roda ele mesmo seguindo
  `docs/integracoes/alerta-langfuse-email-cortex.md` §"Variáveis de ambiente" e §"O que criar na
  UI do Langfuse". O caminho **local** equivalente eu provo nesta sessão.

## Linha do tempo (resumida)

- 23:28 — conversa quebrada acontece em produção
- 23:35 — última mensagem; conversa morre sem card
- 23:40 — transcript e estado extraídos do RDS de produção
- 23:45 — `super-especialista-de-ia` disparado com o dossiê
- 23:48 — provado: rota de alerta responde 503, 5 envs ausentes, 4 Monitors não cobririam o caso
- 23:51 — Kairo saiu; modo autônomo ativado, diário aberto
- 23:51 — complemento de escopo enviado ao especialista (ponto 9: sinal que teria pego)

## Relatório final (preencher ao encerrar)

- **Resultado vs critério de pronto:** _(pendente)_
- **O que NÃO fiz e por quê:** _(pendente)_
- **Revisar primeiro:** _(pendente)_
- **Próximos passos sugeridos:** _(pendente)_

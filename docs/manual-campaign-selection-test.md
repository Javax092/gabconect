# Teste manual: prioridade da seleção manual em campanhas

## Objetivo

Confirmar que contatos selecionados manualmente entram na audiência da campanha independentemente de categoria, tag, aniversário ou filtros automáticos, desde que passem apenas nas validações críticas.

## Preparação

1. Configure `WHATSAPP_DRY_RUN=true`.
2. Garanta um template aprovado para campanhas.
3. Tenha o app e o worker disponíveis:
   - `npm run dev`
   - `npm run worker:outgoing`

## Cenário

Crie ou ajuste contatos no mesmo `mandateId` com perfis distintos:

1. Contato A:
   - categoria/tag compatível
   - telefone válido
   - `status=ACTIVE`
   - `optIn=true`
2. Contato B:
   - categoria/tag diferente do filtro da campanha
   - telefone válido
   - `status=ACTIVE`
   - `optIn=false`
3. Contato C:
   - categoria/tag diferente
   - telefone válido
   - `status=ACTIVE`
   - `optIn=true`
4. Contato D:
   - telefone inválido ou vazio
5. Contato E:
   - telefone válido
   - `status=UNSUBSCRIBED`

## Execução

1. Em `/admin/campaigns`, crie uma campanha com filtros automáticos que não incluam todos os contatos acima.
2. Selecione manualmente A, B, C, D e E.
3. Abra o preview em `GET /api/campaigns/audience-preview` pela UI de revisão e confirme:
   - `totalSelecionados = 5`
   - `totalEncontrados = 5`
   - `totalElegiveis = 3`
   - B continua elegível mesmo fora de categoria/tag/filtro
   - D aparece bloqueado por telefone inválido ou ausente
   - E aparece bloqueado por opt-out
4. Inicie a campanha em `POST /api/campaigns/[id]/start` com `confirmedAudience=true`.
5. Confirme em `/admin/campaigns/operations?campaignId=ID`:
   - A, B e C aparecem em `CampaignRecipient`
   - D e E aparecem como bloqueados/ignorados, sem entrar como destinatários elegíveis
6. Confira no banco:
   - `CampaignRecipient` sem duplicados por `campaignId + contactId`
   - `messagePreview` preenchido
   - `queuedAt` preenchido para itens enfileirados
   - `MessageQueue` criado para a fila `outgoing-message`
7. Deixe o `worker:outgoing` processar e confirme:
   - `WHATSAPP_DRY_RUN=true` evita envio real
   - a campanha avança operacionalmente sem chamada real à Meta

## Resultado esperado

- Seleção manual prevalece sobre filtros automáticos.
- Preview e start mostram a mesma audiência.
- O `start` não retorna `400` quando houver contatos selecionados manualmente com telefone válido e sem opt-out/bloqueio explícito.

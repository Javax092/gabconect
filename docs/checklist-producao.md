# Checklist de Producao

Este checklist cobre a primeira rodada de producao segura do Gabinete Conectado. Ele nao libera disparos em escala.

## Variaveis obrigatorias

- `DATABASE_URL`: PostgreSQL usado pela aplicacao.
- `DIRECT_URL`: conexao direta para migrations Prisma.
- `JWT_SECRET`: segredo forte para sessoes JWT.
- `AUTH_SECRET`: segredo forte alternativo/compatibilidade de auth.
- `APP_URL`: URL publica HTTPS da aplicacao.
- `NEXT_PUBLIC_DEMO_MODE=false`: modo demo desligado.
- `REDIS_URL`: Redis real para BullMQ.
- `OPENAI_API_KEY`: chave da OpenAI.
- `WHATSAPP_VERIFY_TOKEN`: token usado no GET de validacao do webhook.
- `META_APP_SECRET`: obrigatorio em producao para validar `x-hub-signature-256`.
- `WHATSAPP_ACCESS_TOKEN`: token da WhatsApp Cloud API.
- `WHATSAPP_PHONE_NUMBER_ID`: ID do numero oficial.
- `WHATSAPP_DRY_RUN=true`: manter true ate homologar envio real supervisionado.
- `WHATSAPP_MASS_CAMPAIGN_ENABLED=false`: manter false ate validar Send Gate, Redis e opt-out.
- `MAX_SENDS_PER_MINUTE`: limite de throughput por minuto.
- `MAX_SENDS_PER_HOUR`: limite de throughput por hora.
- `MAX_SENDS_PER_DAY`: limite diario absoluto.
- `WHATSAPP_SEND_DELAY_MIN_SECONDS`: delay minimo entre mensagens.
- `WHATSAPP_SEND_DELAY_MAX_SECONDS`: delay maximo com jitter.
- `ALERT_ERROR_RATE_PERCENT`: limite de alerta para erros.
- `ALERT_OPT_OUT_RATE_PERCENT`: limite de alerta para opt-out.

## Validacoes antes do deploy

- `.env.example` deve conter apenas placeholders.
- `.env`, `.env.local` e `.env.production.local` nao podem estar versionados.
- O webhook da Meta deve apontar para `https://SEU_DOMINIO/api/webhooks/whatsapp`.
- O webhook POST deve rejeitar requisicoes sem assinatura em producao.
- `npm run typecheck` deve passar.
- `npm run build` deve passar.
- `npx prisma migrate status --schema prisma/schema.prisma` deve indicar banco atualizado.
- Workers devem estar ativos: `worker:incoming`, `worker:outgoing`, `worker:human`.
- Painel de WhatsApp deve mostrar Redis e workers prontos antes de envio real.
- `WHATSAPP_MASS_CAMPAIGN_ENABLED` so deve virar `true` apos validar campanha TEST em dry-run.

## Bloqueios mantidos nesta etapa

- Nao habilitar campanhas em massa.
- Nao desligar `WHATSAPP_DRY_RUN` sem teste supervisionado.
- Nao importar listas sem comprovacao de opt-in.
- Nao enviar para contatos `UNSUBSCRIBED`, `BLOCKED` ou `INVALID`.

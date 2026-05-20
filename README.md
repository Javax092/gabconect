# Gabinete Conectado

Infraestrutura segura de atendimento inteligente para WhatsApp com supervisão humana, compliance e campanhas oficiais via WhatsApp Business Platform.

O produto opera como uma camada entre a WhatsApp Cloud API e a equipe do gabinete. A IA é assistiva, o backend decide com guardrails, e o humano continua no controle operacional.

## Visão geral

Principais módulos já implementados:

- login administrativo com sessão JWT
- painel `/admin` com navegação operacional
- conversas com fila humana e supervisão
- templates oficiais para atendimento
- integração com webhook da Meta
- filas BullMQ para processamento assíncrono
- módulo de campanhas WhatsApp com guardrails da Meta
- seed inicial com admin, mandato, contatos e templates demo

## Arquitetura

```text
WhatsApp Cloud API
→ Webhook
→ incoming-message queue
→ Compliance Layer
→ Intent Detection
→ AI Decision Engine
→ Humanizer Layer
→ outgoing-message queue
→ human-escalation queue
→ WhatsApp Sender
```

## Stack

- Next.js 15
- React 19
- TypeScript
- Prisma ORM
- PostgreSQL
- Redis
- BullMQ
- WhatsApp Cloud API
- OpenAI API

## Variáveis de ambiente

Obrigatórias:

- `DATABASE_URL`
- `JWT_SECRET`
- `AUTH_SECRET`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_DRY_RUN`
- `WHATSAPP_VERIFY_TOKEN`
- `META_APP_SECRET`
- `OPENAI_API_KEY`
- `REDIS_URL`

Auxiliar:

- `APP_URL`

Variáveis opcionais do seed:

- `SEED_WHATSAPP_NUMBER`
- `SEED_AI_PROMPT`
- `SEED_INCLUDE_SAMPLE_DATA`

Recomendado para operação real supervisionada:

- `NEXT_PUBLIC_DEMO_MODE=false`
- `WHATSAPP_DRY_RUN=true` no primeiro teste
- `APP_URL` apontando para a URL pública usada no webhook

Observação: o seed atual usa valores internos fixos para o admin e para o mandato principal. As variáveis antigas listadas abaixo não são mais consumidas pelo script atual:

- `SEED_ADMIN_NAME`
- `SEED_ADMIN_EMAIL`
- `SEED_ADMIN_PASSWORD`
- `SEED_MANDATE_NAME`
- `SEED_POLITICIAN_NAME`
- `SEED_MANDATE_CITY`
- `SEED_MANDATE_STATE`

## Credenciais iniciais

O seed cria ou atualiza um usuário admin padrão:

- login: `admin@gabinete.com`
- senha: `admin123`

Mandato seed:

- `Gabinete Conectado`
- cidade: `Manaus`
- UF: `AM`

## Setup local

1. Instale dependências:

```bash
npm install
```

2. Configure PostgreSQL e Redis.

3. Gere o client Prisma:

```bash
npx prisma generate
```

4. Aplique as migrations:

```bash
npx prisma migrate dev
```

5. Rode o seed:

```bash
npx prisma db seed
```

Também funciona com:

```bash
npm run db:seed
```

6. Suba a aplicação:

```bash
npm run dev
```

7. Acesse:

```text
http://localhost:3000/login
```

## Seed incluído

O seed é idempotente e não duplica os dados principais.

Ele cria ou atualiza:

- mandato principal
- usuário admin
- categorias padrão
- configurações padrão de campanhas
- 6 contatos demo com números fictícios em formato internacional
- contato fake `João Teste` com `optIn=true` e aniversário na data atual
- contatos com `optIn: true` e pelo menos um com `optIn: false`
- tags como `lideranca`, `bairro`, `evento`, `academia`, `teste`
- 3 templates WhatsApp demo:
- `campanha_informativo`
- `convite_evento`
- `lembrete_atendimento`

Se `SEED_INCLUDE_SAMPLE_DATA=true`, o seed também popula conversas, mensagens e demandas de exemplo.

## Redis e filas

O app usa BullMQ com `REDIS_URL`.

Se `REDIS_URL` não existir em desenvolvimento:

- a aplicação web não quebra
- os registros de fila continuam no PostgreSQL
- os workers não processam jobs reais até existir Redis

Produção exige Redis real.

## Workers

Filas dedicadas:

- `incoming-message`
- `outgoing-message`
- `human-escalation`

Comandos:

```bash
npm run worker:incoming
npm run worker:outgoing
npm run worker:human
npm run worker:all
```

Observação operacional:

- o app web abre sem Redis em desenvolvimento
- fallback local só deve ser usado em desenvolvimento/teste
- envio real exige `REDIS_URL`, BullMQ ativo e heartbeat recente do `worker:outgoing`

## Webhook Meta

Endpoint:

```text
https://SEU-DOMINIO/api/webhooks/whatsapp
```

Comportamento:

- `GET` valida `hub.verify_token`
- `POST` valida assinatura e payload
- `POST` enfileira rapidamente em `incoming-message`
- o processamento real acontece no worker
- opt-out por palavras-chave é aplicado no backend

## Fluxo ponta a ponta

1. O usuário envia mensagem para o número oficial do WhatsApp.
2. A Meta chama `/api/webhooks/whatsapp`.
3. O webhook valida a requisição e cria job na fila `incoming-message`.
4. O worker de entrada cria ou atualiza `Citizen`, `Conversation` e `Message`.
5. Compliance e Decision Engine escolhem responder, pedir contexto, usar template ou escalar.
6. Se houver resposta, uma `Message` de saída é criada e enfileirada.
7. O worker de saída valida novamente compliance, aplica timing humano e envia pela Cloud API.
8. Se houver risco, sensibilidade ou pausa de IA, a conversa entra na fila humana.

## Templates oficiais de atendimento

APIs:

- `GET /api/templates`
- `POST /api/templates`
- `PATCH /api/templates/[id]`
- `DELETE /api/templates/[id]`

UI:

- `/admin/templates`

Todos os templates são filtrados por `mandateId`.

## Campanhas WhatsApp

UI:

- `/admin/campaigns`
- `/admin/campaigns/settings`

APIs já disponíveis:

- `GET /api/campaigns`
- `POST /api/campaigns`
- `POST /api/campaigns/[id]/start`
- `POST /api/campaigns/[id]/send-next`
- `POST /api/campaigns/[id]/pause`
- `GET /api/campaigns/[id]/stats`
- `GET /api/campaigns/templates`
- `POST /api/campaigns/templates`
- `GET /api/campaigns/settings`
- `PUT /api/campaigns/settings`

Guardrails já implementados:

- opt-in obrigatório
- envio apenas com template aprovado
- bloqueio automático para contatos `UNSUBSCRIBED`, `BLOCKED` e `INVALID`
- `dailyLimit` por campanha
- `delaySeconds` entre envios
- pausa automática após falhas consecutivas
- logs em `WhatsAppMessageLog`
- opt-out por webhook
- defaults configuráveis por mandato

Configurações padrão de campanha:

- `defaultDailyLimit`
- `defaultDelaySeconds`
- `maxConsecutiveFailures`

Limites atuais do backend:

- `dailyLimit`: mínimo `1`, máximo `50`
- `delaySeconds`: mínimo `30`, máximo `3600`
- `maxConsecutiveFailures`: mínimo `1`, máximo `10`

Observações importantes:

- o sistema não faz envio em massa automático
- criar campanha não dispara mensagens
- `start` e `send-next` apenas enfileiram deliveries; o worker é o único ponto que envia
- tokens sensíveis do WhatsApp nunca são expostos no frontend

## Teste seguro de campanhas

Fluxo obrigatório:

```text
Campaign
→ CampaignRecipient
→ outgoing-message queue
→ worker
→ WhatsApp Sender
→ webhook de status
```

Dry-run local:

1. Defina `WHATSAPP_DRY_RUN=true`.
2. Rode `npx prisma db seed`.
3. Suba `npm run dev`.
4. Inicie uma campanha normal ou use o botão `Teste aniversario` em `/admin/campaigns`.
5. Verifique no Prisma Studio:
- `CampaignRecipient.queuedAt`
- `CampaignRecipient.messagePreview`
- `MessageQueue.status = QUEUED`
- `WhatsAppMessageLog.status = SIMULATED_SENT` depois do worker
6. Rode `npm run worker:outgoing` para processar localmente sem chamar a Meta.

Guardrails do modo teste:

- limite local de até `3` mensagens por execução
- bloqueio fora do horário comercial `08:00-18:00`
- nenhuma chamada real para a Meta quando `WHATSAPP_DRY_RUN=true`

## Checklist operacional no admin

O app agora centraliza em `/admin` e `/admin/whatsapp`:

- status do WhatsApp
- webhook endpoint
- checklist visual de `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `META_APP_SECRET`, `APP_URL`, `REDIS_URL` e `OPENAI_API_KEY`
- status das filas
- heartbeat dos workers
- último evento recebido
- último envio realizado
- erros recentes
- modo atual: `Modo simulação` ou `Envio real`

## Contatos

Nova central operacional:

- `/admin/contacts`
- cadastro manual
- importação CSV
- busca por nome, telefone ou código
- visualização de opt-in/opt-out
- seleção direta para campanhas por query string

Formato CSV suportado:

```text
name;phone;tags;optIn;birthday;status
Maria Teste;+5592999991111;lideranca,teste;true;1988-05-10;ACTIVE
```

## Painel admin

Navegação principal:

- `/admin`
- `/admin/conversations`
- `/admin/human-queue`
- `/admin/templates`
- `/admin/campaigns`
- `/admin/ai`
- `/admin/whatsapp`
- `/admin/settings`

Módulos legados de demandas e categorias foram mantidos por compatibilidade e convivem com o fluxo atual.

## Deploy recomendado

Topologia recomendada:

1. aplicação web na Vercel
2. PostgreSQL externo
3. Redis no Railway, Upstash ou equivalente
4. worker `incoming` em serviço dedicado
5. worker `outgoing` em serviço dedicado
6. worker `human` em serviço dedicado

### Vercel

- publicar apenas a aplicação web
- configurar todas as variáveis de ambiente
- apontar `APP_URL` para a URL pública

### Workers

Cada serviço pode rodar um comando:

```bash
npm run worker:incoming
npm run worker:outgoing
npm run worker:human
```

Todos devem compartilhar:

- `DATABASE_URL`
- `REDIS_URL`
- `OPENAI_API_KEY`
- variáveis do WhatsApp

## Comandos úteis

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run db:migrate
npm run db:generate
npm run db:seed
npx prisma validate
npx prisma generate
```

## Validação antes de publicar

```bash
npx prisma validate
npx prisma generate
npm run build
```

Se quiser validar lint também:

```bash
npm run lint
```

## Teste ponta a ponta

1. Configure a URL pública do webhook na Meta.
2. Envie uma mensagem real para o número conectado.
3. Verifique se o webhook retorna `200` rapidamente.
4. Verifique se surge um registro em `MessageQueue`.
5. Verifique se o worker de entrada cria ou atualiza a conversa.
6. Verifique se o worker de saída envia mensagem ou escala para humano.
7. Verifique campanhas e logs em:
- `Campaign`
- `CampaignRecipient`
- `WhatsAppTemplate`
- `WhatsAppMessageLog`
- `OptOutEvent`
- `ComplianceLog`
- `AIAction`
- `HumanTakeover`

### Dry-run seguro

1. Configure `NEXT_PUBLIC_DEMO_MODE=false`.
2. Defina `WHATSAPP_DRY_RUN=true`.
3. Rode a migration pendente e o seed.
4. Suba `npm run dev`.
5. Rode `npm run worker:outgoing` ou `npm run worker:all`.
6. Cadastre um contato próprio em `/admin/contacts`.
7. Vá para `/admin/campaigns`.
8. Escolha um template aprovado.
9. Selecione manualmente o contato.
10. Revise destinatários e confirme o preflight.
11. Inicie a operação.
12. Verifique `SIMULATED_SENT` em `WhatsAppMessageLog`.

### Primeiro teste real

1. Defina `WHATSAPP_DRY_RUN=false`.
2. Use apenas 1 contato próprio.
3. Confirme `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `META_APP_SECRET`, `APP_URL`, `REDIS_URL` e `OPENAI_API_KEY`.
4. Rode `npm run worker:outgoing` e confirme heartbeat no admin.
5. Use template aprovado na Meta.
6. Revise o preflight e confirme o envio.
7. Acompanhe em `/admin/campaigns/operations`.
8. Valide status `SENT` ou `FAILED`.
9. Se falhar, revise o erro da Meta no admin e em `WhatsAppMessageLog`.

### Comandos de validação usados neste ajuste

```bash
npx prisma validate
npx prisma generate
npx prisma migrate status
npm run typecheck
npm run build
```

## Status atual

O projeto já possui:

- autenticação admin funcional
- seed inicial pronto para subir ambiente
- painel admin navegável
- webhook e filas de processamento
- atendimento assistido por IA
- templates oficiais
- módulo de campanhas com configuração inicial no admin
DEPLOY_MARKER_qua 20 mai 2026 03:31:45 -04

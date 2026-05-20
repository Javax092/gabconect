# Gabinete Conectado
## Documentação Estratégica Atualizada de Produto, Arquitetura, Operação e Posicionamento

## Visão executiva

### O que o sistema faz hoje
O Gabinete Conectado opera duas frentes críticas do WhatsApp institucional dentro da mesma arquitetura:

- atendimento supervisionado de conversas inbound
- campanhas oficiais supervisionadas com seleção manual de destinatários

O produto recebe mensagens, classifica risco e intenção, decide quando a IA pode ajudar, quando o humano deve assumir e quando o compliance deve bloquear ou cadenciar. Na frente de campanhas, ele não trata envio como “disparo”. Trata como operação controlada, com escolha de template oficial, seleção manual de contatos, preview operacional, preview individual por contato, confirmação explícita, enfileiramento supervisionado, worker dedicado e acompanhamento em tempo real.

Hoje, o sistema já funciona como uma infraestrutura operacional real para WhatsApp institucional, com rastreabilidade e estados explícitos de operação.

### Como funciona o atendimento
O atendimento entra pela WhatsApp Cloud API, passa pelo webhook, segue para fila de entrada, é analisado por compliance, roteamento de intenção e IA supervisionada, e então pode:

- receber resposta assistiva
- receber template aprovado
- ser pausado e escalado para humano
- ser bloqueado por risco ou contexto inadequado

Nada relevante acontece de forma invisível. A conversa mantém estado, fila atual, risco, decisão anterior da IA, takeover humano e histórico operacional.

### Como funciona o envio de campanhas
Campanha no Gabinete Conectado não é um POST que dispara mensagens. A rota de campanha:

- cria a operação
- valida template aprovado
- recebe seleção manual de contatos
- materializa preview de audiência
- exige revisão humana explícita
- roda preflight operacional
- cria `CampaignRecipient`
- enfileira `MessageQueue` para `outgoing-message`

O envio real continua fora da rota HTTP, exclusivamente no `worker:outgoing`.

### Como funciona a operação supervisionada
O operador trabalha sobre uma camada de decisão e execução governada. Antes de uma campanha sair:

- a audiência é visível
- os contatos elegíveis e bloqueados são identificados
- cada contato tem preview individual da mensagem
- o modo de execução é claro: simulação ou real
- o atraso humanizado é conhecido
- o limite diário é conhecido
- a revisão precisa ser confirmada

Depois do início:

- a fila é acompanhada
- a timeline é atualizada
- o status de cada destinatário evolui
- falhas aparecem com rastreio
- opt-out e inelegibilidade são refletidos operacionalmente

### Por que isso é diferente de disparador comum
Porque o produto não foi desenhado para “enviar mensagens”. Ele foi desenhado para governar o envio.

Um disparador comum trabalha com lista + template + clique. O Gabinete Conectado trabalha com:

- audiência selecionada e revisada
- elegibilidade operacional
- `CampaignRecipient` por contato
- `MessageQueue` por envio
- worker independente
- compliance antes do envio
- delay humano
- timeline operacional
- simulação sem risco
- observabilidade após o envio

Isso é diferença de categoria, não só de interface.

## Novas funcionalidades

### Seleção manual de contatos
A seleção manual trouxe um ganho importante de governança. A campanha deixou de depender apenas de audiência implícita por tags e passou a aceitar uma lista explicitamente escolhida pelo operador.

Na prática, o operador pode:

- buscar por nome
- buscar por telefone
- buscar por código
- filtrar por tags
- filtrar por opt-in
- filtrar por aniversário
- filtrar por status
- ordenar por nome
- ordenar por código
- ordenar por data de importação
- selecionar individualmente
- selecionar todos da página
- remover selecionados antes de criar a campanha

Isso muda a natureza do envio. A campanha deixa de ser “público presumido” e passa a ser “audiência operacionalmente confirmada”.

### Preview operacional de audiência
Antes de iniciar a campanha, o sistema mostra um quadro operacional da audiência, deixando claro:

- total selecionado
- elegíveis
- bloqueados
- sem opt-in
- sem telefone
- opt-out
- já enfileirados, quando aplicável

Esse preview reduz erro de operação porque transforma a audiência em algo auditável antes do envio.

### Preview individual por contato
Cada contato pode ser revisado com sua mensagem renderizada individualmente.

Isso é estratégico por três motivos:

1. evita envio cego
2. melhora confiabilidade da campanha
3. permite validação humana do conteúdo real que cada pessoa receberá

Esse recurso é especialmente relevante em contextos institucionais, onde o risco não está só no template em si, mas em quem vai receber, em que contexto e com qual personalização.

### Confirmação operacional explícita
O sistema exige confirmação manual de que os destinatários foram revisados.

Essa pequena etapa muda o padrão de responsabilidade operacional:

- cria momento explícito de revisão
- evita start impulsivo
- fortalece governança
- aumenta previsibilidade

### Timeline operacional
A timeline registra a campanha como processo vivo. Ela consolida:

- preflight concluído
- revisão solicitada
- destinatário enfileirado
- delay aplicado
- job em processamento
- envio simulado
- envio aceito
- falha de envio
- pausas preventivas

Isso transforma a campanha em uma trilha operacional verificável.

### Fila de envio supervisionada
Cada envio sai por fila, não por execução direta na rota. Isso significa:

- cadência controlada
- rastreio por job
- retries
- status persistidos
- isolamento entre preparação e execução

### Worker de saída
O `worker:outgoing` é quem faz a execução real:

- consome a fila
- respeita o `scheduledFor`
- revalida o contexto necessário
- decide entre simulação e envio real
- chama a Meta quando aplicável
- atualiza statuses de recipient, queue e logs

Ele é a garantia de que o envio permanece desacoplado do HTTP.

### Modo simulação
Com `WHATSAPP_DRY_RUN=true`, o sistema:

- mantém o pipeline completo
- processa a fila
- gera eventos e logs
- atualiza `CampaignRecipient`
- marca `MessageQueue` e `WhatsAppMessageLog` como simulados
- não chama a Meta

Isso permite homologação, treino, demonstração e validação sem risco.

### Delay humano
O delay humano não é cosmético. Ele é parte da estratégia operacional:

- distribui a cadência
- evita comportamento agressivo
- protege reputação do número
- reduz padrão mecânico
- melhora pacing supervisionado

### Acompanhamento operacional
Depois do início, o painel de operações permite ver:

- quem está em fila
- quem está enviando
- quem foi enviado
- quem falhou
- quem foi pulado
- quem caiu em opt-out
- quem foi apenas simulado

Isso leva o time de “início de campanha” para “operação contínua de campanha”.

## Fluxo de campanhas ponta a ponta

### 1. Criação da campanha
A campanha nasce em `/admin/campaigns`, associada a:

- nome
- template oficial aprovado
- parâmetros operacionais
- filtros contextuais
- lista de contatos selecionados manualmente

Os `selectedContactIds` são persistidos em `CampaignAudienceConfig`, o que mantém a seleção dentro do modelo da campanha, sem sistema paralelo.

### 2. Escolha do template
O sistema só permite campanha com template aprovado pela Meta. Isso já impõe um primeiro filtro de segurança e compliance.

### 3. Seleção de destinatários
O operador monta a audiência manualmente, usando busca, filtros e ordenação.

Essa seleção não dispara nada. Ela apenas define o universo de trabalho da campanha.

### 4. Revisão operacional
Antes do start:

- a audiência é revisada
- elegibilidade é calculada
- bloqueios são mostrados
- o preview individual é exibido
- o modo atual é exposto
- o delay humano é mostrado
- o limite diário é mostrado

### 5. Validação de compliance e preflight
Ao abrir a revisão, o sistema executa preflight de risco da campanha, levando em conta:

- saúde e reputação do número
- warmup
- volume
- sensibilidade da mensagem
- sinais operacionais recentes
- opt-outs e falhas recentes

Se necessário, a campanha pode:

- seguir
- exigir revisão humana
- ser pausada por risco

### 6. Criação de `CampaignRecipient`
Com a campanha confirmada, o sistema materializa cada destinatário selecionado como uma unidade operacional própria em `CampaignRecipient`.

Isso resolve vários problemas clássicos de disparadores simples:

- evita duplicidade por `campaignId + contactId`
- registra preview por destinatário
- separa elegível de inelegível
- permite status individual
- permite auditoria por contato

### 7. Enfileiramento
Depois disso, o sistema cria registros em `MessageQueue` para a fila `outgoing-message`.

Cada recipient elegível gera job com:

- campanha
- recipient
- contato
- template
- texto personalizado
- horário previsto

### 8. Processamento do worker
O `worker:outgoing` retira o job da fila e executa o envio supervisionado.

Se o modo estiver em simulação:

- não chama a Meta
- marca como simulado

Se o modo estiver em real:

- chama a WhatsApp Cloud API oficial
- grava `providerMessageId`
- persiste status aceito ou falho

### 9. Atualização de status
Ao longo do processamento, são atualizados:

- `CampaignRecipient.status`
- `MessageQueue.status`
- `WhatsAppMessageLog.status`
- contadores da campanha
- estado operacional
- eventos da timeline

### 10. Timeline e operação em tempo real
Tudo isso aparece na operação em tempo real, com visão sobre fila, recipient, timeline, risco e throughput.

## Valor operacional das melhorias

### Como reduzem risco
As novas funcionalidades reduzem risco porque retiram o envio do campo do improviso.

Risco cai quando:

- a audiência é revisada antes do envio
- o contato inelegível é visto antes de virar erro
- o preview individual evita conteúdo mal direcionado
- a confirmação humana impede start automático
- a fila controla cadência
- o worker centraliza envio

### Como evitam disparos errados
O sistema agora explicita, antes do envio:

- quem vai receber
- quem não deveria receber
- por que alguém está bloqueado
- qual texto cada um receberá

Isso reduz drasticamente chance de campanha sair para base errada, contato sem opt-in ou contato já inelegível.

### Como aumentam controle
Controle aumenta porque a operação deixa de ser agregada e passa a ser unitária por recipient, por queue record e por evento de timeline.

### Como permitem auditoria
É possível auditar:

- quem foi selecionado
- quem foi considerado elegível
- quem foi bloqueado
- qual preview foi gerado
- quando o job foi enfileirado
- quando processou
- qual foi o resultado

### Como ajudam escalabilidade
Escalabilidade não significa apenas volume. Significa crescer sem perder disciplina.

Com `CampaignRecipient`, `MessageQueue`, workers e timeline, o produto pode aumentar throughput mantendo controle.

### Como profissionalizam a operação
O WhatsApp deixa de ser espaço manual difuso e vira ambiente de campanha com:

- revisão
- confirmação
- fila
- status
- rastros
- observabilidade

### Como protegem a reputação do número
As melhorias preservam a saúde do número porque combinam:

- templates oficiais
- opt-in
- horário comercial
- preflight
- delays
- revisão humana
- throughput adaptativo

### Como melhoram governança
Governança melhora porque toda campanha agora tem:

- audiência explícita
- revisão visível
- confirmação formal
- estados operacionais
- eventos rastreáveis

## Diferença para disparador genérico

### Em relação a disparador simples
Disparador simples trabalha com lote. O Gabinete Conectado trabalha com operação supervisionada por destinatário.

### Em relação a chatbot improvisado
Chatbot improvisado responde ou envia sem uma camada forte de governança. O Gabinete Conectado separa decisão, compliance, fila, envio e escalonamento humano.

### Em relação a automação básica
Automação básica tenta economizar clique. O Gabinete Conectado tenta reduzir risco operacional e aumentar previsibilidade.

### Em relação a CRM comum
CRM comum registra relacionamento. O Gabinete Conectado executa uma operação conversacional e de campanha com infraestrutura assíncrona, estados de fila, worker e timeline.

### O que o sistema possui e essas categorias normalmente não possuem

- governança operacional
- compliance ativo
- filas persistidas
- supervisão humana
- rastreabilidade por envio
- operação validada antes do start
- estados operacionais reais
- workers independentes

## Experiência do operador

### Como o operador usa o sistema
O operador parte da central de campanhas e não de uma planilha externa. Ele monta a operação dentro do próprio produto.

### Como seleciona contatos
No bloco `Selecionar destinatários`, o operador:

- pesquisa
- filtra
- ordena
- seleciona manualmente
- seleciona a página
- remove contatos antes de confirmar

### Como revisa destinatários
No painel `Destinatários selecionados`, o operador vê:

- nome
- telefone
- código
- status operacional
- preview individual

### Como acompanha campanhas
Depois do start, o acompanhamento ocorre no painel de operações de campanha, com visão contínua do pipeline.

### Como vê quem recebeu
O recipient evolui para status compatível com o processamento e isso aparece no painel operacional.

### Como vê falhas
Falhas são refletidas em status, logs e timeline. Isso é essencial para diagnóstico e correção.

### Como assume atendimento humano
Na frente de conversas, o operador continua podendo assumir manualmente casos sensíveis, pausar IA e trabalhar via fila humana.

### Como usa modo simulação
O operador pode executar a campanha inteira em ambiente de simulação para revisar processo, treinar equipe ou demonstrar a plataforma sem risco real.

## Visão técnica

### `CampaignRecipient`
`CampaignRecipient` é a unidade operacional de campanha por contato.

Ele permite:

- controle individual
- status por destinatário
- preview persistido
- rastreio de envio
- distinção entre elegível, falho, pulado e opt-out

Sem ele, a campanha seria apenas conceito agregado.

### `MessageQueue`
`MessageQueue` registra a camada persistida da fila. Ele conecta negócio e infraestrutura de execução.

Ele guarda:

- direção
- prioridade
- agendamento
- status
- retries
- erro
- payload operacional

### Redis
Redis sustenta a execução das filas em tempo real. É a base operacional do BullMQ para jobs atrasados, concorrência e desacoplamento.

### BullMQ
BullMQ fornece:

- fila de entrada
- fila de saída
- fila humana
- retries
- backoff
- concurrency control
- delay por job

### Workers
Os workers especializados separam:

- ingestão
- envio
- escalonamento humano

Esse desacoplamento é decisivo para estabilidade e escala.

### Filas
As filas permitem que a API prepare e que a infraestrutura execute depois. Esse padrão reduz acoplamento e melhora resiliência.

### Delay humano
O delay humano gera `scheduledFor` e protege a cadência operacional.

### Processamento assíncrono
O produto opera em modo assíncrono porque missão crítica não deve depender do ciclo de request web para executar mensagem, campanha ou escalonamento.

### Compliance
Compliance é camada executiva, não apenas consultiva. Ele pode liberar, cadenciar, escalar ou bloquear.

### Preview operacional
O preview é a superfície de validação antes do envio. Ele transforma dados de audiência em decisão operacional.

### Preflight
O preflight mede risco da campanha antes do start. É uma camada de segurança de campanha, distinta da verificação pontual de mensagem.

### Timeline
A timeline unifica o histórico operacional e traduz a campanha para linguagem auditável.

## Valor do preview operacional

### Por que é importante
O preview operacional é importante porque evita que a campanha dependa de confiança abstrata na base.

### O que ele impede

- erro de envio para contato errado
- envio cego para contato sem opt-in
- início de campanha com destinatários inválidos
- falta de revisão humana do texto renderizado

### O que ele entrega

- visão de elegíveis e bloqueados
- validação humana real
- mais confiabilidade
- mais segurança

## Valor do delay humano

### Proteção operacional
O delay humano cria folga operacional entre jobs e reduz agressividade do comportamento de envio.

### Cadência segura
O sistema não dispara tudo junto; ele distribui a saída.

### Estabilidade do número
Esse pacing ajuda a proteger a saúde do número e reduz exposição a comportamento que pareça excessivamente automatizado.

### Pacing supervisionado
O delay se torna uma ferramenta de disciplina operacional, não apenas um timer.

## Valor da timeline

### Rastreabilidade
A timeline mostra o percurso da campanha.

### Auditoria
Permite responder com precisão o que aconteceu, quando e por quê.

### Confiança operacional
Equipes passam a confiar mais no sistema quando o comportamento fica visível.

### Observabilidade
A operação deixa de ser caixa-preta.

### Análise de falhas
Falhas deixam de ser “não sei o que houve” e passam a ser eventos localizados.

### Acompanhamento em tempo real
A timeline serve também como instrumento de monitoramento contínuo.

## Valor do modo simulação

### Homologação
Permite validar campanha e fluxo sem chamar a Meta.

### Treinamento
Equipes podem treinar operação real sem risco real.

### Revisão de campanhas
Ajuda a revisar audiência, preview e pipeline antes de ir para produção.

### Demonstração comercial
É ideal para demonstração institucional premium, porque mostra operação completa sem necessidade de expor base real em produção.

### Validação sem risco
O pipeline funciona, mas sem dano reputacional ou operacional.

### Testes internos
Permite testar worker, fila e UX operacional sem comprometer o canal real.

## Arquitetura enterprise

### Arquitetura real

WhatsApp Cloud API  
→ Webhook  
→ `incoming-message` queue  
→ Compliance Layer  
→ Intent Detection  
→ AI Decision Engine  
→ Humanizer Layer  
→ `outgoing-message` queue  
→ `human-escalation` queue  
→ WhatsApp Sender

### Desacoplamento
Receber, decidir, enfileirar e enviar são responsabilidades distintas.

### Webhook leve
O webhook aceita, valida e encaminha. Ele não concentra execução pesada.

### Filas independentes
Cada fluxo crítico possui fila coerente com sua responsabilidade.

### Workers especializados
O sistema não depende do processo web para tudo. Há execução dedicada para cada domínio operacional.

### Tolerância a falhas
Com fila, retries, estados persistidos e logs, o produto tolera falhas melhor do que soluções sincronizadas.

### Escalabilidade
O crescimento pode acontecer por throughput, por worker e por operação, sem reescrever o modelo.

### Rastreabilidade
O stack registra decisão, fila, recipient, timeline e status de entrega.

### Observabilidade
O sistema foi desenhado para ser observado, não apenas para “funcionar”.

### Governança operacional
Governança aqui é resultado direto da arquitetura, não só política de uso.

## Visão comercial

### Como apresentar para clientes
Apresente o produto como infraestrutura institucional de WhatsApp, não como bot.

Formulação recomendada:

“Hoje o gabinete não usa apenas WhatsApp. Ele opera um sistema supervisionado de atendimento e campanhas sobre WhatsApp.”

### Como vender campanhas supervisionadas
O argumento central é simples:

“Não é disparo. É campanha governada.”

Explique que a plataforma:

- permite escolher destinatários
- mostra preview por contato
- confirma revisão
- opera com fila e worker
- acompanha status em tempo real

### Como justificar valor mensal
O valor mensal deve ser explicado como combinação de:

- operação institucional
- infraestrutura assíncrona
- supervisão humana
- compliance
- segurança reputacional
- previsibilidade de execução

Não é cobrança por “mensagens automáticas”. É cobrança por governança operacional de um canal crítico.

### Como explicar segurança
Segurança aqui significa:

- envio por template oficial
- opt-in respeitado
- fila supervisionada
- delay humano
- bloqueio de inelegíveis
- credenciais Meta exigidas em modo real
- envio apenas via worker

### Como mostrar profissionalismo
Mostre o painel operacional, a revisão de audiência, o preview individual, a timeline e o modo simulação. Esses elementos comunicam maturidade imediatamente.

### Como mostrar diferencial enterprise
O diferencial enterprise aparece quando o cliente percebe que:

- a operação tem estados
- a campanha tem trilha
- o envio não depende da interface
- o número é protegido
- o humano continua no controle

## Demonstração prática

### Roteiro recomendado

1. abrir `/admin/campaigns`
2. mostrar criação da campanha com template aprovado
3. entrar em `Selecionar destinatários`
4. aplicar filtros de audiência
5. buscar por nome, telefone e código
6. selecionar contatos manualmente
7. mostrar `Destinatários selecionados`
8. revisar preview individual de cada contato
9. criar a campanha
10. abrir `Revisar envio`
11. mostrar elegíveis, bloqueados, sem opt-in, sem telefone e opt-out
12. mostrar delay humano, limite diário e modo atual
13. confirmar revisão
14. iniciar envio supervisionado
15. redirecionar para `/admin/campaigns/operations`
16. acompanhar timeline
17. acompanhar statuses
18. mostrar diferença entre simulação e real

### Como narrar a demonstração
“Aqui o operador não dispara uma base. Ele monta, revisa e libera uma operação supervisionada. Cada contato é tratado como uma unidade operacional, com preview, elegibilidade e rastreabilidade.”

## Pitch para clientes e investidores

### Pitch curto
O Gabinete Conectado é uma plataforma enterprise para atendimento e campanhas supervisionadas no WhatsApp, com IA assistiva, compliance, fila operacional, preview por destinatário e controle em tempo real.

### Pitch médio
O Gabinete Conectado transforma o WhatsApp institucional em uma operação governada. Na entrada, organiza atendimento com IA supervisionada, compliance e takeover humano. Na saída, opera campanhas oficiais com seleção manual de contatos, preview operacional, preflight, fila supervisionada, delay humano, timeline e worker dedicado. O resultado é menos improviso, mais rastreabilidade e mais segurança operacional.

### Pitch executivo
Existe uma lacuna entre a relevância do WhatsApp institucional e a maturidade das ferramentas normalmente usadas para operá-lo. O Gabinete Conectado preenche essa lacuna com uma infraestrutura de missão crítica que une atendimento assistido, campanhas supervisionadas, execução assíncrona, compliance e governança operacional. Não é um chatbot e não é um disparador. É um sistema operacional institucional para relacionamento e comunicação via WhatsApp.

### Visão de mercado
O produto está posicionado em um espaço de alto valor entre:

- comunicação institucional digital
- operações conversacionais governadas
- campanhas supervisionadas em canais oficiais
- IA assistiva com controle humano

### Diferenciais

- seleção manual de audiência
- preview individual por contato
- `CampaignRecipient` por destinatário
- `MessageQueue` por job
- worker dedicado para envio
- simulação sem risco
- timeline operacional
- fila humana no atendimento

### Valor estratégico
O produto converte um canal normalmente informal em infraestrutura institucional confiável.

### Expansão futura
O caminho de expansão natural inclui:

- multiunidade ou multigabinete
- analytics executivos
- SLAs operacionais
- observabilidade avançada
- mais canais oficiais
- automações institucionais supervisionadas

## Conclusão estratégica

O Gabinete Conectado evoluiu de uma boa ideia de atendimento supervisionado para uma plataforma operacional completa de WhatsApp institucional.

Hoje ele combina, dentro da mesma arquitetura:

- atendimento inbound com IA supervisionada
- escalonamento humano
- compliance ativo
- campanhas oficiais
- seleção manual de contatos
- preview operacional de audiência
- preview individual por destinatário
- preflight
- delay humano
- fila supervisionada
- worker de envio
- simulação
- timeline em tempo real

Esse conjunto entrega algo raro no mercado: previsibilidade operacional sobre um canal crítico, mantendo o humano no comando e a infraestrutura responsável pela disciplina da execução.

Em termos de produto, isso o posiciona acima de chatbot, CRM adaptado, disparador simples ou automação improvisada.

Em termos de arquitetura, isso o qualifica como plataforma enterprise real.

Em termos comerciais, isso permite vender não apenas funcionalidade, mas governança, segurança e capacidade operacional institucional.

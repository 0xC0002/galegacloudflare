# Receptor contínuo Galega

Processo Node 22 sem dependências adicionais. Funciona com a aplicação publicada enquanto balcão e separação estão fechados. Implementação e testes locais concluídos; a instalação permanente na hospedagem ainda depende da conexão com a conta do proprietário.

Decisão de 29/10/2026: o proprietário adiou a assinatura até avaliar o piloto com pedidos reais. Não contratar agora. Prosseguir com o permissionamento da loja e piloto acompanhado com tela ativa, conforme `ROTEIRO-PRODUCAO.md`. Este serviço permanece preparado e inativo.

## Instalação preparada no Render

O arquivo `render.yaml`, na raiz, descreve somente um background worker Docker, uma réplica de 0,5 CPU/512 MB, sem domínio público, banco adicional ou implantação automática a cada commit. O website e o D1 permanecem no Sites. A definição não cria nem contrata o serviço sozinha.

Antes da criação: conectar a conta Render, confirmar acesso a uma fonte privada e revisada do código e autorizar o custo. O repositório interno do Sites não é uma URL pública para o Render; não enviar suas credenciais temporárias de Git. Se for usado um repositório exclusivo contendo somente esta pasta, ajustar `dockerfilePath` para `./Dockerfile` e `dockerContext` para `.` antes da criação.

O plano preparado é `0.5c-512mb`, anunciado a US$ 7/mês de processamento na consulta oficial de 29/10/2026, sujeito às condições de faturamento, tráfego e impostos da conta. Não foi criado serviço pago nem enviada credencial ao Render. A conta Hobby de workspace não torna o worker gratuito.

`GALEGA_SITE_URL` e `GALEGA_SITE_SERVICE_TOKEN` ficam em variáveis privadas da hospedagem; a definição usa `sync: false`, sem valores no código. Usar somente o acesso de serviço suportado para a origem exata do Site, sem mudar a audiência. Confirmar validade/revogação e como renovar esse acesso independentemente desta sessão antes da produção. Se o token for recusado, o serviço registra `access_denied` e não reporta saúde positiva.

Após a implantação permanente, verificar dois ciclos reais, novo pedido de teste e persistência/ACK sem depender das telas. Testar reabertura e reinício do worker. Só declarar instalado após essa verificação na hospedagem definitiva. Detalhes em `ROTEIRO-PRODUCAO.md`, na raiz.

## Funcionamento

O processo chama somente `POST /api/receiver/tick` na origem privada configurada. Aguarda pelo menos o intervalo publicado pelo iFood, sem sobrepor consultas; o bloqueio durável do servidor também coordena as telas. A API persiste eventos antes do ACK e reutiliza a recuperação existente de detalhes. O receptor não aceita, cancela, despacha ou responde negociações.

Cada ciclo registra JSON com duração, nível, falhas consecutivas, próxima tentativa e contadores de pendências. `level: warn` indica falha ou processamento pendente com erro. `polling_ok` significa consulta recente, não aprovação de um cenário comercial. Os registros não contêm credenciais, dados de clientes ou conteúdo de pedidos.

Falhas são tentadas novamente com intervalo de 30 a 60 segundos. Interrupção SIGTERM/SIGINT encerra o processo e cancela a espera. O supervisor da hospedagem deve reiniciá-lo após falhas. A tabela `receiver_health` e o relatório `POST /api/validation` permitem conferir execução recente, falhas e quantidade de ciclos. Servidor e processo conferem também o horário do último polling efetivo no iFood: HTTP 200 ou um registro de acesso recente, isoladamente, não comprovam o recebimento. Durante um bloqueio temporário sem polling recente, a chamada falha e o processo tenta novamente; bloqueios abandonados expiram pelo prazo da integração.

## Instalação na Railway

1. Conectar a integração Railway à conta do proprietário. Não criar assinatura paga nem alterar faturamento como parte da implantação sem a autorização correspondente.
2. Criar um serviço contínuo com diretório de origem `services/receiver` e o Dockerfile desse diretório. Não usar cron: consultas de pedidos precisam acontecer a cada 30 segundos.
3. Configurar `GALEGA_SITE_URL` com a origem HTTPS exata da publicação e `GALEGA_SITE_SERVICE_TOKEN` como segredo do serviço. A autorização é obtida pelo proprietário no acesso de serviço suportado pelo Sites; não é clientSecret do iFood nem identidade de um visitante. Não colocar o valor no Git, em arquivos, URLs, prompts ou argumentos de comandos. Renovar a configuração do serviço se o acesso for revogado ou expirar.
4. Manter uma réplica, sem suspensão por inatividade, com reinício automático. Não é necessário domínio público nem expor a porta do processo.
5. Executar dois ciclos, conferir polling/ACK e ler o relatório técnico sem abrir as telas. Interromper o processo e verificar o envelhecimento do registro de atividade. Só considerar instalado após confirmar a execução na hospedagem definitiva.

O programa inicia com `node receiver.mjs`; o Dockerfile define esse comando. A origem deve ser HTTPS, sem caminhos ou credenciais; HTTP só é aceito em localhost para testes locais. A credencial segue apenas no cabeçalho de autorização do Site configurado; redirecionamentos são recusados.

As ferramentas atuais do Sites oferecem tarefas de atualização, mas não documentam um agendador de polling de 30 segundos. Não foi criada uma tarefa de IA como substituto de um processo contínuo. O Site permanece privado.

## Testes

Na raiz: `node tests/background.mjs`. Verifica execução sem UI, persistência antes do ACK, coordenação de intervalo, falha de API, registro desatualizado, recuperação do processo, autorização privada, redirecionamentos bloqueados e logs sem dados de pedidos ou credenciais. A verificação usa HTTP simulado e D1 temporário; não equivale a um serviço permanente hospedado.

Referências: https://docs.railway.com/guides/cron-workers-queues e https://docs.railway.com/pricing/plans.

Render: https://render.com/docs/background-workers, https://render.com/docs/blueprint-spec, https://render.com/docs/compute-plans e https://render.com/pricing.

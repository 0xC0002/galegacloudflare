# Requisitos da Casa — laboratório

Estado: implementação no laboratório, com dados e acesso próprios. A aprovação nesta cópia não autoriza promoção para a aplicação da empresa.

## Isolamento e autorização

Todo desenvolvimento, migração e teste deve ocorrer no laboratório com banco, endereço e credenciais de teste próprios. A aplicação que opera Galega e Vovó deve permanecer exatamente como está. Bruno só autoriza trabalho na versão da empresa quando disser isso claramente. Não promover mudanças automaticamente após os testes.

O aplicativo antigo de imprimíveis não será utilizado.

## Requisito crítico: operação conjunta com iFood

Reafirmado por Bruno em 09/11/2026: o destino deste trabalho é um único sistema com os pedidos iFood da Galega/Vovó e os pedidos da Casa funcionando juntos. O recebimento, a impressão automática de 58mm pelo RawBT/GoldenSky, a chegada dos pedidos à Separação e todas as funções já operantes do iFood devem ser preservados. A separação não deve precisar de uma nova ação manual para imprimir.

Casa usa a mesma operação automática quando entra em preparo: Agora ao enviar; agendado ao atingir a antecedência definida; antecipado ao confirmar Adiantar preparo. Manter os horários prometidos e os controles contra perda, duplicação, impressão de versão antiga ou mistura de dados entre pedidos/lojas.

Antes de promover as novidades, validar no laboratório iFood das duas lojas e Casa chegando simultaneamente, sincronização entre aparelhos, notas completas, concorrência pela impressora e recuperação após fechar/reabrir a tela ou interromper a conexão com o RawBT. Conferir também o papel no tablet com a GoldenSky. Um teste de Casa isolado, build ou simulação do driver não comprova sozinho essa operação conjunta. Registrar resultados e pendências, preparar um retorno à versão anterior e solicitar autorização explícita de Bruno para qualquer implantação na aplicação da empresa. Essa autorização ainda não foi dada.

## Operação e telas

- Balcão: visão geral de todos os pedidos, iFood e Casa, preservando os cartões, ações e impressão do fluxo iFood existente.
- Separação: somente pedidos liberados para produção, preservando itens, sabores, quantidades e observações. Casa e iFood compartilham A separar/Separados; a separação pode Marcar como separado e imprimir/reimprimir em ambos. Sem edição de pedido, cancelamento, chat ou ciência de alterações no fluxo Casa.
- Casa: pedidos cadastrados pelo atendente do WhatsApp. Marcelo usa essa guia para acompanhar, imprimir, editar, finalizar e tratar alterações/cancelamentos.
- Atendente: conversa com o cliente no WhatsApp, registra o pedido no sistema e acompanha o retorno do Marcelo. Não há leitura automática do WhatsApp definida.
- Não implementar integração 99Food nesta etapa. Ela permanece futura.

## Cadastro e agendamento

- Escolhas independentes: Retirada/Entrega e Agora/Agendado.
- Agora: checkbox ao lado do horário. Ao marcar e enviar, o pedido entra imediatamente na Casa/Balcão e na separação, com uma única comanda na fila automática existente. Não aguarda data, horário ou antecedência de um agendamento.
- Agendado: visível imediatamente na Casa; liberado para produção no horário calculado.
- Entrega: horário combinado é chegada à casa do cliente. Retirada: horário combinado é estar pronto na loja.
- Cada novo pedido agendado começa com antecedência de 60 minutos. Atendente e Marcelo podem alterar o valor por pedido, inclusive para um intervalo mais curto na retirada. O formulário mostra o horário calculado de preparo e impressão. A escolha específica do pedido não é substituída por configurações gerais antigas.
- Se já estiver dentro da janela de preparo, liberar imediatamente sem mudar silenciosamente o horário combinado.
- Referência de data e hora da operação: America/Sao_Paulo.
- Casa recebe exclusivamente pedidos da Galega, sem campo Loja. Dados essenciais: nome/telefone, Entrega ou retirada, data/hora e antecedência quando agendado, itens/quantidades/sabores/complementos, total e pago/a cobrar. Endereço somente para entrega. Observações somente quando houver.
- Lista fixa, pronta sem cadastro: salgados — Bolinha de queijo, Travesseiro de pizza, Coxinha, Croquete de carne assada, Salsicha, Queijo com alho e Kibe; churros — Doce de leite e Chocolate. Selecionar todos já distribui a quantidade; sabores também podem ser selecionados individualmente. Remover ou desmarcar afeta somente aquele pedido, sem alterar a lista para outros pedidos ou aparelhos. Dividir igual redistribui entre os sabores restantes, sem perder unidades; quantidades continuam editáveis à mão. Não há Definir sabores para essas categorias. Pedidos anteriores conservam seus nomes e quantidades originais.
- O total começa vazio com indicação 0,00. Digitar 63 resulta em 63,00 ao sair do campo; aceitar vírgula, ponto decimal e colagem de valor brasileiro, sem acrescentar números ao valor antigo. Ao editar, selecionar o valor atual para substituição rápida.
- Não incluir campo de entregador.

## Casa e filtros

- Abrir em Hoje. Usar seleção de data, com atalhos Hoje/Amanhã e calendário.
- Listar somente o dia selecionado; referência é a data de entrega/retirada, não de criação.
- Ordenar pelo horário combinado, do mais cedo para o mais tarde. Pedidos Agora têm prioridade no dia atual.
- Mostrar horário de produção calculado, nome/ID, modalidade, conteúdo e dados operacionais necessários; evitar textos decorativos.
- Controles principais: Imprimir/Reimprimir, Editar, Finalizar. Cancelamento pode ficar no menu de edição.
- Marcelo e atendente têm Adiantar ao lado de Editar nos agendados. Um pop-up confirma o envio imediato à separação e à mesma fila automática de impressão. Preservar data/hora prometidas, impedir liberação duplicada e manter em preparo ao editar dados como telefone/endereço; mudança explícita de dia/horário pode reagendar.
- Chat e avisos urgentes permanecem disponíveis mesmo com outro dia selecionado.

## Sincronização e alterações

- Um único registro persistente do pedido, compartilhado entre atendente, Casa, Balcão e separação.
- Atualizações automáticas nos aparelhos conectados, sem recarregar manualmente. Não assumir entrega enquanto o destino está desconectado.
- Dia, horário, endereço, cliente, itens e cobranças editáveis; alterações recalculam a liberação pendente.
- Não sobrescrever silenciosamente a edição mais recente de outro usuário. Repetir um envio por falha de rede não pode duplicar o pedido.
- Remover/cancelar retira da fila operacional com histórico suficiente para informar a equipe.
- Antes de imprimir, consultar a versão atual. Depois de impresso/liberado, mudanças relevantes precisam de aviso/comanda identificada como alteração do mesmo pedido.
- Manual e automática precisam compartilhar o controle das comandas para evitar duplicação involuntária. Definir explicitamente antes da implementação o efeito de imprimir manualmente um agendado antes do horário; não antecipar produção ou gerar duas vias operacionais silenciosamente.
- Reutilizar os cuidados da impressão atual: fila serial, persistir antes do envio, resultado incerto exige conferência, recuperar sem replay automático. Envio ao driver não é confirmação de papel.
- Somente RawBT + Server for RawBT, transportando o JSON/ESC-POS na porta local 40213 como no sistema oficial. Preservar configurações RawBT, filas e resultados incertos. Manual em um toque; reimpressão deliberada pelo botão, sem nova confirmação e sem REIMPRESSAO no papel. Não duplicar uma via automática pendente. Preferências antigas de outro transporte são pausadas para teste físico RawBT, mantendo novos pedidos na fila.
- Comanda Casa: QR Code de WhatsApp gerado localmente com o telefone em formato internacional; não usar serviço externo de QR. Churros com sabor são linhas completas, por exemplo 50x Churros de Doce de leite; dois recheios são duas quantidades cuja soma é o total, sem repetir a quantidade do produto pai. A apresentação no cartão segue a mesma regra. Comandas iFood preservam o conteúdo anterior.
- Casa e iFood compartilham um som de caixa registradora mais longo e alto, autorizado por Bruno em 09/11; conservar avisos no Balcão e Separação. Manter a página ativa para buscar pedidos/agendamentos e iniciar envios.
- Impressão automática da Casa e do iFood na tela Separação, depois de configurar e ativar o RawBT. O perfil da pessoa não determina a fila: é a tela em uso. Casa/Balcão mantêm impressão manual para Marcelo e atendente. A comanda Casa de 58mm usa somente Salgados da Galega como título, cliente/telefone, entrega ou retirada no horário combinado, endereço, itens/sabores/observações, total e pago/a cobrar. Não imprimir metadados técnicos, versão, via de controle, antecedência, aviso TESTE ou cobranças repetidas na nota Casa. Preservar os avisos operacionais de alteração, reimpressão e cancelamento. Os detalhes técnicos continuam no sistema; comandas iFood não mudam.

## Cancelamento e retorno ao atendente

- Marcelo recebe o alerta na Casa e comunica fritura/embalagem; a separação não confirma ciência.
- Distinguir cancelamento registrado de ciência confirmada pelo responsável.
- Não perguntar se o pedido foi frito nem registrar essa resposta. Cancelamento pelo atendente deixa aviso com botão OK para Marcelo. Quando o próprio Marcelo cancela, sua ciência já fica registrada; não pedir confirmação dele novamente nem anunciar que ele será avisado.
- Pedido cancelado não pode seguir para entrega. Aviso pendente deve permanecer visível até ser tratado.
- Se a loja estiver desconectada ou sem confirmação, o atendente percebe a pendência e usa contato direto com Marcelo como contingência.
- Destino de produtos já fritos e tratativa com o cliente são decisões humanas; não automatizar aproveitamento, cobrança ou reembolso.

## Chat interno

- Uma conversa entre Marcelo e atendente, disponível na Casa e na tela do atendente. Não exibir na separação.
- Painel grande na lateral direita, aberto por padrão para Marcelo, leitura confortável, alto contraste e texto aproximadamente 18–20 px. Expandir/recolher; adaptar ao tablet na vertical.
- Texto, autor/horário, contador de não lidas, aviso sonoro e histórico persistente. Mostrar pendência de envio/conexão.
- Digitar @ e parte do nome sugere pedidos da Casa com nome, ID, data e horário, diferenciando nomes e clientes repetidos. Priorizar o dia selecionado.
- A referência abre o pedido correto e permanece ligada a ele após edições, preservando o contexto da conversa.
- Opções relacionadas discutidas: conversar sobre um pedido inserindo a referência e consultar mensagens daquele pedido.
- Mensagem de chat não altera automaticamente pedido, endereço, horário ou cancelamento; mudanças usam os controles do pedido.

## Pessoas e aparelhos

- Somente três perfis operacionais visíveis: Marcelo, Atendente e Separação. Não há guia ou perfil operacional Administrador.
- Marcelo e atendente acessam Balcão, Separação e Casa, com chat somente na Casa. Separação acessa Balcão e Separação, sem Casa nem chat interno. Ambos os perfis humanos podem cadastrar, editar, cancelar, finalizar e imprimir pedidos da Casa.
- Identidade autenticada da pessoa e identificação da estação são coisas diferentes. Um seletor local de nome não concede privilégios.
- Permissões verificadas no servidor; mensagens e alterações ligadas ao autor real.
- Acesso privado do Site por contas convidadas quando autorizado; não compartilhar a conta pessoal de Bruno. Acesso de funcionário ao app é diferente de permissão para editar/publicar seu código.
- Perfis verificados no servidor e estações vinculadas à conta. O proprietário pode simular os três perfis para testes; sua identidade técnica de proprietário permanece interna e a autoria real continua registrada.
- Instalação como PWA/atalho é opcional; os aparelhos devem acessar o mesmo ambiente autorizado, com internet. No tablet que imprime, configurar conscientemente o RawBT/Server for RawBT.

## Testes de aceitação futuros

1. Notebook e tablet: cadastro, edição, data/horário/endereço e sincronização nos dois lados.
2. Agendados de dias diferentes, imediatos, virada de dia e mudança de antecedência.
3. Impressão manual/automática, duplicação, falha antes/depois do envio e recuperação.
4. Edições concorrentes, cancelamento antes/depois de impresso e ciência simples do Marcelo, sem perguntas sobre fritura.
5. Chat, @ com nomes iguais e vários pedidos do mesmo cliente, mensagens durante mudança do filtro de data e perda de conexão.
6. Contas/perfis diferentes, estação de produção restrita e nenhuma ação contra lojas reais.

Resultados e limitações registrados em docs/VALIDACAO-CASA.md.

- Revisão de 09/11: blocos iFood e Casa sempre identificados na Separação, inclusive vazios; perfis Atendente, Separação e Marcelo sem sufixos. Nota Casa após pagamento: Feito com carinho, / com amor, Galega!, depois QR de WhatsApp. As demais melhorias e as funções iFood das duas lojas continuam obrigatórias. Nenhuma mudança no site da empresa.


## Casa do dia — notas para as bandejas do freezer

Terceira aba na Separação com o título Pedidos da casa para hoje, data atual e botão grande Imprimir tudo. Consultar a data corrente do servidor em America/Sao_Paulo, não o filtro da guia Casa; mostrar agendados e em preparo do dia, excluindo cancelados/finalizados, por promisedAt e número. O perfil Separação pode consultar/imprimir essa lista sem editar ou acessar Casa/chat.

Cada cópia diária é CONTROL independente. Imprimir tudo não inicia preparo, não marca separado e não elimina a automática do horário programado, inclusive se o pedido for editado depois. Alertas continuam válidos. RawBT usa fila serial com o mesmo bloqueio local liberado após cada nota, mantendo impressão operacional iFood/Casa entre notas do lote. Erro para o lote e informa progresso; não repetir sem conferência física. Desktop usa prévia única ordenada, mantendo QR e todo o conteúdo da nota.


## Impressão anterior, finalização e destino WhatsApp de teste

Casa do dia tem impressão individual usando a mesma rotina do lote. Mostrar no cartão a evidência de envio/impressão do dia e o horário, persistente entre aparelhos. Em notas posteriores, destacar NOTA IMPRESSA MAIS CEDO / CONFIRA A BANDEJA DO FREEZER / NAO SEPARE EM DUPLICIDADE. Sem confirmação do driver, usar VIA DO DIA JA ENVIADA; se o resultado for incerto, pedir conferência da impressão. Nota desatualizada exige conferir itens e quantidades. Uma impressão não marca a bandeja como separada. Nota repetida do dia e estado já marcado separado também recebem aviso, sem instrução para separar outra vez.

Separação pode finalizar Casa em preparo pelo Balcão, sem ganhar edição/cancelamento/Casa/chat. Todas as filas refletem FINISHED; a impressão automática agendada e o iFood continuam independentes.

WhatsApp: destinatário de teste armazenado em variável privada WHATSAPP_TEST_TO, consultável pelo proprietário no Aparelho. Ainda faltam a conta remetente conectada à API oficial da Meta e suas credenciais. Nenhuma mensagem enviada nem fluxo automático ativo. O futuro aviso deverá tratar entregas, indicar que o pedido entrou em preparo (não que está pronto), preservar identidade/revisão e evitar duplicação. Regras oficiais: https://whatsappbusiness.com/policy/ .


## Ajustes de 10/11 — cancelamento, freezer e histórico

Somente laboratório. Cancelamento de Casa usa folha exclusiva: CANCELAR PEDIDO DO [NOME] DO HORARIO [HORARIO PROMETIDO ORIGINAL], sem título, itens, valores ou QR. Letras ESC/POS com largura dupla/altura tripla, linhas de 16 colunas, texto sanitizado. Reutilizar fila CANCEL persistente com a mesma exclusão mútua RawBT; nenhuma alteração nas comandas iFood. Alarme distinto de urgência com cerca de 3,5 segundos ao receber cancelamento no Balcão ou Separação, deduplicado por pedido/revisão mesmo quando Marcelo já tem ciência. Requer Ativar som e volume de mídia do aparelho; não pode forçar som quando navegador/dispositivo o bloqueiam.

No rodapé da comanda posterior à via do dia confirmada, depois do QR, imprimir exclamação muito grande e a frase solicitada por Bruno: PEDIDO DA CASA JA SEPARADO PELA MANHA, CHECAR NO FREEZER. Essa é a orientação operacional do fluxo de freezer pedido por Bruno; não altera kitchenStage automaticamente nem comprova separação física. Priorizar conferência dos itens/quantidades se a revisão mudou e mensagem de conferência quando houve só envio sem confirmação ou resultado incerto. Não dar a mesma instrução para separar novamente numa segunda via do dia.

Finalização de Casa pelo perfil Separação aparece em Balcão > Histórico e Separação > Separados, com data/hora de finalização e impressão individual; sem voltar para A separar ou gerar nova produção. Histórico persistente separado da consulta ativa, até 500 encerrados recentes, evitando deslocar pedidos ativos. Cancelados aparecem no histórico do Balcão, sem aparecer em Separados. iFood conserva status e fluxo de impressão; tabs de histórico do Balcão são compartilhadas entre fontes na interface. Casa/chat/edição/cancelamento continuam restritos para perfil Separação.

WhatsApp permanece sem remetente conectado e sem envios. Destinatário de teste é mantido exclusivamente no ambiente privado. Bruno autorizou auxiliar a conexão oficial da Meta, ainda dependente do login do titular; não migrar/excluir WhatsApp Business ativo da loja nem contratar serviços durante o teste.


## Operação rápida e preservação iFood

Avisos de cancelamento da Casa visíveis em todos os perfis durante 15 minutos, com horário e X superior esquerdo por aparelho. Finalização direta e retorno dos finalizados ao andamento preservam bandeja, promessa e identidade, sem produzir outra comanda automática. Paleta Casa amarela/vermelha. WhatsApp contém a composição completa, total e estado do pagamento, com fila de partes para pedidos longos. Consultar AGENTS.md e docs/VALIDACAO-CASA-OPERACAO.md. Todas as mudanças permanecem restritas ao laboratório e à Casa; integração iFood e transporte RawBT preservados.

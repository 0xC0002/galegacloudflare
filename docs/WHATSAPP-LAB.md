# WhatsApp de entregas no laboratório

## Escopo e estado

Somente o laboratório Galega Casa. Bruno recebeu o template Hello World enviado manualmente pelo hub da Meta em 10/11/2026. Essa confirmação é da configuração de teste da Meta; não demonstra, sozinha, o envio automático pela aplicação. A conexão e a validação real da aplicação são registradas abaixo conforme o resultado observado.

O destino anterior do ambiente privado WHATSAPP_TEST_TO é migrado uma única vez para a lista privada de entregadores; contatos nunca entram no código/documentação. A lista do banco passa a definir os próximos envios, inclusive quando vazia. Nenhuma alteração no site, banco, impressão, credenciais ou acesso da produção Galega/Vovó. Nenhuma contratação, cobrança habilitada, migração ou exclusão do número WhatsApp Business da loja.

## Conexão e segurança

Aparelho → WhatsApp de entregas, apenas proprietário real, inclusive ao simular Marcelo/Separação. O formulário recebe ID do número e token da Meta; valida em graph.facebook.com/v25.0 com Authorization, nunca na URL. Requisições usam redirect=manual e recusam redirecionamento: o Worker não aceita redirect=error e não deve encaminhar Authorization a outro host. Token não volta nas consultas e é criptografado com AES-GCM, nonce aleatório e ID do número autenticado; a chave WHATSAPP_CONFIG_KEY fica no ambiente secreto do Sites. O formulário não persiste token em localStorage/sessionStorage nem o publica em HTML/JS. Atualização do mesmo remetente mantém a pausa e a data-base. Troca de remetente pausa os avisos.

POSTs exigem identidade, origem válida e JSON. Destinatários vêm exclusivamente da lista autorizada no servidor. O endpoint de envio não aceita um telefone arbitrário fora dela. Erros da Meta são traduzidos de códigos conhecidos; corpo bruto, token e cabeçalho Authorization não são registrados/devolvidos. Os corpos dos avisos contêm dados operacionais privados, no banco privado do laboratório.

## Fluxo

Uma consulta independente a /api/whatsapp/tick a cada 4 segundos, com tela aberta, reconcilia e envia no máximo um aviso por vez. Não espera a impressão, não chama o RawBT, não altera status de pedidos e não entra no caminho de /api/house ou iFood. Falha nessa consulta não bloqueia o recebimento, o som nem a fila da impressora.

Casa DELIVERY em PREPARING após ativação gera aviso com pedido, cliente, horário prometido, endereço e telefone, identificado EM PREPARO. NOW e Adiantar usam a mesma regra; agendados só entram após liberação. Ativação não dispara o estoque de pedidos anteriores já em preparo. Casa do dia/freezer e pedidos novos para retirada não geram aviso.

Revisão/status identificam cada evento. Antes do POST, o banco revalida os dados atuais. Alteração de endereço, cliente, telefone, promessa ou entrega/retirada de um pedido já informado gera correção; reagendamento avisa para aguardar e uma liberação posterior avisa novamente. Cancelamento já informado gera CANCELADO — NÃO ENTREGAR. Mudança em itens, observações, valor ou pagamento também gera correção; salvar os mesmos dados não repete a mensagem. Finalização invalida avisos ainda não enviados.

Lease global persistente impede dois tablets de dispararem a mesma fila simultaneamente. Uma alteração posterior ao início do POST não pode recolher uma mensagem já em trânsito; a consulta seguinte encaminha a correção. Não há promessa de entrega exatamente uma vez por um transporte externo.

Estados: QUEUED → SENDING → SENT, BLOCKED ou REVIEW. Resposta com wamid representa aceite pela Meta. Sem webhook, não significa entregue/lido. Timeout, erro de transporte, 5xx ou resposta malformada ficam em REVIEW sem replay silencioso. Proprietário confere o WhatsApp antes de marcar recebido ou repetir. Recusa explícita da Meta fica em BLOCKED; tentativa manual após corrigir a causa. Ao pausar, pedidos pendentes são invalidados, sem interromper um POST já em andamento.

Enviar pedido fictício usa o mesmo transporte e um requestId persistente. Se outro aparelho está enviando, o teste permanece na fila e sai na próxima consulta, mesmo com avisos automáticos pausados. Dados do exemplo são fictícios.

## Limites para uso contínuo

Texto livre depende de mensagem do destinatário nas últimas 24 horas. Receber Hello World não abre a janela por si só. Fora dela, é necessário template aprovado; isso não está implementado nesta etapa. Token gerado no hub é temporário: renovar quando expirar. Uso real exige configuração estável do remetente, templates/opt-in adequados, webhook para entrega/falha e execução permanente se for necessário receber com todas as telas fechadas. Esses passos não foram contratados nem promovidos à aplicação da empresa.

Referências oficiais: https://whatsappbusiness.com/policy/ ; https://www.postman.com/meta/whatsapp-business-platform/ ; versão v25.0 confirmada no código de envio exibido pelo próprio hub da Meta durante esta configuração.

## Validação

- tests/whatsapp.mjs: criptografia, autorização, destino privado, ausência de token no status/erros, fila e concorrência de oito aparelhos, NOW, agendado, Adiantar, edição, cancelamento, reprogramação, retirada, histórico anterior, timeout sem replay, token expirado, janela de conversa, amostra idempotente e pausa.
- Regressões: kitchen-house-integration, lab-isolation, house-cancellation-history, house-day, house-freezer, printer-recovery, auto-print, TypeScript e build de publicação.
- Prévia visual de Aparelho: formulário legível, sem credenciais preenchidas, destino fictício, metadados de conexão somente no proprietário.
- Impressora GoldenSky física/tablet: não acessíveis neste ambiente; testes de transporte e filas não substituem a conferência física.

### Resultado real da conexão

A primeira publicação da conexão (v12) foi concluída em 10/11/2026. A tentativa de validação no site retornou 503 antes de acessar a Meta: Cloudflare Workers não aceita redirect=error (confirmado no runtime Miniflare e na documentação oficial https://developers.cloudflare.com/workers/runtime-apis/request/). Corrigido para manual, mantendo a recusa de 3xx e o bloqueio de encaminhamento de Authorization. Teste adicional constrói as opções reais de GET/POST no runtime Worker. A correção foi publicada na v13. A Meta validou o número remetente no próprio site; a credencial foi salva criptografada e os avisos de teste foram ativados pelo proprietário autenticado. Um pedido fictício enviado pela aplicação foi aceito pela Meta em 10/11/2026 às 16:41:43 (America/Sao_Paulo).

O teste real do fluxo automático usou C0020, cliente TESTE WHATSAPP — NÃO PREPARAR, endereço e telefone fictícios. Foi cadastrado por Agora, entrou em PREPARING às 16:42:44 e a fila registrou exatamente um envio de preparo, aceito pela Meta com message_id às 16:42:46, sem erro. A conferência posterior por leitura do banco mostrou o mesmo registro SENT, sem repetição. C0020 já havia sido marcado SEPARATED e FINISHED em outra sessão; nenhum novo fechamento, cancelamento ou reenvio foi executado para esse pedido durante a conferência.

Na retomada, Aparelho mostrou Meta conectada e avisos automáticos de teste ligados. O histórico também continha avisos de preparo e cancelamento de testes posteriores aceitos pela Meta, sem erro registrado. Isso comprova aceite da API; entrega/leitura no telefone continua sem comprovação automática, pois não há webhook configurado. Não afirmar que chegou ao destinatário sem sua confirmação.

A última atualização deste registro altera apenas documentação. Preserva código operacional, configurações, remetente, destino privado, dados e acesso do laboratório. Nenhuma alteração na produção iFood Galega/Vovó. Próxima etapa para continuidade estável: validar recebimento no telefone e preparar templates aprovados, credencial duradoura e webhook conforme as necessidades do uso real. Não contratar nem promover à produção sem autorização.


## Detalhes completos e partes duráveis

Os novos avisos levam a composição completa da Casa, total e Pago/A cobrar. O fingerprint inclui itens, observações e pagamento: editar esses dados também gera correção. Churros aparecem por recheio, por exemplo 50x Churros de Doce de leite, sem duplicar a quantidade do produto pai. O botão de exemplo utiliza o mesmo formatador.

Corpos longos são divididos em partes identificadas por pedido, menores que o limite de 4096 caracteres. A fila persiste sent_parts, total_parts e manual_parts; cada tick envia no máximo uma parte. SENT significa todas as partes aceitas/confirmadas, sem inferir entrega do telefone. Timeout em uma parte mantém as anteriores confirmadas e exige conferência da parte atual; repetir não reenvia as anteriores. Confirmar manualmente uma parte permite continuar as seguintes sem classificar a confirmação manual como comprovante da Meta. Edição/cancelamento invalida partes antigas ainda não enviadas e emite os dados atuais; cancelamento tem prioridade.

Migrações 0013/0014 são aditivas: contadores de partes e índices de Casa, sem tocar credenciais, ativação, registros SENT anteriores ou tabelas iFood. Voltar para andamento não gera outro WhatsApp; edições posteriores continuam usando o fluxo de correção. Ver tests/house-whatsapp-migration.mjs e tests/whatsapp.mjs.


## Lista de entregadores e persistência do aparelho (11/11/2026)

Aparelho → Entregadores no WhatsApp está disponível em Atendente, Marcelo e Separação. Nome é opcional, celular brasileiro com DDD obrigatório; autorização do destinatário é exigida. Adicionar/remover atualiza a lista compartilhada com revisão otimista, sem apagar a conexão da Meta nem alterar credenciais. Limite conservado de cinco números no laboratório de testes. O cadastro no aplicativo NÃO substitui a lista de destinatários verificados do painel de teste da Meta: adicionar/verificar lá também. A mensagem é individual para cada telefone; não há atribuição de um entregador por pedido.

Migração 0015 é somente aditiva. Na primeira consulta, uma transação importa o destino privado anterior, fixa o destinatário dos avisos anteriores e marca a inicialização. Nunca restaurar implicitamente um número depois que a lista foi esvaziada. Avisos por pedido/revisão/status/telefone/geração mantêm contadores e deduplicação separados; um destinatário bloqueado não interrompe os outros. Recadastrar um número começa uma nova geração sem repetir histórico, partes aceitas ou resultado incerto. Remoção preserva histórico aceito, interrompe pendentes e aguarda eventual lease de envio em andamento.

O botão Enviar pedido fictício pede um destinatário ativo e usa um único pedido idempotente para ele; nunca dispara um teste indiscriminado para a lista. Sem webhook, Enviado à Meta continua sem comprovar entrega/leitura. Cada conversa tem sua própria janela de 24 horas; não foi implementado envio fora dela por modelos nem nova autenticação Meta.

Salvar aparelho deixou de depender de sessionStorage. Nome/perfil ficam em armazenamento permanente por conta neste navegador, depois da autorização do servidor. Uma nova sessão usa essa preferência, mesmo com URL antiga. Perfil Separação reabre a guia Separação. O seletor temporário não altera a configuração salva. Limpar os dados ou trocar de navegador requer salvar novamente. Não depende da conexão, token, telefone nem fila da impressora.

Validação: tests/whatsapp-recipients.mjs cobre lista compartilhada e perfis, normalização, autorização, duplicidade, concorrência, limite, envio individual, falha/repetição independente, correções/cancelamento por destinatário, ausência de histórico ao adicionar, remoção, recadastro e lista vazia. tests/station-preferences.mjs cobre nova sessão/URL antiga, isolamento por conta e falha de armazenamento. tests/house-whatsapp-migration.mjs conserva credencial cifrada/ativação/histórico e pedido Casa já notificado sem replay após a migração. Conferência real em navegador local: salvar Separação e abrir nova aba com URL antiga abriu Separação, nome e lista corretos.

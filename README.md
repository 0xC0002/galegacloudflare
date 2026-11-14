# Galega — Laboratório Casa · TESTE

Cópia independente da aplicação v5 para desenvolver as ideias da Casa e do chat. A aplicação da empresa permanece separada e não recebe alterações deste projeto.

## Estado do laboratório

- Casa, Balcão e Separação, com título e identificação de TESTE.
- Novo projeto, novo repositório e banco D1 próprio com as mesmas migrations de estrutura.
- Banco inicial vazio; sem pedidos reais, arquivos históricos, tokens ou configuração de produção copiados.
- Nenhuma credencial iFood configurada. A sincronização sem credenciais retorna a fila vazia e não chama o iFood.
- As rotas e o acesso ao banco passam por `lib/lab-env.ts`. O laboratório rejeita ambiente PRODUCTION, lojas reais e aplicativos diferentes do Teste C.
- Acesso inicialmente privado ao proprietário; nenhum funcionário convidado.
- Casa exclusivamente Galega, com pedidos imediatos/agendados, antecedência por pedido (inicial 60 minutos), edição, filtros por dia, impressão completa de 58mm e cancelamento com ciência simples, sem perguntas sobre fritura. Chat lateral persistente com @. Somente três perfis visíveis: Marcelo, Atendente e Separação. Requisitos em `docs/PLANO-CASA.md`; decisões e limites em `docs/VALIDACAO-CASA.md`.
- Balcão e Separação preservam o fluxo iFood existente para as duas lojas. Casa e iFood imprimem automaticamente na Separação; a guia Casa e o chat interno ficam disponíveis somente aos dois perfis humanos.
- Sete sabores fixos de salgados e dois de churros, prontos sem cadastro, com Selecionar todos, remoção por pedido, Dividir igual e quantidades manuais. Checkbox Agora ao lado do horário libera imediatamente para a mesma fila da Separação. Nota Casa simplificada, valor com máscara decimal e Adiantar confirmado por Marcelo/atendente, preservando a promessa ao cliente e a fila automática existente.
- Casa/iFood usam A separar/Separados em blocos identificados. RawBT + Server for RawBT, fila serial e teste físico antes de ativar a automática. Manual no Android em um toque, sem etapa de reimpressão nem cabeçalho técnico. QR de WhatsApp local ao final da nota Casa, churros sem quantidade duplicada, mensagem abaixo do pagamento e som de caixa registradora compartilhado. Promoção para a empresa exige autorização específica.

## Configuração futura do iFood de teste

Somente quando for solicitado testar a integração: configurar `IFOOD_CLIENT_ID` do Teste C e seu `IFOOD_CLIENT_SECRET` nos segredos deste laboratório. `IFOOD_ENVIRONMENT=TEST`, `IFOOD_PRODUCTION_ENABLED=false`; usar exclusivamente o `TEST_MERCHANT` declarado em `lib/ifood-config.ts`. Nunca configurar credenciais ou merchantIds de lojas reais. A configuração guardada já fornece os valores seguros de ambiente/loja quando ausentes.

O banco é provisionado para este projeto pelo vínculo lógico `DB`; não apontar para outro banco. O recebimento com todas as telas fechadas continua sem um receptor permanente. Não criar serviço pago ou automação de recepção por causa desta cópia.

## Desenvolvimento e validação

Usar os helpers do Sites para instalar dependências, preparar fonte, construir e publicar exclusivamente este projeto. Testes locais usam D1 temporário e respostas simuladas; não enviam comandos a lojas reais.

Verificações: `node tests/house.mjs`, `node tests/house-speed.mjs`, `node tests/casa-operation.mjs`, `node tests/lab-isolation.mjs`, `node tests/receiver.mjs`, `node tests/actions.mjs`, `node tests/printing.mjs`, `node tests/printer-recovery.mjs`, `node tests/installability.mjs` e TypeScript/build.

Os testes antigos de configuração e múltiplas lojas exercitam as bibliotecas com dados simulados de produção; isso não habilita produção nas rotas do laboratório. O controle de fronteira do laboratório é verificado separadamente em `tests/lab-isolation.mjs`.

## Impressora e aparelhos

As preferências do navegador pertencem ao novo endereço. A automática começa desativada e não herda a fila do tablet da empresa. Os testes de navegador usam pedidos fictícios e não enviam bytes à impressora real. Antes de um teste físico, selecionar conscientemente o endereço do laboratório e conferir a identificação LABORATÓRIO — TESTE na tela. A nota Casa foi simplificada a pedido de Bruno e não contém aviso de teste.

Não promover nenhuma versão à aplicação da empresa sem autorização explícita de Bruno.

- Separação → Casa do dia: pedidos ativos de hoje e impressão em lote cronológica para as bandejas do freezer. A impressão automática de produção permanece independente. Dia usa o horário do Rio; perfil Separação recebe somente a lista do dia, sem gestão/chat.

- Casa do dia imprime individualmente; histórico do freezer aparece nos cartões e destaca a nota posterior contra separação duplicada. O perfil Separação pode finalizar Casa em preparo pelo Balcão. Destinatário WhatsApp de teste privado cadastrado; conexão Meta e envio automático ainda pendentes.

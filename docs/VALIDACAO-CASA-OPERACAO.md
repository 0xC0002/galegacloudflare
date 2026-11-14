# Validação da operação Casa

## Escopo preservado

Somente o laboratório appgprj_6aed35aa6f0081919d4a92c9502e81f9. Nenhum endpoint operacional, variável, banco, acesso, repositório ou publicação da produção Galega/Vovó foi alterado. Mudanças de comportamento pertencem somente à Casa. tests/ifood-preserved.mjs confere SHA-256 de 30 arquivos críticos contra a base anterior do laboratório (05d46f602aca27f09d5af1f5e4352cae5e053ac1): API/eventos/pedidos/negociações, recibo, RawBT, impressora, som, identidade e CSS global são idênticos. O CSS novo usa seletores de Casa, sem alterar variáveis globais nem cartões iFood.

## Regras implementadas

- Cancelamento da Casa aparece em Atendente, Marcelo e Separação em consulta própria, sem expor chat/gestão à Separação. Horário vem do evento no servidor e é apresentado em America/Sao_Paulo. X no canto superior esquerdo fecha por aparelho, inclusive após trocar perfil/reabrir. Outro aparelho conserva o aviso. Expiração aos 15 minutos não apaga histórico nem descarta comanda CANCEL pendente.
- Finalizar da Casa envia direto, com bloqueio de clique simultâneo por pedido e requestId reutilizado após falha. Retorno ao andamento é exclusivo de FINISHED da Casa; preserva número, promessa, liberação e etapa da bandeja, sem produzir nova comanda nem WhatsApp. Impressão manual continua em um toque. Cancelados e iFood não recebem a ação.
- Cartões/formulários Casa usam vermelho/amarelo, com contraste de texto. Paleta iFood e fluxo RawBT permanecem iguais.
- WhatsApp leva itens, sabores, observações, total e pagamento; fila de partes conserva todas as informações em pedidos extensos e não repete partes aceitas. Resultado incerto exige conferência. Tokens/destino não são alterados.

## Testes automatizados

28 suítes: actions, auto-print, background, casa-operation, configuration, confirmation, house, house-cancellation-history, house-day, house-freezer, house-operations, house-speed, house-whatsapp-migration, ifood-preserved, installability, kitchen-house-integration, lab-isolation, load, multistore, negotiations, observability, observations, order-alerts, printer-recovery, printing, receiver, reconciliation e whatsapp. TypeScript e build também precisam passar antes da publicação.

Cobrem o ciclo completo de pedidos iFood, 202 assíncrono, ACK durável, deduplicação, recuperação, status externos, prazos, observações, cancelamentos/negociações, ambas as lojas, fila compartilhada com Casa e bytes RawBT. API e impressora simuladas: nenhuma nova chamada de teste enviada às lojas reais. Carga local: 120 ativos e 120 encerrados, consultas simultâneas, 40 comandos de separação e recepção concorrente; latências locais não são SLA da hospedagem.

## Conferência visual e de ações

Prévia local com dados fictícios: cancelamento por Atendente permaneceu na Separação, com horário e X à esquerda. Fechar e recarregar/trocar perfil manteve o aviso fechado só no navegador testado. No Balcão com perfil Separação, Finalizar levou o pedido ao Histórico sem diálogo; Voltar para andamento devolveu ao mesmo cartão sem diálogo. Cartões Casa conferidos com borda rgb(196,32,40) e status rgb(255,240,188). Impressão física na GoldenSky e volume no tablet não foram acessados; preservar a validação física antes de promover Casa à produção.

## Continuidade

Conferir docs/CONTINGENCIA-HOSPEDAGEM.md. Há um caminho de implantação independente com domínio/login/banco/segredos próprios e backups restauráveis, mas nenhuma segunda hospedagem foi contratada/configurada nesta etapa. O laboratório permanece separado da produção.


## Verificação de 11/11 — destinatários e aparelho

Trinta suítes passaram, incluindo as duas novas de destinatários e aparelho. TypeScript e build conferidos para a publicação. A migração de um banco já usado mantém a chave/token cifrado, a ativação e o pedido Casa já notificado, sem reenviar nem atingir dados iFood. Os 30 arquivos protegidos do iFood permanecem byte a byte na base aprovada. Nenhum pedido ou comando foi enviado às lojas reais.

No navegador local, cadastrar um entregador fictício e consultar em outra aba mostrou a lista compartilhada; removê-lo atualizou a outra tela. Salvar Tablet da Separação/Separação fechou o diálogo e abriu a guia correta. Uma nova aba, sem sessão anterior e com URL antiga de Atendente/Balcão, reabriu como Separação, com nome e lista corretos. Captura em docs/qa/casa-aparelho-entregadores.png usa SOMENTE dados fictícios do banco local, sem token. Não foi reiniciado o Galaxy Tab A7 Lite físico.

Os envios para múltiplos números e as falhas individuais foram testados com a API Meta simulada, sem mensagens a destinatários reais novos. A publicação conserva somente o número privado já autorizado. Restrições de lista de teste da Meta e janela de 24 horas continuam aplicáveis. Token/conexão real não foram substituídos nesta etapa.

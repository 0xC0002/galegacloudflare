# Continuidade fora do ChatGPT

## Estado atual

O laboratório é uma cópia isolada para testes e continua na mesma plataforma de hospedagem. Seu código está versionado no repositório do projeto; isso não configura, por si só, uma segunda hospedagem nem um backup externo do banco. A aplicação publicada não exige que este chat permaneça aberto, mas o acesso atual usa Sign in with ChatGPT e a infraestrutura Sites. Não se promete disponibilidade durante uma falha dessa plataforma. O PWA instalado continua precisando do servidor para sincronizar pedidos.

## Caminho proposto

A opção com menor distância técnica é uma conta Cloudflare controlada pela loja: o projeto já gera um Worker e usa D1/SQLite. Registrar domínio/URL da loja, exportar código e dados, configurar segredos de forma privada e substituir o login da plataforma por autenticação própria com os mesmos perfis. Para execução com telas fechadas, provisionar o receptor permanente com a mesma política de consulta aprovada; uma mudança de hospedagem isolada não instala esse receptor.

D1 permite exportar SQL e importar em outro banco. Preparar backups periódicos do banco e uma cópia externa do código, com restauração testada. Chaves de criptografia precisam de cópia segura separada; o SQL sozinho não recupera tokens criptografados sem a chave. Não enviar dados de clientes ou segredos ao Git. Definir frequência e responsável antes de afirmar recuperação pronta.

## Validação e virada

Primeiro publicar uma cópia de teste com dados fictícios e conferir login, perfis, data de São Paulo, sincronização entre dois aparelhos, agenda/Agora/Adiantar, WhatsApp e fila RawBT. Repetir os testes iFood de recebimento, persistência antes de ACK, deduplicação, status, negociações, ambas as lojas e comandas/GoldenSky físicas. Usar testes simulados e loja de teste antes de qualquer pedido real.

Na virada autorizada, manter um único receptor ativo por integração para evitar consumidores concorrentes e ACK em outro banco. Ajustar URLs de webhook/autorização quando aplicável e testar instalação/atalho no novo domínio, permissões da impressora e reconexão. Guardar o endereço/versão anterior, registrar o último evento persistido e ter um procedimento de retorno. Não desligar a operação atual durante a preparação.

Nada desse provisionamento externo foi executado nesta etapa: sem criação de conta, assinatura, migração de credenciais reais, cópia de dados da produção ou alteração no site que atende iFood.

Referências oficiais consultadas: https://developers.cloudflare.com/d1/best-practices/import-export-data/ ; https://developers.cloudflare.com/d1/reference/time-travel/ ; https://developers.cloudflare.com/workers/configuration/cron-triggers/ . Cron tem granularidade e propagação próprias; não trocar o polling atual por uma periodicidade diferente sem validar os requisitos da integração.

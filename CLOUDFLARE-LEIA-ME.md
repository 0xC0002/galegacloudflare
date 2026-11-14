# Galega — cópia independente para Cloudflare

Cópia de teste da versão 16 do Laboratório Casa, fonte 098197301783d33d76d2a4b96e3ef60d43800cd6. Não substitui, sincroniza com, para ou publica mudanças no laboratório ChatGPT nem na produção da Galega/Vovó.

## Estado desta entrega

Código preparado, compilado e validado localmente. Publicação externa pendente de autenticação do titular na Cloudflare. Nenhum serviço pago contratado, domínio alterado ou banco remoto criado nesta preparação. A aplicação só deve ser declarada hospedada depois do retorno real de wrangler deploy e das conferências da URL.

O laboratório existente continua em https://galega-laboratorio-casa.shot9.chatgpt.site. Seus pedidos, contatos e conexão da Meta não foram copiados. O banco desta cópia começa vazio. As duas aplicações não compartilham pedidos automaticamente.

## Acesso sem ChatGPT

O servidor usa usuário/senha da própria Galega e uma sessão privada lembrada por 30 dias. A criação do responsável é feita uma única vez em /primeiro-acesso, com código privado de inicialização; não existe cadastro público de funcionários. Depois, o responsável cria acessos Marcelo, Atendente ou Separação em Aparelho → Acessos ao sistema. Cada acesso mantém a mesma permissão operacional do perfil correspondente.

Salvar aparelho continua disponível. Ao entrar em outro navegador, é necessário autenticar com o acesso da Galega e escolher/salvar o perfil permitido. Minha conta permite alterar a própria senha e sair do aparelho. Desativação ou troca de senha revoga as sessões correspondentes.

A adaptação fica em worker/cloudflare.ts e lib/independent-auth*.ts. O adaptador interno de identidade do aplicativo foi preservado, mas recebe identidade somente após validação da sessão própria, sem chamada ao ChatGPT. Cabeçalhos de identidade enviados pelo cliente são descartados. Não há identidade de desenvolvimento automática.

## Preparar a máquina

Node.js 22.13 ou superior. Instalar dependências com:

```
npx --yes pnpm@11.25.0 install --frozen-lockfile
```

Autenticar a conta que hospedará o teste:

```
npx --yes wrangler@4.160.1 login --device --browser=false --scopes account:read user:read workers:write d1:write
```

O titular aprova a conexão no endereço oficial mostrado pela Cloudflare. Não enviar senha ou token pelo chat. Se houver mais de uma conta, informar explicitamente CLOUDFLARE_ACCOUNT_ID da conta escolhida.

Publicar:

```
npm run deploy:cloudflare
```

O script valida o escopo de teste, cria um Worker/banco com nome exclusivo, aplica as migrações somente nesse banco, compila e publica, configura segredos novos e confere o bloqueio de acesso anônimo. Não cria assinatura paga nem altera DNS. Interrupção depois de criar recurso deve ser resolvida conferindo o destino registrado, sem apagar ou criar recursos por suposição.

A chave de autenticação e a chave de criptografia Meta não são sobrescritas em republicações. O código de primeiro acesso é gravado somente em .cloudflare-onboarding.json, privado e excluído deste pacote. Após concluir a inicialização, ele não permite criar outro responsável. Não guardar esse arquivo em Git ou incluí-lo em backups de código compartilhados.

A aplicação recebe a URL real workers.dev retornada pela publicação. Um domínio personalizado é opcional e não foi configurado. O plano gratuito pode ser usado para a validação inicial; a operação diária depende dos limites e do consumo medido. O recebimento contínuo com telas fechadas não foi habilitado nesta cópia.

## Banco e integrações

As migrações 0000–0015 são as da cópia aprovada. 0016 acrescenta somente tabelas de acesso independente. Nenhuma consulta deste projeto escreve nos bancos anteriores.

Nenhuma credencial iFood ou Meta acompanha a cópia. Não configurar o mesmo aplicativo de polling iFood em dois consumidores que devam conservar históricos independentes: o ACK de um pode consumir os eventos esperados pelo outro. Para testar iFood aqui, preparar credencial/loja de teste isoladas. Não usar credenciais da produção Galega/Vovó.

As rotinas operacionais e os bytes RawBT continuam protegidos por tests/ifood-preserved.mjs. A impressão automática no dispositivo novo exige configurar/testar RawBT nessa origem e validar fisicamente na GoldenSky 58 mm antes de qualquer promoção. Pedidos de teste não devem ser usados na operação da loja.

WhatsApp começa sem remetente/destinatários e sem avisos habilitados. A conexão pode ser feita pelo responsável quando houver autorização para esse ambiente. Não há envio de mensagem real nesta entrega.

## Verificações realizadas

31 suítes passaram: 28 das rotinas preservadas e três específicas de Cloudflare/acesso. Os testes originais que verificam identidade própria do Site ChatGPT foram substituídos por verificações específicas da cópia externa, sem alterar sua base.

- Login, inicialização concorrente com um único responsável, perfis, sessões duráveis, senha com salt/pepper, ausência de senha/token em respostas e armazenamento de sessão por digest.
- Rejeição de cabeçalhos de identidade falsos, origem cruzada, usuário sem sessão, acesso indevido de Separação e repetição de tentativas.
- Teste HTTP do Worker compilado no runtime workerd: criar acesso, abrir pedidos, criar Casa, visualizar na segunda sessão, gerar a fila de impressão, marcar separado e sair sem derrubar outra sessão. Nenhuma chamada externa ao ChatGPT, Meta ou iFood foi permitida nesse teste.
- Eventos/ACK, negociações, observações, Galega e Vovó, Casa, chats, horários, impressão conjunta, reabertura e recuperação RawBT.
- TypeScript, compilação completa e wrangler deploy --dry-run: 65 módulos e cerca de 297 KiB compactados; configuração compatível com a CLI atual, sem segredos locais no upload.
- Os 30 arquivos críticos permanecem idênticos à base aprovada. O repositório do laboratório ChatGPT permaneceu no mesmo commit e sem alterações.

A instalação/volume/impressão físicos no Galaxy Tab A7 Lite e GoldenSky não foram acessados. A chegada de eventos reais e o envio Meta nesta nova hospedagem dependem de configuração e testes próprios após a publicação. Esta entrega não promove o laboratório à produção e não repete homologação por conta própria.

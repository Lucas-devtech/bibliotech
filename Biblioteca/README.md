# Biblio Tech — versão atualizada

Projeto atualizado a partir do ZIP enviado, preservando as telas e operações existentes de cadastro de livros, usuários, empréstimos e devoluções.

## O que foi atualizado
- Tela `movimentacao.html` renomeada para `emprestimos.html`; menu atualizado para **🔄 Empréstimos**.
- A função de renderização passou a ser `renderEmprestimos`; a função antiga permanece como alias de compatibilidade.
- A tela de empréstimos inclui leitura de ISBN pela câmera (navegadores compatíveis com `BarcodeDetector`), pesquisa manual como alternativa e visualização/registro de fila de reservas.
- API de reservas com ordenação FIFO (data/hora da reserva); ao devolver um livro, a primeira reserva ativa é marcada como disponível.
- PWA com `manifest.webmanifest`, `sw.js`, ícones 192/512, registro do Service Worker e botão de instalação.
- Autenticação administrativa por chave no servidor. A API protege operações de empréstimo e reserva; a tela não depende apenas de ocultar o botão.
- Configuração inicial para execução local e deploy Vercel.

## 1. Instalação local
1. Instale Node.js 20 ou superior.
2. Copie `.env.example` para `.env`.
3. Preencha `DATABASE_URL` com a URL de conexão do Neon.
4. Defina `ADMIN_ACCESS_KEY` com uma chave longa e exclusiva.
5. Execute `npm install` e depois `npm start`.
6. Acesse `http://localhost:3000`.

**Não envie `.env` ao GitHub e não compartilhe a chave administrativa.**

## 2. Banco Neon
1. Crie um branch/backup no Neon antes de alterar o banco.
2. Confira se as tabelas e colunas usadas pelo projeto existem.
3. Revise e execute `database/migration_atividade.sql` no branch de teste.
4. Teste empréstimos, devoluções e fila de reservas antes de aplicar no banco principal.

A migração é não destrutiva: renomeia a coluna identificadora quando necessário e não apaga tabelas ou registros. Ela pressupõe que o banco existente já tenha as tabelas `livros`, `usuarios` e `mov_livros`, com as chaves `livroID`, `usuarioID` e `idMovimentacao` utilizadas pelo código atual. Se o banco real usar nomes diferentes, ajuste a migração antes de executar.

O projeto original usa SQL via `pg` em `api/routes.js`; `prisma/schema.prisma` é legado e não é utilizado pelas rotas atuais.

## 3. Acesso de administrador
Configure `ADMIN_ACCESS_KEY` no `.env` local e nas Environment Variables da Vercel. No sistema, use **Acesso do administrador** e informe exatamente essa chave. A sessão dura até 8 horas ou até clicar em **Sair do administrador**. A API valida um token assinado pelo servidor.

## 4. Leitor ISBN
A leitura automática depende de `BarcodeDetector`, câmera e contexto seguro (HTTPS ou localhost). Se o navegador não oferecer suporte, digite o ISBN e use a lupa de pesquisa.

## 5. PWA
Abra o sistema em HTTPS, em navegador compatível. Use o botão **Instalar aplicativo** quando ele aparecer ou a opção de instalação do navegador. O Service Worker armazena a interface para abertura posterior; as operações da API continuam exigindo conexão com o servidor e banco.

## 6. Deploy na Vercel
- Importe o repositório GitHub.
- Configure `DATABASE_URL` e `ADMIN_ACCESS_KEY` nas variáveis de ambiente do projeto Vercel.
- Use a raiz `Biblioteca` como diretório do projeto e revise a configuração de build.
- Após o deploy, teste login administrativo, cadastro, empréstimo, devolução e reservas.

O ZIP não contém credenciais e não realiza deploy, backup Neon ou push ao GitHub automaticamente.


## 7. Compatibilidade com o guia e limites do ZIP recebido
Ajustes implementados de acordo com o guia: `movimentacao.html` virou `emprestimos.html`; menu e função `renderEmprestimos`; `PAGINAS_PERMITIDAS.adm` e `data-acesso="adm"`; ISBN por Enter, leitor de código de barras pela câmera e busca manual; fila de reservas e ação **Confirmar empréstimo**; modal com data obrigatória para livro didático (categoria 1), posterior a hoje e em até dois anos; devolução promove a próxima reserva para `disponivel`; PWA com manifest, Service Worker, metatags e ícones.

**Limites encontrados na cópia enviada:** o ZIP não contém o login/perfis do sistema final, a tela Configurações, nem as rotas de notificações/auditoria e a tela “Meus Livros” citadas no guia. Por isso, o acesso administrativo foi protegido nesta versão por `ADMIN_ACCESS_KEY` no servidor, e não por uma conta `adm` existente no banco. Também não foi possível reproduzir os limites de empréstimos simultâneos/bloqueio por atraso configuráveis, notificações e auditoria sem os módulos e regras originais. Esses itens não devem ser considerados concluídos por este ZIP. A regra de usuário inativo é aplicada se a coluna `usuarios.status` existir; quando ela não existe, o sistema legado não oferece esse dado.

A cópia recebida usa `api/index.js` como ponto de entrada, com as rotas Express preservadas em `api/routes.js` e SQL via `pg`. Mantive essa arquitetura para evitar substituir o backend existente.

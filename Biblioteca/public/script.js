
// Controle de acesso administrativo. A autorização real é validada pela API.
const PAGINAS_PERMITIDAS = { adm: ['pages/emprestimos.html'] };
window.PAGINAS_PERMITIDAS = PAGINAS_PERMITIDAS;

function adminAutenticado() {
    return Boolean(sessionStorage.getItem('adminToken'));
}
function atualizarMenuAcesso() {
    document.querySelectorAll('[data-acesso="adm"]').forEach(el => {
        el.hidden = !adminAutenticado();
    });
    const sair = document.getElementById('btn-logout-admin');
    if (sair) sair.hidden = !adminAutenticado();
}
async function loginAdministrador() {
    const senha = prompt('Digite a senha administrativa:');
    if (senha === null) return;
    try {
        const resposta = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ senha })
        });
        const dados = await resposta.json();
        if (!resposta.ok) return alert(dados.mensagem || 'Não foi possível autenticar.');
        sessionStorage.setItem('adminToken', dados.token);
        sessionStorage.setItem('perfilUsuario', 'adm');
        atualizarMenuAcesso();
        alert('Acesso administrativo liberado nesta sessão.');
    } catch (erro) {
        alert('Falha ao conectar com o servidor de autenticação.');
    }
}

// Inclui o token nas chamadas administrativas sem alterar as demais telas.
const fetchOriginalBiblio = window.fetch.bind(window);
window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const protegido = /^\/api\/(emprestimos|reservas|movimentacoes)(\/|$)/.test(url);
    if (protegido && sessionStorage.getItem('adminToken')) {
        const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
        headers.set('Authorization', `Bearer ${sessionStorage.getItem('adminToken')}`);
        init = { ...init, headers };
    }
    return fetchOriginalBiblio(input, init);
};
document.addEventListener('DOMContentLoaded', atualizarMenuAcesso);

// ==========================================
// 1. NAVEGAÇÃO SPA (Single Page Application)
// ==========================================

function toggleMenu() {
    const nav = document.getElementById('main-nav');
    if (nav) nav.classList.toggle('hidden');
}

async function navigate(pageUrl, btnElement, renderFunctionName) {
    if (btnElement?.dataset?.acesso === 'adm' && !adminAutenticado()) {
        alert('Entre com o acesso administrativo antes de abrir Empréstimos.');
        return;
    }
    const nav = document.getElementById('main-nav');
    if (nav) nav.classList.add('hidden');

    try {
        const response = await fetch(pageUrl);
        if (!response.ok) throw new Error(`Erro ao carregar ${pageUrl}: ${response.status}`);
        
        const html = await response.text();
        const contentArea = document.getElementById('content-area');
        contentArea.innerHTML = html;

        if (renderFunctionName && typeof window[renderFunctionName] === 'function') {
            window[renderFunctionName]();
        }
    } catch (erro) {
        console.error("Erro ao carregar página:", erro);
        document.getElementById('content-area').innerHTML = 
            `<p class="msg-erro">Não foi possível carregar a página solicitada.</p>`;
    }
}

function renderLivros() {
    console.log("Visão carregada: renderLivros");
    carregarListaLivros();
}

function renderUsuarios() {
    console.log("Visão carregada: renderUsuarios");
    carregarListaUsuarios();
}

function renderEmprestimos() {
    console.log("Visão carregada: renderEmprestimos");
    carregarReservasMov();
    ativarEnterPesquisa('mov-fk-livro', pesquisarLivroMov, true);
    ativarEnterPesquisa('mov-fk-usuario', pesquisarUsuarioMov);
    const perfil = sessionStorage.getItem('perfilUsuario') || '';
    if (!adminAutenticado() || !PAGINAS_PERMITIDAS.adm.includes('pages/emprestimos.html') ||
        (perfil.toLowerCase() !== 'adm' && perfil.toLowerCase() !== 'administrador')) {
        document.getElementById('content-area').innerHTML =
            '<section class="section"><h2>Acesso restrito</h2><p>A área de empréstimos está disponível somente para administradores.</p></section>';
        return;
    }
}

// Compatibilidade com telas antigas que chamavam a função anterior.
function renderMovimentacoes() { renderEmprestimos(); }

// ==========================================
// 2. IMPEDIR RECARREGAMENTO DE PÁGINA EM FORMULÁRIOS
// ==========================================
document.addEventListener('submit', (event) => {
    event.preventDefault();

    if (event.target.id === 'form-usuario') {
        salvarUsuario();
    } else if (event.target.id === 'form-livro') {
        salvarLivro();
    } else if (event.target.id === 'form-movimentacao' || event.target.id === 'form-emprestimo' || event.target.id === 'form-mov') {
        salvarEmprestimo();
    }
});

// ==========================================
// 3. DELEGAÇÃO DE CLIQUES GLOBAIS
// ==========================================
document.addEventListener('click', async (event) => {
    if (event.target.closest('#btn-login-admin')) {
        event.preventDefault();
        await loginAdministrador();
        return;
    }
    if (event.target.closest('#btn-logout-admin')) {
        event.preventDefault();
        sessionStorage.removeItem('adminToken');
        sessionStorage.removeItem('perfilUsuario');
        atualizarMenuAcesso();
        document.getElementById('content-area').innerHTML = '<section class="welcome"><h2>Sessão encerrada</h2><p>Entre como administrador para acessar Empréstimos.</p></section>';
        return;
    }

    if (event.target.closest('#btn-ler-isbn, #btn-camera-isbn')) {
        event.preventDefault();
        abrirCameraIsbn(lerLivroMovPorCodigo);
        return;
    }
    if (event.target.closest('#btn-fechar-camera-isbn')) {
        event.preventDefault(); pararCameraIsbn(); return;
    }
    if (event.target.closest('#btn-confirmar-data-didatico')) {
        event.preventDefault();
        const campo = document.getElementById('data-devolucao-didatico');
        if (!campo?.value) return alert('Informe a data de devolução.');
        const data = new Date(`${campo.value}T00:00:00`);
        const hoje = new Date(); hoje.setHours(0,0,0,0);
        const limite = new Date(); limite.setFullYear(limite.getFullYear() + 2);
        if (data <= hoje || data > limite) return alert('A data deve ser posterior a hoje e estar dentro de dois anos.');
        document.getElementById('modal-devolucao-didatico').style.display = 'none';
        await salvarMovimentacao(campo.value);
        return;
    }
    if (event.target.closest('#btn-cancelar-data-didatico')) {
        event.preventDefault();
        document.getElementById('modal-devolucao-didatico').style.display = 'none';
        return;
    }
    if (event.target.closest('#btn-registrar-reserva')) {
        event.preventDefault();
        registrarReserva();
        return;
    }
    if (event.target.closest('#btn-consultar-fila')) {
        event.preventDefault();
        consultarFilaReservas();
        return;
    }
    const btnConfirmarReserva = event.target.closest('.btn-confirmar-reserva');
    if (btnConfirmarReserva) {
        event.preventDefault();
        const livroID = btnConfirmarReserva.dataset.livro;
        const usuarioID = btnConfirmarReserva.dataset.usuario;
        document.getElementById('mov-livro-id').value = livroID;
        document.getElementById('mov-usuario-id').value = usuarioID;
        document.getElementById('mov-fk-livro').value = btnConfirmarReserva.dataset.titulo || 'Livro';
        document.getElementById('mov-fk-usuario').value = btnConfirmarReserva.dataset.nome || 'Usuário';
        const livroRes = await fetch(`/api/livros/${encodeURIComponent(livroID)}`);
        if (livroRes.ok) window.livroSelecionadoMov = await livroRes.json();
        await salvarEmprestimo();
        return;
    }

    // ------------------------------------------
    // A) TELA DE EMPRÉSTIMOS
    // ------------------------------------------

    // 🔍 Lupa de Pesquisa de Usuário na Movimentação
    const btnPesqMovUsuario = event.target.closest('#btn-pesq-mov-usuario, #btn-pesq-usuario-mov, #btn-pesq-mov-usr');
    if (btnPesqMovUsuario) {
        event.preventDefault();
        pesquisarUsuarioMovimentacao();
        return;
    }

    // 🔍 Lupa de Pesquisa de Livro na Movimentação
    const btnPesqMovLivro = event.target.closest('#btn-pesq-mov-livro, #btn-pesq-livro-mov, #btn-pesq-mov-liv');
    if (btnPesqMovLivro) {
        event.preventDefault();
        pesquisarLivroMovimentacao();
        return;
    }

    // 💾 Botão Salvar Empréstimo (Movimentação)
    const btnSalvarMov = event.target.closest('#btn-salvar-movimentacao, #btn-salvar-emprestimo, #btn-salvar-mov');
    if (btnSalvarMov) {
        event.preventDefault();
        salvarEmprestimo();
        return;
    }

    // 🧹 Botão Limpar Movimentação
    const btnLimparMov = event.target.closest('#btn-limpar-movimentacao, #btn-limpar-emprestimo, #btn-limpar-mov');
    if (btnLimparMov) {
        event.preventDefault();
        limparFormularioMovimentacao();
        return;
    }

    // 🔄 Botão Devolver Livro (nos Cards)
    const btnDevolverCard = event.target.closest('.btn-devolver-card, .btn-devolver');
    if (btnDevolverCard) {
        event.preventDefault();
        const idMovimentacao = btnDevolverCard.dataset.id;
        if (idMovimentacao) devolverEmprestimo(idMovimentacao);
        return;
    }

    // ------------------------------------------
    // B) TELA DE GESTÃO DE USUÁRIOS
    // ------------------------------------------

    // 🔍 Lupas da tela de Usuários (Matrícula, Nome, CPF)
    const btnPesqUsuario = event.target.closest('#btn-pesq-matricula, #btn-pesq-nome, #btn-pesq-cpf, #btn-pesq-usuario');
    if (btnPesqUsuario) {
        event.preventDefault();
        
        let termo = '';
        if (btnPesqUsuario.id === 'btn-pesq-matricula') termo = document.getElementById('usuario-matricula')?.value.trim();
        else if (btnPesqUsuario.id === 'btn-pesq-nome') termo = document.getElementById('usuario-nome')?.value.trim();
        else if (btnPesqUsuario.id === 'btn-pesq-cpf') termo = document.getElementById('usuario-cpf')?.value.trim();

        if (!termo) {
            termo = (
                document.getElementById('usuario-nome')?.value ||
                document.getElementById('usuario-matricula')?.value ||
                document.getElementById('usuario-cpf')?.value || ''
            ).trim();
        }

        if (!termo) return alert("Digite o Nome, CPF ou Matrícula no campo correspondente para pesquisar.");

        try {
            const res = await buscarDadosAPI([`/api/usuarios/pesquisar/${encodeURIComponent(termo)}`, `/api/movimentacoes/pesquisar-usuario/${encodeURIComponent(termo)}`]);
            if (!res.ok) return alert(res.dados?.detalhe_do_erro || res.dados?.mensagem || "Usuário não encontrado.");

            const dados = res.dados;
            if (Array.isArray(dados)) {
                if (dados.length === 1) preencherFormularioUsuario(dados[0]);
                else if (dados.length > 1) exibirModalGenerico("Usuários encontrados", dados, (item) => preencherFormularioUsuario(item), 'nome', 'cpf', 'matricula');
            } else if (dados.usuarioID || dados.id) {
                preencherFormularioUsuario(dados);
            }
        } catch (erro) {
            console.error("Erro ao pesquisar usuário:", erro);
        }
        return;
    }

    // 💾 Salvar Usuário
    const btnSalvarUsuario = event.target.closest('#btn-salvar-usuario');
    if (btnSalvarUsuario) {
        event.preventDefault();
        salvarUsuario();
        return;
    }

    // 🧹 Limpar Usuário
    const btnLimparUsuario = event.target.closest('#btn-limpar-usuario');
    if (btnLimparUsuario) {
        event.preventDefault();
        limparFormularioUsuario();
        return;
    }

    // ❌ Excluir Usuário
    const btnExcluirUsuario = event.target.closest('#btn-excluir-usuario, .btn-excluir-usuario');
    if (btnExcluirUsuario) {
        event.preventDefault();
        const id = btnExcluirUsuario.dataset.id || document.getElementById('usuario-id')?.value;
        if (!id) return alert("Selecione um usuário para excluir.");
        if (!confirm("Tem certeza que deseja excluir este usuário?")) return;

        try {
            const res = await fetch(`/api/usuarios/${id}`, { method: 'DELETE' });
            const resposta = await res.json();
            if (!res.ok) return alert(resposta.detalhe_do_erro || resposta.mensagem || "Erro ao excluir usuário.");

            alert(resposta.mensagem || "Usuário excluído!");
            limparFormularioUsuario();
            carregarListaUsuarios();
        } catch (e) { console.error(e); }
        return;
    }

    // ------------------------------------------
    // C) TELA DE GESTÃO DE LIVROS
    // ------------------------------------------

    // 🔍 Lupas da tela de Livros (ISBN, Título)
    const btnPesqLivro = event.target.closest('#btn-pesq-isbn, #btn-pesq-titulo, #btn-pesq-livro-tela, #btn-pesq-livro');
    if (btnPesqLivro) {
        event.preventDefault();
        
        let termo = '';
        if (btnPesqLivro.id === 'btn-pesq-isbn') termo = document.getElementById('livro-isbn')?.value.trim();
        else if (btnPesqLivro.id === 'btn-pesq-titulo') termo = document.getElementById('livro-titulo')?.value.trim();

        if (!termo) {
            termo = (
                document.getElementById('livro-titulo')?.value ||
                document.getElementById('livro-isbn')?.value || ''
            ).trim();
        }

        if (!termo) return alert("Digite o Título ou o ISBN no campo correspondente para pesquisar.");

        try {
            const res = await buscarDadosAPI([`/api/livros/pesquisar/${encodeURIComponent(termo)}`, `/api/movimentacoes/pesquisar-livro/${encodeURIComponent(termo)}`]);
            if (!res.ok) return alert(res.dados?.detalhe_do_erro || res.dados?.mensagem || "Livro não encontrado.");

            const dados = res.dados;
            if (Array.isArray(dados)) {
                if (dados.length === 1) preencherFormularioLivro(dados[0]);
                else if (dados.length > 1) exibirModalGenerico("Livros encontrados", dados, (item) => preencherFormularioLivro(item), 'titulo', 'isbn', 'autor');
            } else if (dados.livroID || dados.id) {
                preencherFormularioLivro(dados);
            }
        } catch (erro) {
            console.error("Erro ao pesquisar livro:", erro);
        }
        return;
    }

    // 💾 Salvar Livro
    const btnSalvarLivro = event.target.closest('#btn-salvar-livro');
    if (btnSalvarLivro) {
        event.preventDefault();
        salvarLivro();
        return;
    }

    // 🧹 Limpar Livro
    const btnLimparLivro = event.target.closest('#btn-limpar-livro');
    if (btnLimparLivro) {
        event.preventDefault();
        limparFormularioLivro();
        return;
    }

    // ❌ Excluir Livro
    const btnExcluirLivro = event.target.closest('#btn-excluir-livro, .btn-excluir-livro');
    if (btnExcluirLivro) {
        event.preventDefault();
        const id = btnExcluirLivro.dataset.id || document.getElementById('livro-id')?.value;
        if (!id) return alert("Selecione um livro para excluir.");
        if (!confirm("Tem certeza que deseja excluir este livro?")) return;

        try {
            const res = await fetch(`/api/livros/${id}`, { method: 'DELETE' });
            const resposta = await res.json();
            if (!res.ok) return alert(resposta.detalhe_do_erro || resposta.mensagem || "Erro ao excluir livro.");

            alert(resposta.mensagem || "Livro excluído!");
            limparFormularioLivro();
            carregarListaLivros();
        } catch (e) { console.error(e); }
        return;
    }

    // ------------------------------------------
    // D) FECHAR MODAIS
    // ------------------------------------------
    const btnFecharModal = event.target.closest('#btn-fechar-modal, .btn-fechar-modal, #btn-fechar-modal-dinamico');
    if (btnFecharModal) {
        event.preventDefault();
        fecharModais();
    }
});

// ==========================================
// 4. LÓGICA ESPECÍFICA DA MOVIMENTAÇÃO
// ==========================================

async function pesquisarUsuarioMovimentacao() {
    const campoUsuario = document.getElementById('mov-fk-usuario') || document.getElementById('mov-usuario-busca') || document.getElementById('mov-usuario');
    const termo = campoUsuario ? campoUsuario.value.trim() : '';
    if (!termo) return alert("Digite o Nome, CPF ou Matrícula do usuário no campo correspondente para pesquisar.");

    try {
        const res = await buscarDadosAPI([
            `/api/movimentacoes/pesquisar-usuario/${encodeURIComponent(termo)}`,
            `/api/usuarios/pesquisar/${encodeURIComponent(termo)}`
        ]);

        if (!res.ok) return alert(res.dados?.detalhe_do_erro || res.dados?.mensagem || "Usuário não encontrado.");

        const dados = res.dados;
        if (Array.isArray(dados)) {
            if (dados.length === 1) selecionarUsuarioMovimentacao(dados[0]);
            else if (dados.length > 1) exibirModalGenerico("Selecione o Usuário", dados, (item) => selecionarUsuarioMovimentacao(item), 'nome', 'cpf', 'matricula');
        } else if (dados.usuarioID || dados.id) {
            selecionarUsuarioMovimentacao(dados);
        }
    } catch (erro) {
        console.error("Erro ao pesquisar usuário em movimentações:", erro);
    }
}

async function pesquisarLivroMovimentacao() {
    const campoLivro = document.getElementById('mov-fk-livro') || document.getElementById('mov-livro-busca') || document.getElementById('mov-livro');
    const termo = campoLivro ? campoLivro.value.trim() : '';
    if (!termo) return alert("Digite o Título ou o ISBN do livro no campo correspondente para pesquisar.");

    try {
        const res = await buscarDadosAPI([
            `/api/movimentacoes/pesquisar-livro/${encodeURIComponent(termo)}`,
            `/api/livros/pesquisar/${encodeURIComponent(termo)}`
        ]);

        if (!res.ok) return alert(res.dados?.detalhe_do_erro || res.dados?.mensagem || "Livro não encontrado.");

        const dados = res.dados;
        if (Array.isArray(dados)) {
            if (dados.length === 1) selecionarLivroMovimentacao(dados[0]);
            else if (dados.length > 1) exibirModalGenerico("Selecione o Livro", dados, (item) => selecionarLivroMovimentacao(item), 'titulo', 'isbn', 'autor');
        } else if (dados.livroID || dados.id) {
            selecionarLivroMovimentacao(dados);
        }
    } catch (erro) {
        console.error("Erro ao pesquisar livro em movimentações:", erro);
    }
}

function selecionarUsuarioMovimentacao(usuario) {
    const id = usuario.usuarioID || usuario.id;
    const usrIdEl = document.getElementById('mov-usuario-id') || document.getElementById('mov-fk-usuario-id');
    const usrTextEl = document.getElementById('mov-fk-usuario') || document.getElementById('mov-usuario-busca') || document.getElementById('mov-usuario');

    if (usrIdEl) usrIdEl.value = id;
    if (usrTextEl) usrTextEl.value = `${usuario.nome} (Matrícula: ${usuario.matricula || usuario.cpf || ''})`;

    fecharModais();
    carregarEmprestimosAtivos(id);
}

function selecionarLivroMovimentacao(livro) {
    window.livroSelecionadoMov = livro;
    const id = livro.livroID || livro.id;
    const livIdEl = document.getElementById('mov-livro-id') || document.getElementById('mov-fk-livro-id');
    const livTextEl = document.getElementById('mov-fk-livro') || document.getElementById('mov-livro-busca') || document.getElementById('mov-livro');

    if (livIdEl) livIdEl.value = id;
    if (livTextEl) livTextEl.value = `${livro.titulo} (ISBN: ${livro.isbn || ''})`;

    fecharModais();
    consultarFilaReservas();
}

async function salvarMovimentacao(dataDevolucao = null) {
    const fkUsuario = document.getElementById('mov-usuario-id')?.value || document.getElementById('mov-fk-usuario-id')?.value;
    const fkLivro = document.getElementById('mov-livro-id')?.value || document.getElementById('mov-fk-livro-id')?.value;
    const observacao = (document.getElementById('mov-observacao') || document.getElementById('mov-obs'))?.value;

    if (!fkUsuario || !fkLivro) {
        return alert("Por favor, selecione um Usuário e um Livro válidos utilizando as lupas 🔍.");
    }

    const payload = {
        fkUsuario: parseInt(fkUsuario, 10),
        fkLivro: parseInt(fkLivro, 10),
        observacao: observacao ? observacao.trim() : "",
        dataDevolucao: dataDevolucao || null
    };

    try {
        let res = await fetch('/api/emprestimos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.status === 404) {
            res = await fetch('/api/movimentacoes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }

        const resposta = await res.json();
        if (!res.ok) return alert(resposta.detalhe_do_erro || resposta.mensagem || "Erro ao registrar empréstimo.");

        alert(resposta.mensagem || "Empréstimo registrado com sucesso!");
        limparApenasLivroEObservacaoMov();
        carregarEmprestimosAtivos(fkUsuario);
    } catch (erro) {
        console.error("Erro ao salvar movimentação:", erro);
    }
}

async function carregarEmprestimosAtivos(usuarioID) {
    const container = document.getElementById('container-cards-emprestimos') || document.getElementById('lista-emprestimos') || document.getElementById('cards-emprestimos');
    if (!container) return;

    container.innerHTML = "<p style='color: #0b2545;'>Carregando empréstimos...</p>";

    try {
        const res = await fetch(`/api/emprestimos/usuario/${usuarioID}`);
        const emprestimos = await res.json();

        if (!res.ok) {
            container.innerHTML = `<p style='color:#d32f2f; font-weight:bold;'>${emprestimos.detalhe_do_erro || emprestimos.mensagem || 'Sem registros'}</p>`;
            return;
        }

        if (!Array.isArray(emprestimos) || emprestimos.length === 0) {
            container.innerHTML = "<p style='color:#555;'>Nenhum empréstimo ativo para este usuário.</p>";
            return;
        }

        container.innerHTML = emprestimos.map(emp => {
            const obsTexto = emp.observacao || emp.observacoes || emp.Observacao || emp.obs || "";
            const idMov = emp.idMovimentacao || emp.movimentacaoID || emp.id;
            const dataEmp = emp.dataEmprestimo || emp.data ? new Date(emp.dataEmprestimo || emp.data).toLocaleDateString('pt-BR') : '-';
            const dataDev = emp.dataDevolucaoPrevista ? new Date(emp.dataDevolucaoPrevista).toLocaleDateString('pt-BR') : '-';

            return `
                <div style="background: #ffffff; padding: 16px; border-radius: 8px; border: 1px solid #e0e6ed; border-left: 6px solid #0b2545; box-shadow: 0 2px 8px rgba(0,0,0,0.06); margin-bottom: 12px;">
                    <h4 style="margin: 0 0 6px 0; color: #0b2545; font-size: 16px; font-weight: bold;">${emp.tituloLivro || emp.titulo || 'Livro Sem Título'}</h4>
                    <p style="margin: 4px 0; font-size: 13px; color: #4a5568;">
                        <strong>Empréstimo:</strong> ${dataEmp}
                    </p>
                    <p style="margin: 4px 0; font-size: 13px; color: #0b2545;">
                        <strong>Devolução Prevista:</strong> 
                        <span style="background: #fff59d; color: #0b2545; padding: 2px 8px; border-radius: 4px; font-weight: bold; border: 1px solid #fbc02d;">
                            ${dataDev}
                        </span>
                    </p>
                    ${obsTexto ? `<p style="margin: 6px 0 14px 0; font-size: 13px; color: #4a5568;"><strong>Observação:</strong> ${obsTexto}</p>` : '<div style="margin-bottom: 14px;"></div>'}
                    <button type="button" class="btn-devolver-card" data-id="${idMov}" style="background: #0b2545; color: #ffffff; border: none; padding: 8px 18px; border-radius: 8px; font-weight: bold; font-size: 13px; cursor: pointer; box-shadow: 3px 3px 0px #ffcc00; transition: transform 0.1s, box-shadow 0.1s;">
                        Devolver
                    </button>
                </div>
            `;
        }).join('');
    } catch (erro) {
        console.error(erro);
        container.innerHTML = "<p style='color:#d32f2f; font-weight:bold;'>Erro ao carregar empréstimos.</p>";
    }
}

async function devolverEmprestimo(idMovimentacao) {
    const fkUsuario = document.getElementById('mov-usuario-id')?.value || document.getElementById('mov-fk-usuario-id')?.value;

    try {
        let res = await fetch(`/api/emprestimos/${idMovimentacao}/devolver`, { method: 'PUT' });
        if (res.status === 404) {
            res = await fetch(`/api/movimentacoes/${idMovimentacao}/devolver`, { method: 'PUT' });
        }

        const resposta = await res.json();
        if (!res.ok) return alert(resposta.detalhe_do_erro || resposta.mensagem || "Erro ao realizar devolução.");

        alert(resposta.mensagem || "Devolução registrada com sucesso!");
        if (fkUsuario) carregarEmprestimosAtivos(fkUsuario);
    } catch (erro) {
        console.error("Erro ao devolver empréstimo:", erro);
    }
}

function limparFormularioMovimentacao() {
    window.livroSelecionadoMov = null;
    const form = document.getElementById('form-emprestimo') || document.getElementById('form-emprestimo') || document.getElementById('form-movimentacao') || document.getElementById('form-mov');
    if (form) form.reset();

    ['emprestimo-id', 'movimentacao-id', 'mov-livro-id', 'mov-usuario-id', 'mov-fk-livro-id', 'mov-fk-usuario-id', 'mov-fk-usuario', 'mov-fk-livro', 'mov-observacao'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    const container = document.getElementById('container-cards-emprestimos') || document.getElementById('lista-emprestimos') || document.getElementById('cards-emprestimos');
    if (container) container.innerHTML = '';
}

function limparApenasLivroEObservacaoMov() {
    window.livroSelecionadoMov = null;
    ['mov-livro-id', 'mov-fk-livro-id', 'mov-fk-livro', 'mov-observacao'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
}

// ==========================================
// 4.1 APOIO DA TELA DE EMPRÉSTIMOS
// ==========================================
let isbnStream = null;
let detectorISBN = null;
let callbackLeituraISBN = null;

function mostrarStatusIsbn(mensagem) {
    const alvo = document.getElementById('isbn-status');
    if (alvo) alvo.textContent = mensagem || '';
}
function ativarEnterPesquisa(inputId, acao, selecionarAoFocar = false) {
    const campo = document.getElementById(inputId);
    if (!campo || campo.dataset.enterAtivado === '1') return;
    campo.dataset.enterAtivado = '1';
    if (selecionarAoFocar) campo.addEventListener('focus', () => campo.select());
    campo.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); acao(); }
    });
}
function pesquisarUsuarioMov() { return pesquisarUsuarioMovimentacao(); }
function pesquisarLivroMov() { return pesquisarLivroMovimentacao(); }
function lerLivroMovPorCodigo(isbn) {
    const campo = document.getElementById('mov-fk-livro');
    if (campo) campo.value = isbn;
    mostrarStatusIsbn(`ISBN lido: ${isbn}. Pesquisando livro...`);
    return pesquisarLivroMovimentacao();
}
async function abrirCameraIsbn(aoLer) {
    callbackLeituraISBN = typeof aoLer === 'function' ? aoLer : lerLivroMovPorCodigo;
    const modal = document.getElementById('modal-camera-isbn');
    const video = document.getElementById('video-isbn');
    const status = document.getElementById('status-camera-isbn');
    if (!modal || !video || !status) return;
    if (!('BarcodeDetector' in window)) {
        status.textContent = 'Este navegador não oferece leitura automática. Digite o ISBN e use a lupa.';
        modal.style.display = 'flex';
        return;
    }
    try {
        detectorISBN = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
        isbnStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
        video.srcObject = isbnStream;
        modal.style.display = 'flex';
        await video.play();
        status.textContent = 'Aponte a câmera para o código de barras do livro.';
        const detectar = async () => {
            if (!isbnStream) return;
            try {
                const encontrados = await detectorISBN.detect(video);
                const isbn = encontrados[0]?.rawValue;
                if (isbn) {
                    pararCameraIsbn();
                    mostrarStatusIsbn(`ISBN lido: ${isbn}`);
                    if (callbackLeituraISBN) await callbackLeituraISBN(isbn);
                    return;
                }
            } catch (erro) { console.warn('Leitura ISBN:', erro); }
            if (isbnStream) requestAnimationFrame(detectar);
        };
        requestAnimationFrame(detectar);
    } catch (erro) {
        status.textContent = 'Não foi possível abrir a câmera. Autorize o acesso e use HTTPS ou localhost.';
        modal.style.display = 'flex';
    }
}
function pararCameraIsbn() {
    if (isbnStream) isbnStream.getTracks().forEach(track => track.stop());
    isbnStream = null;
    const video = document.getElementById('video-isbn');
    if (video) { video.pause(); video.srcObject = null; }
    const modal = document.getElementById('modal-camera-isbn');
    if (modal) modal.style.display = 'none';
}
function livroSelecionadoEhDidatico() {
    const livro = window.livroSelecionadoMov || {};
    const categoriaId = Number(livro.fkCategoria || livro.categoriaID || livro.idCategoria || 0);
    const categoriaTexto = `${livro.categoria || ''} ${livro.genero || ''} ${livro.nomeCategoria || ''}`;
    return categoriaId === 1 || /did[aá]tico/i.test(categoriaTexto);
}
async function salvarEmprestimo() {
    if (livroSelecionadoEhDidatico()) {
        const modal = document.getElementById('modal-devolucao-didatico');
        const campo = document.getElementById('data-devolucao-didatico');
        if (campo) {
            const hoje = new Date(); hoje.setDate(hoje.getDate() + 1);
            campo.min = hoje.toISOString().slice(0, 10);
            const limite = new Date(); limite.setFullYear(limite.getFullYear() + 2);
            campo.max = limite.toISOString().slice(0, 10);
            campo.value = '';
        }
        if (modal) modal.style.display = 'flex';
        return;
    }
    return salvarMovimentacao(null);
}
async function carregarReservasMov() {
    const secao = document.getElementById('secao-reservas-mov');
    const container = document.getElementById('container-cards-reservas');
    if (!container || !secao) return;
    try {
        const res = await fetch('/api/reservas/para-emprestimo');
        const reservas = await res.json();
        if (!res.ok) throw new Error(reservas.mensagem || 'Não foi possível carregar reservas.');
        secao.hidden = reservas.length === 0;
        const resumo = document.getElementById('reservas-mov-resumo');
        if (resumo) resumo.textContent = `${reservas.length} reserva(s) aguardando retirada.`;
        container.innerHTML = reservas.map(r => `
          <article class="card-reserva">
            <strong>${escapeHTML(r.tituloLivro || 'Livro')}</strong>
            <p>Aluno: ${escapeHTML(r.nomeUsuario || 'Usuário')}</p>
            <p><b>Pronto para retirada</b></p>
            <button type="button" class="btn-confirmar-reserva" data-livro="${r.fkLivro}" data-usuario="${r.fkUsuario}" data-titulo="${escapeHTML(r.tituloLivro || '')}" data-nome="${escapeHTML(r.nomeUsuario || '')}">Confirmar empréstimo</button>
          </article>`).join('');
    } catch (erro) {
        secao.hidden = true;
        console.warn('Reservas não carregadas:', erro.message);
    }
}
async function registrarReserva() {
    const fkUsuario = document.getElementById('mov-usuario-id')?.value;
    const fkLivro = document.getElementById('mov-livro-id')?.value;
    if (!fkUsuario || !fkLivro) return alert('Selecione um usuário e um livro antes de reservar.');
    try {
        const res = await fetch('/api/reservas', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fkUsuario: Number(fkUsuario), fkLivro: Number(fkLivro) })
        });
        const data = await res.json();
        if (!res.ok) return alert(data.mensagem || 'Não foi possível registrar a reserva.');
        alert(data.mensagem || 'Reserva registrada.');
        consultarFilaReservas();
        carregarReservasMov();
    } catch (e) { alert('Falha de comunicação ao registrar a reserva.'); }
}
async function consultarFilaReservas() {
    const fkLivro = document.getElementById('mov-livro-id')?.value;
    const container = document.getElementById('container-fila-reservas');
    const secao = document.getElementById('secao-reservas-mov');
    if (secao) secao.hidden = false;
    if (!container) return;
    if (!fkLivro) { container.innerHTML = '<p>Selecione um livro para visualizar a fila.</p>'; return; }
    container.innerHTML = '<p>Carregando fila...</p>';
    try {
        const res = await fetch(`/api/reservas/livro/${encodeURIComponent(fkLivro)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.mensagem || 'Erro ao consultar reservas.');
        container.innerHTML = data.length
          ? '<ol>' + data.map(r => `<li>${escapeHTML(r.nomeUsuario || ('Usuário #' + r.fkUsuario))} — ${new Date(r.dataReserva).toLocaleString('pt-BR')} — ${escapeHTML(r.status)}</li>`).join('') + '</ol>'
          : '<p>Nenhuma reserva ativa para este livro.</p>';
    } catch (e) { container.innerHTML = `<p class="msg-erro">${escapeHTML(e.message)}</p>`; }
}
function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function limparFormEmprestimo() { limparFormularioMovimentacao(); }
function iniciarLeitorISBN() { return abrirCameraIsbn(lerLivroMovPorCodigo); }



// ==========================================
// 5. OPERAÇÕES DE PERSISTÊNCIA (USUÁRIOS E LIVROS)
// ==========================================

async function salvarUsuario() {
    const idUsuario = document.getElementById('usuario-id')?.value;
    const matricula = document.getElementById('usuario-matricula')?.value.trim();
    const nome = document.getElementById('usuario-nome')?.value.trim();
    const cpf = document.getElementById('usuario-cpf')?.value.trim();
    const email = document.getElementById('usuario-email')?.value.trim();
    const telefone = document.getElementById('usuario-telefone')?.value.trim();

    if (!nome || !matricula || !cpf) {
        return alert("Por favor, preencha a Matrícula, Nome e CPF.");
    }

    const payload = { matricula, nome, cpf, email, telefone };
    const url = idUsuario ? `/api/usuarios/${idUsuario}` : '/api/usuarios';
    const method = idUsuario ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const resposta = await res.json();
        if (!res.ok) return alert(resposta.detalhe_do_erro || resposta.mensagem || "Erro ao salvar usuário.");

        alert(resposta.mensagem || (idUsuario ? "Usuário alterado!" : "Usuário cadastrado!"));
        limparFormularioUsuario();
        carregarListaUsuarios();
    } catch (erro) { console.error("Erro ao salvar usuário:", erro); }
}

async function salvarLivro() {
    const idLivro = document.getElementById('livro-id')?.value;
    const isbn = document.getElementById('livro-isbn')?.value.trim();
    const titulo = document.getElementById('livro-titulo')?.value.trim();
    const subtitulo = document.getElementById('livro-subtitulo')?.value.trim();
    const autor = document.getElementById('livro-autor')?.value.trim();
    const genero = document.getElementById('livro-genero')?.value.trim();
    const editora = document.getElementById('livro-editora')?.value.trim();
    const edicao = document.getElementById('livro-edicao')?.value.trim();
    const ano = document.getElementById('livro-ano')?.value.trim();

    if (!titulo || !isbn) {
        return alert("Por favor, preencha pelo menos o Título e o ISBN.");
    }

    const payload = { isbn, titulo, subtitulo, autor, genero, editora, edicao, ano };
    const url = idLivro ? `/api/livros/${idLivro}` : '/api/livros';
    const method = idLivro ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const resposta = await res.json();
        if (!res.ok) return alert(resposta.detalhe_do_erro || resposta.mensagem || "Erro ao salvar livro.");

        alert(resposta.mensagem || (idLivro ? "Livro alterado!" : "Livro cadastrado!"));
        limparFormularioLivro();
        carregarListaLivros();
    } catch (erro) { console.error("Erro ao salvar livro:", erro); }
}

// ==========================================
// 6. FORMULÁRIOS & MODAIS UNIFICADOS
// ==========================================

function preencherFormularioUsuario(usuario) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
    set('usuario-id', usuario.usuarioID || usuario.id);
    set('usuario-matricula', usuario.matricula);
    set('usuario-nome', usuario.nome);
    set('usuario-cpf', usuario.cpf);
    set('usuario-email', usuario.email);
    set('usuario-telefone', usuario.telefone);
    fecharModais();
}

function limparFormularioUsuario() {
    const form = document.getElementById('form-usuario');
    if (form) form.reset();
    ['usuario-id', 'usuario-matricula', 'usuario-nome', 'usuario-cpf', 'usuario-email', 'usuario-telefone'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
}

function preencherFormularioLivro(livro) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
    set('livro-id', livro.livroID || livro.id);
    set('livro-isbn', livro.isbn);
    set('livro-titulo', livro.titulo);
    set('livro-subtitulo', livro.subtitulo);
    set('livro-autor', livro.autor);
    set('livro-genero', livro.genero);
    set('livro-editora', livro.editora);
    set('livro-edicao', livro.edicao);
    set('livro-ano', livro.ano);
    fecharModais();
}

function limparFormularioLivro() {
    const form = document.getElementById('form-livro');
    if (form) form.reset();
    ['livro-id', 'livro-isbn', 'livro-titulo', 'livro-subtitulo', 'livro-autor', 'livro-genero', 'livro-editora', 'livro-edicao', 'livro-ano'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
}

function exibirModalGenerico(titulo, lista, callback, campoPrincipal, campoSub1, campoSub2) {
    let modal = document.getElementById('modal-pesquisa-nome') || document.getElementById('modal-pesquisa-titulo');
    let container = document.getElementById('lista-usuarios-encontrados') || document.getElementById('lista-livros-encontrados');

    if (!modal || !container) {
        modal = obterOuCriarModalDinamico();
        container = document.getElementById('modal-dinamico-lista');
    }

    const h3 = modal.querySelector('h3');
    if (h3) h3.innerText = titulo;

    container.innerHTML = '';
    lista.forEach(item => {
        const div = document.createElement('div');
        div.className = "item-selecao-modal";
        
        const sub1 = item[campoSub1] ? `${campoSub1.toUpperCase()}: ${item[campoSub1]}` : '';
        const sub2 = item[campoSub2] ? ` | ${item[campoSub2]}` : '';
        
        div.innerHTML = `<strong>${item[campoPrincipal]}</strong><br><small class="modal-item-sub">${sub1}${sub2}</small>`;
        div.onclick = () => callback(item);
        container.appendChild(div);
    });

    modal.style.display = 'flex';
}

function obterOuCriarModalDinamico() {
    let modal = document.getElementById('modal-dinamico-sistema');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-dinamico-sistema';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-card">
                <h3>Resultados Encontrados</h3>
                <p class="modal-subtitle">Clique no registro desejado para selecionar:</p>
                <div id="modal-dinamico-lista" class="modal-lista"></div>
                <div class="modal-footer">
                    <button type="button" id="btn-fechar-modal-dinamico" class="btn-cancelar">Cancelar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    return modal;
}

function fecharModais() {
    ['modal-pesquisa-titulo', 'modal-pesquisa-nome', 'modal-selecao-multipla', 'modal-dinamico-sistema'].forEach(id => {
        const m = document.getElementById(id);
        if (m) m.style.display = 'none';
    });
}

// Helper para tentar mais de uma rota de API (Rede de segurança)
async function buscarDadosAPI(urls) {
    for (const url of urls) {
        try {
            const res = await fetch(url);
            if (res.ok) {
                const dados = await res.json();
                return { ok: true, dados };
            }
        } catch (e) {}
    }
    return { ok: false, dados: null };
}

// ==========================================
// 7. CARREGAMENTO DAS TABELAS (SE EXISTIREM NA PÁGINA)
// ==========================================

async function carregarListaLivros() {
    const container = document.getElementById('tabela-livros-corpo');
    if (!container) return;
    try {
        const res = await fetch('/api/livros');
        const livros = await res.json();
        if (!res.ok || !Array.isArray(livros)) return;

        container.innerHTML = livros.map(livro => `
            <tr>
                <td>${livro.isbn}</td>
                <td>${livro.titulo}</td>
                <td>${livro.autor || '-'}</td>
                <td>
                    <button type="button" class="btn-editar-livro" data-id="${livro.livroID || livro.id}">Editar</button>
                    <button type="button" class="btn-excluir-livro" data-id="${livro.livroID || livro.id}">Excluir</button>
                </td>
            </tr>
        `).join('');
    } catch (e) {}
}

async function carregarListaUsuarios() {
    const container = document.getElementById('tabela-usuarios-corpo');
    if (!container) return;
    try {
        const res = await fetch('/api/usuarios');
        const usuarios = await res.json();
        if (!res.ok || !Array.isArray(usuarios)) return;

        container.innerHTML = usuarios.map(usr => `
            <tr>
                <td>${usr.matricula}</td>
                <td>${usr.nome}</td>
                <td>${usr.cpf}</td>
                <td>
                    <button type="button" class="btn-editar-usuario" data-id="${usr.usuarioID || usr.id}">Editar</button>
                    <button type="button" class="btn-excluir-usuario" data-id="${usr.usuarioID || usr.id}">Excluir</button>
                </td>
            </tr>
        `).join('');
    } catch (e) {}
}
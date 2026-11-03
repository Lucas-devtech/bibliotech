require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const path = require("path");
const crypto = require("crypto");

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.json());

// Autenticação administrativa: configure ADMIN_ACCESS_KEY no ambiente.
// Token assinado pelo servidor; o navegador não decide sozinho o perfil.
function criarTokenAdmin() {
  const payload = Buffer.from(JSON.stringify({ perfil: "adm", exp: Date.now() + 8 * 60 * 60 * 1000 })).toString("base64url");
  const assinatura = crypto.createHmac("sha256", process.env.ADMIN_ACCESS_KEY).update(payload).digest("base64url");
  return `${payload}.${assinatura}`;
}
function exigirAdmin(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const [payload, assinatura] = token.split(".");
  if (!process.env.ADMIN_ACCESS_KEY || !payload || !assinatura) {
    return res.status(401).json({ mensagem: "Acesso administrativo necessário." });
  }
  const esperado = crypto.createHmac("sha256", process.env.ADMIN_ACCESS_KEY).update(payload).digest();
  let recebido;
  try { recebido = Buffer.from(assinatura, "base64url"); } catch { recebido = Buffer.alloc(0); }
  if (recebido.length !== esperado.length || !crypto.timingSafeEqual(recebido, esperado)) {
    return res.status(401).json({ mensagem: "Sessão administrativa inválida." });
  }
  try {
    const dados = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (dados.perfil !== "adm" || dados.exp < Date.now()) {
      return res.status(401).json({ mensagem: "Sessão administrativa expirada." });
    }
    req.admin = dados;
    next();
  } catch {
    return res.status(401).json({ mensagem: "Sessão administrativa inválida." });
  }
}
app.post("/api/admin/login", (req, res) => {
  if (!process.env.ADMIN_ACCESS_KEY) {
    return res.status(503).json({ mensagem: "Configure ADMIN_ACCESS_KEY nas variáveis de ambiente do servidor." });
  }
  const senha = String(req.body.senha || "");
  const a = Buffer.from(senha);
  const b = Buffer.from(process.env.ADMIN_ACCESS_KEY);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ mensagem: "Senha administrativa incorreta." });
  }
  res.json({ token: criarTokenAdmin(), perfil: "adm", expiraEmHoras: 8 });
});


// ==========================================
// CONFIGURAÇÃO DO BANCO DE DADOS (NEON DB)
// ==========================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ==========================================
// ROTAS DE USUÁRIOS
// ==========================================

// 📋 Listar Todos os Usuários
app.get("/api/usuarios", async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM usuarios ORDER BY nome ASC;');
    res.status(200).json(resultado.rows);
  } catch (erro) {
    res.status(500).json({
      mensagem: "Erro interno ao listar usuários.",
      detalhe_do_erro: erro.message,
    });
  }
});

// 🔍 Pesquisar Usuário (por Nome, CPF ou Matrícula)
app.get("/api/usuarios/pesquisar/:termo", async (req, res) => {
  const { termo } = req.params;
  try {
    const sql = `
      SELECT * FROM usuarios 
      WHERE LOWER(nome) LIKE LOWER($1) 
         OR matricula::text = $2::text 
         OR cpf::text = $2::text
      ORDER BY nome ASC;
    `;
    const resultado = await pool.query(sql, [`%${termo}%`, termo]);

    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensagem: "Nenhum usuário encontrado." });
    }
    res.status(200).json(resultado.rows);
  } catch (erro) {
    res.status(500).json({
      mensagem: "Erro interno ao pesquisar usuário.",
      detalhe_do_erro: erro.message,
    });
  }
});

// 🔍 Buscar Usuário Específico por ID
app.get("/api/usuarios/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ mensagem: "ID de usuário inválido." });
  }

  try {
    const sql = 'SELECT * FROM usuarios WHERE "usuarioID" = $1;';
    const resultado = await pool.query(sql, [id]);

    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensagem: "Usuário não encontrado." });
    }
    res.status(200).json(resultado.rows[0]);
  } catch (erro) {
    res.status(500).json({
      mensagem: "Erro interno ao buscar usuário por ID.",
      detalhe_do_erro: erro.message,
    });
  }
});

// 📥 Cadastrar Usuário
app.post("/api/usuarios", async (req, res) => {
  const body = req.body;
  const Nome = body.nome || body.Nome;
  const Matricula = body.matricula || body.Matricula;
  const CPF = body.cpf || body.CPF;
  const Email = body.email || body.Email;
  const Telefone = body.telefone || body.Telefone;

  if (!Nome || !Matricula || !CPF) {
    return res.status(400).json({ mensagem: "Nome, Matrícula e CPF são obrigatórios." });
  }

  try {
    const sql = `
      INSERT INTO usuarios (nome, matricula, cpf, email, telefone) 
      VALUES ($1, $2, $3, $4, $5) 
      RETURNING "usuarioID";
    `;
    const valores = [
      Nome,
      parseInt(Matricula, 10),
      CPF,
      Email || null,
      Telefone || null,
    ];
    const resultado = await pool.query(sql, valores);

    res.status(201).json({
      mensagem: "Usuário cadastrado com sucesso!",
      id_gerado: resultado.rows[0].usuarioID,
    });
  } catch (erro) {
    console.error("Erro no POST /usuarios:", erro);
    if (erro.code === "23505") {
      return res.status(400).json({ mensagem: "Erro: Matrícula, CPF ou E-mail já cadastrados." });
    }
    res.status(500).json({
      mensagem: "Erro interno no servidor ao tentar cadastrar usuário.",
      detalhe_do_erro: erro.message,
    });
  }
});

// 🔄 Atualizar Usuário
app.put("/api/usuarios/:id", async (req, res) => {
  const id = parseInt(req.params.id || req.body.Id || req.body.usuarioID, 10);
  const body = req.body;
  const Nome = body.nome || body.Nome;
  const Matricula = body.matricula || body.Matricula;
  const CPF = body.cpf || body.CPF;
  const Email = body.email || body.Email;
  const Telefone = body.telefone || body.Telefone;

  if (isNaN(id) || id === 0) {
    return res.status(400).json({ mensagem: "ID do usuário é obrigatório para atualização." });
  }

  try {
    const sql = `
      UPDATE usuarios 
      SET nome = $1, matricula = $2, cpf = $3, email = $4, telefone = $5 
      WHERE "usuarioID" = $6;
    `;
    const valores = [
      Nome,
      parseInt(Matricula, 10),
      CPF,
      Email || null,
      Telefone || null,
      id,
    ];
    const resultado = await pool.query(sql, valores);

    if (resultado.rowCount === 0) {
      return res.status(404).json({ mensagem: "Usuário não encontrado para atualização." });
    }

    res.status(200).json({ mensagem: "Usuário atualizado com sucesso!" });
  } catch (erro) {
    console.error("Erro no PUT /usuarios:", erro);
    if (erro.code === "23505") {
      return res.status(400).json({ mensagem: "Erro: Dados pertencem a outro usuário." });
    }
    res.status(500).json({
      mensagem: "Erro interno no servidor ao tentar atualizar.",
      detalhe_do_erro: erro.message,
    });
  }
});

// ❌ Excluir Usuário
app.delete("/api/usuarios/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ mensagem: "ID de usuário inválido." });
  }

  try {
    const sql = 'DELETE FROM usuarios WHERE "usuarioID" = $1;';
    const resultado = await pool.query(sql, [id]);

    if (resultado.rowCount === 0) {
      return res.status(404).json({ mensagem: "Usuário não encontrado." });
    }
    res.status(200).json({ mensagem: "Usuário excluído com sucesso!" });
  } catch (erro) {
    if (erro.code === "23503") {
      return res.status(400).json({ mensagem: "Não é possível excluir usuário com histórico de empréstimos ativos." });
    }
    res.status(500).json({
      mensagem: "Erro ao excluir usuário.",
      detalhe_do_erro: erro.message,
    });
  }
});

// ==========================================
// ROTAS DE LIVROS
// ==========================================

// 📋 Listar Todos os Livros
app.get("/api/livros", async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM livros ORDER BY titulo ASC;');
    res.status(200).json(resultado.rows);
  } catch (erro) {
    res.status(500).json({
      mensagem: "Erro interno ao listar livros.",
      detalhe_do_erro: erro.message,
    });
  }
});

// 🔍 Pesquisar Livro (Título, Autor ou ISBN)
app.get("/api/livros/pesquisar/:termo", async (req, res) => {
  const { termo } = req.params;
  try {
    const sql = `
      SELECT * FROM livros 
      WHERE LOWER(titulo) LIKE LOWER($1) 
         OR LOWER(autor) LIKE LOWER($1) 
         OR isbn = $2
      ORDER BY titulo ASC;
    `;
    const resultado = await pool.query(sql, [`%${termo}%`, termo]);

    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensagem: "Nenhum livro encontrado." });
    }
    res.status(200).json(resultado.rows);
  } catch (erro) {
    res.status(500).json({
      mensagem: "Erro interno ao pesquisar livro.",
      detalhe_do_erro: erro.message,
    });
  }
});

// 🔍 Buscar Livro por ISBN (Compatibilidade)
app.get("/api/livros/ISBN/:ISBN", async (req, res) => {
  try {
    const sql = "SELECT * FROM livros WHERE isbn = $1;";
    const resultado = await pool.query(sql, [req.params.ISBN]);

    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensagem: "Livro não encontrado." });
    }
    res.status(200).json(resultado.rows[0]);
  } catch (erro) {
    res.status(500).json({
      mensagem: "Erro interno ao buscar livro por ISBN.",
      detalhe_do_erro: erro.message,
    });
  }
});

// 🔍 Buscar Livro por Título (Compatibilidade)
app.get("/api/livros/titulo/:titulo", async (req, res) => {
  try {
    const sql = "SELECT * FROM livros WHERE titulo ILIKE $1 ORDER BY titulo ASC;";
    const resultado = await pool.query(sql, [`%${req.params.titulo}%`]);

    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensagem: "Nenhum livro encontrado com este título." });
    }
    res.status(200).json(resultado.rows);
  } catch (erro) {
    res.status(500).json({
      mensagem: "Erro interno ao buscar livro por título.",
      detalhe_do_erro: erro.message,
    });
  }
});

// 🔍 Buscar Livro Específico por ID
app.get("/api/livros/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ mensagem: "ID de livro inválido." });
  }

  try {
    const sql = 'SELECT * FROM livros WHERE "livroID" = $1;';
    const resultado = await pool.query(sql, [id]);

    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensagem: "Livro não encontrado." });
    }
    res.status(200).json(resultado.rows[0]);
  } catch (erro) {
    res.status(500).json({
      mensagem: "Erro interno ao buscar livro por ID.",
      detalhe_do_erro: erro.message,
    });
  }
});

// 📥 Cadastrar Livro
app.post("/api/livros", async (req, res) => {
  const body = req.body;
  const Titulo = body.titulo || body.Titulo;
  const Subtitulo = body.subtitulo || body.Subtitulo;
  const Autor = body.autor || body.Autor;
  const Genero = body.genero || body.Genero;
  const Editora = body.editora || body.Editora;
  const Edicao = body.edicao || body.Edicao;
  const Ano = body.ano || body.Ano;
  const ISBN = body.isbn || body.ISBN;

  if (!Titulo || !ISBN) {
    return res.status(400).json({ mensagem: "Título e ISBN são obrigatórios." });
  }

  try {
    const anoTratado = Ano !== null && Ano !== undefined && Ano !== "" && !isNaN(Ano) ? parseInt(Ano, 10) : null;
    const sql = `
      INSERT INTO livros (titulo, subtitulo, autor, genero, editora, edicao, ano, isbn) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
      RETURNING "livroID";
    `;
    const valores = [
      Titulo,
      Subtitulo || null,
      Autor || null,
      Genero || null,
      Editora || null,
      Edicao || null,
      anoTratado,
      ISBN,
    ];
    const resultado = await pool.query(sql, valores);

    res.status(201).json({
      mensagem: "Livro salvo com sucesso!",
      id_gerado: resultado.rows[0].livroID,
    });
  } catch (erro) {
    console.error("Erro no POST /livros:", erro);
    if (erro.code === "23505") {
      return res.status(400).json({ mensagem: "Erro: Livro/ISBN já cadastrado." });
    }
    res.status(500).json({
      mensagem: "Erro ao salvar livro.",
      detalhe_do_erro: erro.message,
    });
  }
});

// 🔄 Atualizar Livro
app.put("/api/livros/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const body = req.body;
  const Titulo = body.titulo || body.Titulo;
  const Subtitulo = body.subtitulo || body.Subtitulo;
  const Autor = body.autor || body.Autor;
  const Genero = body.genero || body.Genero;
  const Editora = body.editora || body.Editora;
  const Edicao = body.edicao || body.Edicao;
  const Ano = body.ano || body.Ano;
  const ISBN = body.isbn || body.ISBN;

  if (isNaN(id) || !Titulo || !ISBN) {
    return res.status(400).json({ mensagem: "Dados obrigatórios não informados ou ID inválido." });
  }

  try {
    const anoTratado = Ano !== null && Ano !== undefined && Ano !== "" && !isNaN(Ano) ? parseInt(Ano, 10) : null;
    const sql = `
      UPDATE livros 
      SET titulo = $1, subtitulo = $2, autor = $3, genero = $4, editora = $5, edicao = $6, ano = $7, isbn = $8
      WHERE "livroID" = $9
      RETURNING "livroID";
    `;
    const valores = [
      Titulo,
      Subtitulo || null,
      Autor || null,
      Genero || null,
      Editora || null,
      Edicao || null,
      anoTratado,
      ISBN,
      id,
    ];
    const resultado = await pool.query(sql, valores);

    if (resultado.rowCount === 0) {
      return res.status(404).json({ mensagem: "Livro não encontrado para atualização." });
    }

    res.status(200).json({
      mensagem: "Livro atualizado com sucesso!",
      id_atualizado: resultado.rows[0].livroID,
    });
  } catch (erro) {
    res.status(500).json({
      mensagem: "Erro ao atualizar livro.",
      detalhe_do_erro: erro.message,
    });
  }
});

// ❌ Excluir Livro
app.delete("/api/livros/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ mensagem: "ID de livro inválido." });
  }

  try {
    const sql = 'DELETE FROM livros WHERE "livroID" = $1;';
    const resultado = await pool.query(sql, [id]);

    if (resultado.rowCount === 0) {
      return res.status(404).json({ mensagem: "Livro não encontrado para exclusão." });
    }
    res.status(200).json({ mensagem: "Livro excluído com sucesso!" });
  } catch (erro) {
    if (erro.code === "23503") {
      return res.status(400).json({ mensagem: "Não é possível excluir livro com empréstimo vinculado." });
    }
    res.status(500).json({
      mensagem: "Erro ao excluir livro.",
      detalhe_do_erro: erro.message,
    });
  }
});

// ==========================================
// ROTAS DE MOVIMENTAÇÕES (EMPRÉSTIMOS)
// ==========================================

// 🔍 Pesquisa de Livro para Empréstimos
app.get("/api/movimentacoes/pesquisar-livro/:termo", exigirAdmin, async (req, res) => {
  const { termo } = req.params;
  try {
    const consulta = `
      SELECT * FROM livros 
      WHERE LOWER(titulo) LIKE LOWER($1) 
         OR isbn = $2
    `;
    const resultado = await pool.query(consulta, [`%${termo}%`, termo]);

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        mensagem: "Nenhum livro encontrado com o parâmetro fornecido.",
      });
    }
    res.json(resultado.rows);
  } catch (erro) {
    console.error("Erro na busca de livro:", erro);
    res.status(500).json({
      mensagem: "Erro interno no servidor ao buscar livro.",
      detalhe_do_erro: erro.message,
    });
  }
});

// 🔍 Pesquisa de Usuário para Empréstimos
app.get("/api/movimentacoes/pesquisar-usuario/:termo", exigirAdmin, async (req, res) => {
  const { termo } = req.params;
  try {
    const consulta = `
      SELECT * FROM usuarios 
      WHERE LOWER(nome) LIKE LOWER($1) 
         OR matricula::text = $2::text 
         OR cpf::text = $2::text
    `;
    const resultado = await pool.query(consulta, [`%${termo}%`, termo]);

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        mensagem: "Nenhum usuário encontrado com o parâmetro fornecido.",
      });
    }
    res.json(resultado.rows);
  } catch (erro) {
    console.error("Erro na busca de usuário:", erro);
    res.status(500).json({
      mensagem: "Erro interno no servidor ao buscar usuário.",
      detalhe_do_erro: erro.message,
    });
  }
});

// 📥 Registrar Empréstimo
app.post("/api/emprestimos", exigirAdmin, async (req, res) => {
  const { fkUsuario, fkLivro, observacao, dataDevolucao } = req.body;
  const idUsuario = Number.parseInt(fkUsuario, 10);
  const idLivro = Number.parseInt(fkLivro, 10);
  if (!Number.isInteger(idUsuario) || !Number.isInteger(idLivro)) {
    return res.status(400).json({ mensagem: "Usuário e Livro inválidos ou não informados." });
  }

  try {
    const [usuarioResult, livroResult] = await Promise.all([
      pool.query(`SELECT u.*, to_jsonb(u)->>'status' AS status_atual
                  FROM usuarios u WHERE u."usuarioID"=$1`, [idUsuario]),
      pool.query(`SELECT l.*,
                    to_jsonb(l)->>'fkCategoria' AS categoria_fk,
                    to_jsonb(l)->>'categoriaID' AS categoria_id,
                    to_jsonb(l)->>'quantidade' AS quantidade_json,
                    COALESCE(to_jsonb(l)->>'ativo','true') AS ativo_json
                  FROM livros l WHERE l."livroID"=$1`, [idLivro])
    ]);
    if (!usuarioResult.rowCount) return res.status(404).json({ mensagem: "Usuário não encontrado." });
    if (!livroResult.rowCount) return res.status(404).json({ mensagem: "Livro não encontrado." });
    const usuario = usuarioResult.rows[0];
    const livro = livroResult.rows[0];
    if (String(usuario.status_atual || 'ativo').toLowerCase() !== 'ativo') {
      return res.status(400).json({ mensagem: "Usuário inativo. Empréstimo bloqueado." });
    }
    if (String(livro.ativo_json).toLowerCase() === 'false') {
      return res.status(400).json({ mensagem: "Livro inativo. Empréstimo bloqueado." });
    }

    const categoriaId = Number(livro.categoria_fk || livro.categoria_id || 0);
    const didatico = categoriaId === 1 || /did[aá]tico/i.test(String(livro.genero || livro.categoria || ""));
    let vencimento = null;
    if (didatico) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dataDevolucao || ""))) {
        return res.status(400).json({ mensagem: "Informe a data de devolução do livro didático." });
      }
      const dataEscolhida = new Date(`${dataDevolucao}T00:00:00`);
      const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
      const limite = new Date(); limite.setHours(0, 0, 0, 0); limite.setFullYear(limite.getFullYear() + 2);
      if (Number.isNaN(dataEscolhida.getTime()) || dataEscolhida <= hoje || dataEscolhida > limite) {
        return res.status(400).json({ mensagem: "A data de devolução deve ser posterior a hoje e em até dois anos." });
      }
      vencimento = dataDevolucao;
    }

    const reservaUsuario = await pool.query(
      `SELECT "reservaID" FROM reservas
       WHERE "fkUsuario"=$1 AND "fkLivro"=$2 AND status='disponivel'
       ORDER BY "dataReserva" ASC, "reservaID" ASC LIMIT 1`,
      [idUsuario, idLivro]
    );
    const [emprestimosAtivos, reservasPendentes] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total FROM mov_livros WHERE "fkLivro"=$1 AND LOWER(status)='ativo'`, [idLivro]),
      pool.query(`SELECT COUNT(*)::int AS total FROM reservas WHERE "fkLivro"=$1 AND status IN ('ativa','disponivel')`, [idLivro])
    ]);
    const quantidade = Math.max(1, Number.parseInt(livro.quantidade_json || "1", 10) || 1);
    const livres = quantidade - emprestimosAtivos.rows[0].total - reservasPendentes.rows[0].total;
    if (!reservaUsuario.rowCount && livres <= 0) {
      return res.status(409).json({ mensagem: "Não há exemplar disponível. Inclua o aluno na fila de reservas." });
    }

    const query = `
      INSERT INTO mov_livros ("fkUsuario", "fkLivro", observacao, data, "dataDevolucaoPrevista", status)
      VALUES ($1, $2, $3, NOW(),
              COALESCE($4::date::timestamp, NOW() + INTERVAL '10 days'), 'ativo')
      RETURNING *;
    `;
    const resultado = await pool.query(query, [idUsuario, idLivro, observacao || null, vencimento]);
    if (reservaUsuario.rowCount) {
      await pool.query(`UPDATE reservas SET status='atendida' WHERE "reservaID"=$1`, [reservaUsuario.rows[0].reservaID]);
    }
    res.status(201).json({ mensagem: "Empréstimo realizado com sucesso!", dados: resultado.rows[0] });
  } catch (erro) {
    console.error("❌ Erro no POST /api/emprestimos:", erro);
    res.status(500).json({
      mensagem: "Erro interno no servidor ao registrar empréstimo. Confira a migração do banco.",
      detalhe_do_erro: erro.message
    });
  }
});


// 📋 Buscar Empréstimos Ativos por Usuário
app.get("/api/emprestimos/usuario/:fkUsuario", exigirAdmin, async (req, res) => {
  const { fkUsuario } = req.params;
  const idUsuario = parseInt(fkUsuario, 10);

  if (isNaN(idUsuario)) {
    return res.status(400).json({ mensagem: "ID do usuário é inválido." });
  }

  try {
    const query = `
      SELECT 
        m."movimentacaoID",
        m.data AS "dataEmprestimo",
        m."dataDevolucaoPrevista",
        m.observacao,             
        l.titulo AS "tituloLivro"
      FROM mov_livros m
      JOIN livros l ON m."fkLivro" = l."livroID"
      WHERE m."fkUsuario" = $1 AND LOWER(m.status) = 'ativo';
    `;

    const resultado = await pool.query(query, [idUsuario]);
    res.json(resultado.rows);
  } catch (erro) {
    console.error("❌ Erro no GET /api/emprestimos/usuario:", erro);
    res.status(500).json({
      mensagem: "Erro ao buscar empréstimos ativos.",
      detalhe_do_erro: erro.message,
    });
  }
});

// 🔄 Devolver Livro
app.put("/api/emprestimos/:idMovimentacao/devolver", exigirAdmin, async (req, res) => {
  const idMov = parseInt(req.params.idMovimentacao, 10);

  if (isNaN(idMov)) {
    return res.status(400).json({ mensagem: "ID de movimentação inválido." });
  }

  try {
    const query = `
      UPDATE mov_livros 
      SET status = 'devolvido', "dataDevolucaoReal" = NOW()
      WHERE "movimentacaoID" = $1 AND LOWER(status) = 'ativo'
      RETURNING *;
    `;

    const resultado = await pool.query(query, [idMov]);

    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensagem: "Empréstimo não encontrado ou já devolvido." });
    }

    const proximaReserva = await pool.query(
      `UPDATE reservas
       SET status='disponivel', "disponivelEm"=NOW()
       WHERE status='ativa' AND "reservaID" = (
         SELECT "reservaID" FROM reservas
         WHERE "fkLivro" = (SELECT "fkLivro" FROM mov_livros WHERE "movimentacaoID"=$1)
           AND status='ativa'
         ORDER BY "dataReserva" ASC, "reservaID" ASC
         LIMIT 1
       )
       RETURNING "reservaID", "fkUsuario"`, [idMov]
    );
    res.json({
      mensagem: proximaReserva.rowCount
        ? "Devolução registrada. O livro foi disponibilizado para a próxima pessoa da fila."
        : "Devolução registrada com sucesso!"
    });
  } catch (erro) {
    console.error("❌ Erro no PUT /api/emprestimos/devolver:", erro);
    res.status(500).json({
      mensagem: "Erro ao processar devolução.",
      detalhe_do_erro: erro.message,
    });
  }
});


// ==========================================
// ROTAS DE RESERVAS (FILA FIFO)
// Requer executar database/migration_atividade.sql no Neon.
// ==========================================
app.post("/api/reservas", exigirAdmin, async (req, res) => {
  const fkUsuario = Number.parseInt(req.body.fkUsuario, 10);
  const fkLivro = Number.parseInt(req.body.fkLivro, 10);
  if (!Number.isInteger(fkUsuario) || !Number.isInteger(fkLivro)) {
    return res.status(400).json({ mensagem: "Usuário e livro são obrigatórios." });
  }
  try {
    const existente = await pool.query(
      `SELECT "reservaID" FROM reservas
       WHERE "fkUsuario"=$1 AND "fkLivro"=$2 AND status IN ('ativa','disponivel')
       LIMIT 1`, [fkUsuario, fkLivro]
    );
    if (existente.rowCount) return res.status(409).json({ mensagem: "Este usuário já possui uma reserva ativa para este livro." });
    const [livro, usuario] = await Promise.all([
      pool.query(`SELECT "livroID" FROM livros WHERE "livroID"=$1`, [fkLivro]),
      pool.query(`SELECT "usuarioID" FROM usuarios WHERE "usuarioID"=$1`, [fkUsuario])
    ]);
    if (!livro.rowCount || !usuario.rowCount) return res.status(404).json({ mensagem: "Livro ou usuário não encontrado." });
    const result = await pool.query(
      `INSERT INTO reservas ("fkUsuario","fkLivro","dataReserva",status)
       VALUES ($1,$2,NOW(),'ativa') RETURNING *`, [fkUsuario, fkLivro]
    );
    await pool.query(
      `UPDATE reservas
       SET status='disponivel', "disponivelEm"=NOW()
       WHERE "reservaID" = (
         SELECT r."reservaID" FROM reservas r
         WHERE r."fkLivro"=$1 AND r.status='ativa'
         ORDER BY r."dataReserva" ASC, r."reservaID" ASC LIMIT 1
       )
       AND NOT EXISTS (
         SELECT 1 FROM mov_livros m
         WHERE m."fkLivro"=$1 AND LOWER(m.status)='ativo'
       )
       AND NOT EXISTS (
         SELECT 1 FROM reservas r2
         WHERE r2."fkLivro"=$1 AND r2.status='disponivel'
       )`, [fkLivro]
    );
    return res.status(201).json({ mensagem: "Reserva incluída na fila com sucesso.", dados: result.rows[0] });
  } catch (erro) {
    console.error("Erro ao registrar reserva:", erro);
    if (erro.code === "23505") return res.status(409).json({ mensagem: "Este usuário já possui uma reserva ativa para este livro." });
    res.status(500).json({ mensagem: "Erro ao registrar reserva. Execute a migração do banco.", detalhe_do_erro: erro.message });
  }
});

app.get("/api/reservas/para-emprestimo", exigirAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r."reservaID", r."fkUsuario", r."fkLivro", r."dataReserva",
              u.nome AS "nomeUsuario", l.titulo AS "tituloLivro"
       FROM reservas r
       JOIN usuarios u ON u."usuarioID"=r."fkUsuario"
       JOIN livros l ON l."livroID"=r."fkLivro"
       WHERE r.status='disponivel'
       ORDER BY r."dataReserva" ASC, r."reservaID" ASC`
    );
    res.json(result.rows);
  } catch (erro) {
    res.status(500).json({ mensagem: "Erro ao carregar reservas prontas para retirada.", detalhe_do_erro: erro.message });
  }
});

app.get("/api/reservas/checar-livro/:livroID", exigirAdmin, async (req, res) => {
  const livroID = Number.parseInt(req.params.livroID, 10);
  if (!Number.isInteger(livroID)) return res.status(400).json({ mensagem: "ID do livro inválido." });
  try {
    const result = await pool.query(
      `SELECT "reservaID", "fkUsuario", status, "dataReserva"
       FROM reservas WHERE "fkLivro"=$1 AND status IN ('ativa','disponivel')
       ORDER BY "dataReserva" ASC, "reservaID" ASC`, [livroID]
    );
    res.json({ reservado: result.rowCount > 0, fila: result.rows });
  } catch (erro) {
    res.status(500).json({ mensagem: "Erro ao verificar reservas do livro.", detalhe_do_erro: erro.message });
  }
});

app.get("/api/reservas/livro/:fkLivro", exigirAdmin, async (req, res) => {
  const fkLivro = Number.parseInt(req.params.fkLivro, 10);
  if (!Number.isInteger(fkLivro)) return res.status(400).json({ mensagem: "ID do livro inválido." });
  try {
    const result = await pool.query(
      `SELECT r."reservaID", r."fkUsuario", r."fkLivro", r."dataReserva", r.status,
              r."disponivelEm", u.nome AS "nomeUsuario"
       FROM reservas r JOIN usuarios u ON u."usuarioID"=r."fkUsuario"
       WHERE r."fkLivro"=$1 AND r.status IN ('ativa','disponivel')
       ORDER BY r."dataReserva" ASC, r."reservaID" ASC`, [fkLivro]
    );
    res.json(result.rows);
  } catch (erro) {
    res.status(500).json({ mensagem: "Erro ao consultar fila de reservas.", detalhe_do_erro: erro.message });
  }
});

// ==========================================
// SERVIR ARQUIVOS ESTÁTICOS
// ==========================================
app.use(express.static(path.join(__dirname, "../public")));

if (require.main === module) {
  const PORT = 3000;
  app.listen(PORT, () => {
    console.log(`\n🚀 Servidor local ativo em: http://localhost:${PORT}\n`);
  });
}

module.exports = app;
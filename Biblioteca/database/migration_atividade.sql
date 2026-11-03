-- Biblio Tech: ajuste aditivo para compatibilidade com o guia da atividade.
-- CRIE UM BRANCH/BACKUP NA NEON ANTES DE EXECUTAR.
-- Preserva registros: renomeia a coluna identificadora, não recria tabelas.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'mov_livros'
      AND column_name = 'idMovimentacao'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'mov_livros'
      AND column_name = 'movimentacaoID'
  ) THEN
    ALTER TABLE mov_livros RENAME COLUMN "idMovimentacao" TO "movimentacaoID";
  END IF;
END $$;

ALTER TABLE livros
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE mov_livros
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ativo';
ALTER TABLE mov_livros
  ADD COLUMN IF NOT EXISTS "dataDevolucaoPrevista" TIMESTAMP;
ALTER TABLE mov_livros
  ADD COLUMN IF NOT EXISTS "dataDevolucaoReal" TIMESTAMP;

CREATE TABLE IF NOT EXISTS reservas (
  "reservaID" BIGSERIAL PRIMARY KEY,
  "fkUsuario" INTEGER NOT NULL REFERENCES usuarios("usuarioID") ON DELETE CASCADE,
  "fkLivro" INTEGER NOT NULL REFERENCES livros("livroID") ON DELETE CASCADE,
  "dataReserva" TIMESTAMP NOT NULL DEFAULT NOW(),
  "disponivelEm" TIMESTAMP,
  status VARCHAR(20) NOT NULL DEFAULT 'ativa'
    CHECK (status IN ('ativa','disponivel','cancelada','atendida'))
);

CREATE INDEX IF NOT EXISTS idx_reservas_fila_livro
  ON reservas ("fkLivro", status, "dataReserva", "reservaID");
CREATE INDEX IF NOT EXISTS idx_reservas_usuario
  ON reservas ("fkUsuario", status);

COMMIT;

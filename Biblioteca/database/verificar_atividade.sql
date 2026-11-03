-- Conferência das colunas exigidas pelo guia da atividade.
SELECT table_name, column_name
FROM information_schema.columns
WHERE (table_name = 'mov_livros' AND column_name IN ('idMovimentacao', 'movimentacaoID'))
   OR (table_name = 'livros' AND column_name = 'ativo')
ORDER BY table_name, column_name;

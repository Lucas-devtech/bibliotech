'use strict';

require('dotenv').config();
const app = require('./routes');

const PORT = Number(process.env.PORT || 3000);
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🚀 Server rodando em http://localhost:${PORT}\n`);
  });
}

module.exports = app;

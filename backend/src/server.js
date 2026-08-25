const path = require('path');
const express = require('express');
const cors = require('cors');

require('./db/schema');

const categoriasRouter = require('./routes/categorias');
const lancamentosRouter = require('./routes/lancamentos');
const dashboardRouter = require('./routes/dashboard');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api/categorias', categoriasRouter);
app.use('/api/lancamentos', lancamentosRouter);
app.use('/api/dashboard', dashboardRouter);

app.use(express.static(path.join(__dirname, '..', '..', 'frontend')));

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});

const path = require('path');
const express = require('express');
const cors = require('cors');

require('./db/schema');

const categoriasRouter = require('./routes/categorias');
const lancamentosRouter = require('./routes/lancamentos');
const dashboardRouter = require('./routes/dashboard');
const rebanhoRouter = require('./routes/rebanho');
const paricoesRouter = require('./routes/paricoes');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/categorias', categoriasRouter);
app.use('/api/lancamentos', lancamentosRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/rebanho', rebanhoRouter);
app.use('/api/rebanho', paricoesRouter);

app.use(express.static(path.join(__dirname, '..', '..', 'frontend')));

module.exports = app;

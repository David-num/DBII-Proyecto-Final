const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');
const cfg = require('../config');
const users = require('../infrastructure/users');
const { repositorioDe } = require('../infrastructure/repositoryFactory');
const instituciones = require('../domain/institutions');
const HistorialService = require('../application/HistorialService');
const { AppError } = require('../domain/errors');

const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, '../../../frontend')));

const wrap = fn => async (req, res, next) => { try { const r = await fn(req, res); if (r !== undefined) res.json(r); } catch (e) { next(e); } };

// intentos de login limitados (fuerza bruta)
const intentos = new Map();
function limitarLogin(ip) {
  const ahora = Date.now(); const v = (intentos.get(ip) || []).filter(t => ahora - t < 60000);
  if (v.length >= 10) throw new AppError(429, 'Demasiados intentos, espere un minuto');
  v.push(ahora); intentos.set(ip, v);
}

app.post('/api/login', wrap(async (req, res) => {
  limitarLogin(req.ip);
  const u = users.buscar(String(req.body.usuario || ''));
  if (!u || !users.verificar(u, String(req.body.password || ''))) throw new AppError(401, 'Usuario o contraseña incorrectos');
  const token = jwt.sign({ sub: u.usuario, nombre: u.nombre, institucion: u.institucion, rol: u.rol }, cfg.jwtSecret, { expiresIn: '4h' });
  return { token, usuario: { usuario: u.usuario, nombre: u.nombre, rol: u.rol }, institucion: instituciones[u.institucion] };
}));

// Autenticación: el token define la institución -> el repositorio (motor) se resuelve aquí, una sola vez
function auth(req, res, next) {
  try {
    const t = (req.headers.authorization || '').replace(/^Bearer /, '');
    const u = jwt.verify(t, cfg.jwtSecret);
    req.svc = new HistorialService(repositorioDe(u.institucion), instituciones[u.institucion], u);
    req.user = u; next();
  } catch (e) { next(e instanceof AppError ? e : new AppError(401, 'Sesión no válida')); }
}
const api = express.Router();
api.use(auth);

api.get('/me', wrap(req => ({ usuario: req.user, institucion: instituciones[req.user.institucion] })));
api.get('/profesionales', wrap(req => req.svc.listarProfesionales()));
api.get('/profesionales/:id/consultas-sin-pago', wrap(req => req.svc.listarConsultasSinPago(req.params.id)));
api.get('/pagos', wrap(req => req.svc.listarPagos({
  profesionalId: req.query.profesionalId, desde: req.query.desde, hasta: req.query.hasta
})));
api.post('/pagos', wrap(async (req, res) => { res.status(201); return req.svc.registrarPago(req.body); }));
api.post('/pagos/:id/consultas', wrap(req => req.svc.vincularConsultasAPago(req.params.id, req.body?.consultaIds)));
api.post('/pagos/:id/pagar', wrap(req => req.svc.marcarPagoPagado(req.params.id, req.body)));
api.get('/camas', wrap(req => req.svc.listarCamasDisponibles(req.query.tipo)));
api.get('/facturas', wrap(req => req.svc.listarFacturas({
  pacienteId: req.query.pacienteId, desde: req.query.desde, hasta: req.query.hasta
})));
api.post('/facturas', wrap(async (req, res) => { res.status(201); return req.svc.registrarFactura(req.body); }));
api.post('/facturas/:id/pagar', wrap(req => req.svc.marcarFacturaPagada(req.params.id)));
api.get('/pacientes', wrap(req => req.svc.listarPacientes(req.query.q, req.query.inactivos === '1')));
api.post('/pacientes', wrap(async (req, res) => { res.status(201); return req.svc.crearPaciente(req.body); }));
api.get('/pacientes/:id/historial', wrap(req => req.svc.obtenerHistorial(req.params.id)));
api.get('/pacientes/:id/seguro', wrap(req => req.svc.obtenerSeguro(req.params.id)));
api.post('/pacientes/:id/seguro', wrap(req => req.svc.guardarSeguro(req.params.id, req.body)));
api.post('/pacientes/:id/consultas', wrap(async (req, res) => { res.status(201); return req.svc.registrarConsulta(req.params.id, req.body); }));
api.post('/pacientes/:id/consultas/:cid/diagnosticos', wrap(async (req, res) => { res.status(201); return req.svc.agregarDiagnostico(req.params.id, req.params.cid, req.body); }));
api.post('/pacientes/:id/consultas/:cid/diagnosticos/:did/recetas', wrap(async (req, res) => { res.status(201); return req.svc.recetarMedicamento(req.params.id, req.params.cid, req.params.did, req.body); }));
api.post('/pacientes/:id/consultas/:cid/diagnosticos/:did/tratamientos', wrap(async (req, res) => { res.status(201); return req.svc.agregarTratamiento(req.params.id, req.params.cid, req.params.did, req.body); }));
api.post('/pacientes/:id/extras/:tipo', wrap(async (req, res) => { res.status(201); return req.svc.registrarExtra(req.params.id, req.params.tipo, req.body); }));
api.post('/pacientes/:id/baja', wrap(req => req.svc.darDeBaja(req.params.id, req.body)));
api.post('/pacientes/:id/reactivar', wrap(req => req.svc.reactivar(req.params.id)));
app.use('/api', api);

app.use((err, req, res, next) => {  // eslint-disable-line
  if (err instanceof AppError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  const bd = /ECONNREFUSED|ENOTFOUND|timed out|Server selection|connect/i.test(String(err.message) + String(err.code));
  res.status(bd ? 503 : 500).json({ error: bd ? 'No se pudo conectar con la base de datos de la institución' : 'Error interno del servidor' });
});

module.exports = app;

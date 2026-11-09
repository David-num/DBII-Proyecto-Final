// Laboratorio Clínico · MongoDB.
// Decisión de modelado: diagnósticos, medicamentos y tratamientos se EMBEBEN en la consulta (acotados y siempre se leen juntos,
// y así cada escritura es atómica sobre un solo documento). Los resultados de exámenes se REFERENCIAN por pacienteId
// en su propia colección porque un paciente acumula cientos y su estructura cambia según el examen.
const { MongoClient, ObjectId } = require('mongodb');
const { AppError } = require('../../domain/errors');

const oid = v => { try { return new ObjectId(String(v)); } catch { throw new AppError(404, 'Identificador inválido'); } };
const iso = d => (d ? new Date(d).toISOString() : null);
const mapPac = d => ({
  id: String(d._id), nombre: d.nombre, apellido: d.apellido, fechaNacimiento: d.fechaNacimiento, genero: d.genero,
  documento: d.documento, telefono: d.telefono, direccion: d.direccion, tipoSangre: d.tipoSangre,
  activo: d.activo !== false, motivoBaja: d.motivoBaja, detalleBaja: d.detalleBaja, fechaBaja: iso(d.fechaBaja)
});
const mapDx = d => ({ id: String(d._id), codigo: d.codigo, descripcion: d.descripcion, tipo: d.tipo, fecha: iso(d.fecha),
  medicamentos: (d.medicamentos || []).map(m => ({ id: String(m._id), nombre: m.nombre, dosis: m.dosis, frecuencia: m.frecuencia, duracion: m.duracion })),
  tratamientos: (d.tratamientos || []).map(t => ({ id: String(t._id), descripcion: t.descripcion, fechaInicio: t.fechaInicio, fechaFin: t.fechaFin, estado: t.estado })) });

class MongoRepository {
  constructor(cfg) { this.cfg = cfg; this.ready = null; }

  _init() {
    if (!this.ready) this.ready = this._connect().catch(e => { this.ready = null; throw e; });
    return this.ready;
  }
  async _connect() {
    this.client = new MongoClient(this.cfg.uri, { serverSelectionTimeoutMS: 4000 });
    await this.client.connect();
    const db = this.client.db(this.cfg.db);
    this.pac = db.collection('pacientes'); this.prof = db.collection('profesionales');
    this.con = db.collection('consultas'); this.res = db.collection('resultados');
    await this.pac.createIndex({ apellido: 1, nombre: 1 });
    await this.con.createIndex({ pacienteId: 1, fecha: -1 });
    await this.res.createIndex({ pacienteId: 1, fecha: -1 });
    if (await this.prof.countDocuments() === 0)
      await this.prof.insertMany([{ nombre: 'Dra. Patricia Solís', colegiado: 'M-3001' }, { nombre: 'Dr. Mario Castillo', colegiado: 'M-3002' }]);
  }

  async listarProfesionales() {
    await this._init();
    return (await this.prof.find().sort({ nombre: 1 }).toArray()).map(p => ({ id: String(p._id), nombre: p.nombre }));
  }

  async listarPacientes({ q, inactivos }) {
    await this._init();
    const f = {};
    if (!inactivos) f.activo = { $ne: false };
    if (q) { const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); f.$or = [{ nombre: re }, { apellido: re }, { documento: re }]; }
    return (await this.pac.find(f).sort({ apellido: 1, nombre: 1 }).limit(200).toArray()).map(mapPac);
  }

  async crearPaciente(d) {
    await this._init();
    if (d.documento && await this.pac.findOne({ documento: d.documento })) throw new AppError(409, 'Ya existe un paciente con ese DPI');
    const doc = { ...d, activo: true, creado: new Date() };
    const r = await this.pac.insertOne(doc);
    return mapPac({ ...doc, _id: r.insertedId });
  }

  async obtenerPaciente(pid) {
    await this._init();
    const d = await this.pac.findOne({ _id: oid(pid) });
    return d ? mapPac(d) : null;
  }

  async obtenerHistorial(pid) {
    const paciente = await this.obtenerPaciente(pid);
    if (!paciente) return null;
    const p = oid(pid);
    const [con, res, profs] = await Promise.all([
      this.con.find({ pacienteId: p }).sort({ fecha: -1 }).toArray(),
      this.res.find({ pacienteId: p }).sort({ fecha: -1 }).limit(100).toArray(),
      this.prof.find().toArray()
    ]);
    const nombre = Object.fromEntries(profs.map(x => [String(x._id), x.nombre]));
    return {
      paciente,
      consultas: con.map(c => ({ id: String(c._id), fecha: iso(c.fecha), motivo: c.motivo, observaciones: c.observaciones,
        profesional: nombre[String(c.profesionalId)] || '—', diagnosticos: (c.diagnosticos || []).map(mapDx) })),
      extras: res.map(r => ({ id: String(r._id), tipo: 'resultado', fecha: iso(r.fecha), datos: { examen: r.examen, ...r.campos } }))
    };
  }

  async registrarConsulta(pid, d) {
    await this._init();
    const prof = await this.prof.findOne({ _id: oid(d.profesionalId) });
    if (!prof) throw new AppError(404, 'Médico no encontrado');
    const doc = { pacienteId: oid(pid), profesionalId: prof._id, fecha: new Date(), motivo: d.motivo, observaciones: d.observaciones || '', diagnosticos: [] };
    const r = await this.con.insertOne(doc);
    return { id: String(r.insertedId), fecha: iso(doc.fecha), motivo: d.motivo, observaciones: d.observaciones, profesional: prof.nombre, diagnosticos: [] };
  }

  async agregarDiagnostico(pid, cid, d) {
    await this._init();
    const dx = { _id: new ObjectId(), codigo: d.codigo, descripcion: d.descripcion, tipo: d.tipo, fecha: new Date(), medicamentos: [], tratamientos: [] };
    const r = await this.con.updateOne({ _id: oid(cid), pacienteId: oid(pid) }, { $push: { diagnosticos: dx } });  // atómico (1 documento)
    if (!r.matchedCount) throw new AppError(404, 'Consulta no encontrada');
    return mapDx(dx);
  }

  async recetarMedicamento(pid, cid, did, d) {
    await this._init();
    const m = { _id: new ObjectId(), nombre: d.nombre, dosis: d.dosis, frecuencia: d.frecuencia, duracion: d.duracion };
    const r = await this.con.updateOne({ _id: oid(cid), pacienteId: oid(pid), 'diagnosticos._id': oid(did) },
      { $push: { 'diagnosticos.$.medicamentos': m } });
    if (!r.matchedCount) throw new AppError(404, 'Diagnóstico no encontrado');
    return { id: String(m._id), nombre: m.nombre, dosis: m.dosis, frecuencia: m.frecuencia, duracion: m.duracion };
  }

  async agregarTratamiento(pid, cid, did, d) {
    await this._init();
    const t = { _id: new ObjectId(), descripcion: d.descripcion, fechaInicio: d.fechaInicio, fechaFin: d.fechaFin, estado: d.estado };
    const r = await this.con.updateOne({ _id: oid(cid), pacienteId: oid(pid), 'diagnosticos._id': oid(did) },
      { $push: { 'diagnosticos.$.tratamientos': t } });
    if (!r.matchedCount) throw new AppError(404, 'Diagnóstico no encontrado');
    return { id: String(t._id), descripcion: t.descripcion, fechaInicio: t.fechaInicio, fechaFin: t.fechaFin, estado: t.estado };
  }

  async registrarExtra(pid, tipo, d) {
    await this._init();
    if (tipo !== 'resultado') throw new AppError(400, 'Registro no soportado');
    const { examen, ...campos } = d;
    const doc = { pacienteId: oid(pid), examen, fecha: new Date(), campos };
    await this.res.insertOne(doc);
    return { tipo, fecha: iso(doc.fecha), datos: d };
  }

  async alergiasDe() { return []; }

  async darDeBaja(pid, d) {
    await this._init();
    await this.pac.updateOne({ _id: oid(pid) }, { $set: { activo: false, motivoBaja: d.motivo, detalleBaja: d.detalle || '', fechaBaja: new Date() } });
    return this.obtenerPaciente(pid);
  }
  async reactivar(pid) {
    await this._init();
    await this.pac.updateOne({ _id: oid(pid) }, { $set: { activo: true }, $unset: { motivoBaja: '', detalleBaja: '', fechaBaja: '' } });
    return this.obtenerPaciente(pid);
  }

  // Este motor no maneja honorarios en el modelo del proyecto.
  async registrarPago() { throw new AppError(400, 'Esta institución no maneja pagos de honorarios'); }
  async listarPagos() { throw new AppError(400, 'Esta institución no maneja pagos de honorarios'); }
  async vincularConsultasAPago() { throw new AppError(400, 'Esta institución no maneja pagos de honorarios'); }
  async marcarPagoPagado() { throw new AppError(400, 'Esta institución no maneja pagos de honorarios'); }
  async listarConsultasSinPago() { throw new AppError(400, 'Esta institución no maneja pagos de honorarios'); }

  // Camas y facturación no forman parte del modelo del laboratorio.
  async listarCamasDisponibles() { throw new AppError(400, 'Esta institución no maneja camas'); }
  async obtenerSeguro() { throw new AppError(400, 'Esta institución no maneja facturación'); }
  async guardarSeguro() { throw new AppError(400, 'Esta institución no maneja facturación'); }
  async listarFacturas() { throw new AppError(400, 'Esta institución no maneja facturación'); }
  async registrarFactura() { throw new AppError(400, 'Esta institución no maneja facturación'); }
  async marcarFacturaPagada() { throw new AppError(400, 'Esta institución no maneja facturación'); }
}
module.exports = MongoRepository;

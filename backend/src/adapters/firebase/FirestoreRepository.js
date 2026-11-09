// Clínica Odontológica · Firebase (Cloud Firestore). Servicio administrado: sin personal técnico propio.
// Modelo documental:
//   pacientes/{id}                         -> datos del paciente
//   pacientes/{id}/consultas/{id}          -> citas; EMBEBEN diagnósticos, medicamentos y tratamientos (acotados, se leen juntos)
//   pacientes/{id}/procedimientos/{id}     -> REFERENCIADOS en subcolección (crecen con los años; se paginan aparte)
//   profesionales/{id}                     -> odontólogos
const admin = require('firebase-admin');
const path = require('path');
const crypto = require('crypto');
const { AppError } = require('../../domain/errors');

const mapPac = (id, d) => ({
  id, nombre: d.nombre, apellido: d.apellido, fechaNacimiento: d.fechaNacimiento, genero: d.genero,
  telefono: d.telefono, direccion: d.direccion, activo: d.activo !== false,
  motivoBaja: d.motivoBaja, detalleBaja: d.detalleBaja, fechaBaja: d.fechaBaja || null
});

class FirestoreRepository {
  constructor(cfg) { this.cfg = cfg; this.ready = null; }

  _init() {
    if (!this.ready) this.ready = this._connect().catch(e => { this.ready = null; throw e; });
    return this.ready;
  }
  async _connect() {
    if (!admin.apps.length) {
      if (this.cfg.serviceAccount)
        admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(process.cwd(), this.cfg.serviceAccount))) });
      else admin.initializeApp({ projectId: this.cfg.projectId });          // emulador (FIRESTORE_EMULATOR_HOST)
    }
    this.db = admin.firestore();
    const s = await this.db.collection('profesionales').limit(1).get();
    if (s.empty) {
      const b = this.db.batch();
      for (const [n, c] of [['Dr. Jorge Barrios', 'O-4001'], ['Dra. Sofía Paiz', 'O-4002']]) b.set(this.db.collection('profesionales').doc(), { nombre: n, colegiado: c });
      await b.commit();
    }
  }

  async listarProfesionales() {
    await this._init();
    return (await this.db.collection('profesionales').get()).docs.map(d => ({ id: d.id, nombre: d.data().nombre }));
  }

  async listarPacientes({ q, inactivos }) {
    await this._init();
    // Firestore no tiene búsqueda de texto parcial: con el volumen de una clínica pequeña se filtra en memoria.
    const all = (await this.db.collection('pacientes').get()).docs.map(d => mapPac(d.id, d.data()));
    const t = q.toLowerCase();
    return all.filter(p => (inactivos || p.activo) && (!t || `${p.nombre} ${p.apellido}`.toLowerCase().includes(t)))
      .sort((a, b) => (a.apellido + a.nombre).localeCompare(b.apellido + b.nombre)).slice(0, 200);
  }

  async crearPaciente(d) {
    await this._init();
    const ref = this.db.collection('pacientes').doc();
    const doc = { ...d, activo: true, creado: new Date().toISOString() };
    await ref.set(doc);
    return mapPac(ref.id, doc);
  }

  async obtenerPaciente(pid) {
    await this._init();
    const s = await this.db.collection('pacientes').doc(String(pid)).get();
    return s.exists ? mapPac(s.id, s.data()) : null;
  }

  async obtenerHistorial(pid) {
    const paciente = await this.obtenerPaciente(pid);
    if (!paciente) return null;
    const ref = this.db.collection('pacientes').doc(String(pid));
    const [con, pro, profs] = await Promise.all([
      ref.collection('consultas').orderBy('fecha', 'desc').get(),
      ref.collection('procedimientos').orderBy('fecha', 'desc').limit(100).get(),
      this.db.collection('profesionales').get()
    ]);
    const nombre = Object.fromEntries(profs.docs.map(d => [d.id, d.data().nombre]));
    return {
      paciente,
      consultas: con.docs.map(s => { const c = s.data(); return { id: s.id, fecha: c.fecha, motivo: c.motivo, observaciones: c.observaciones,
        profesional: nombre[c.profesionalId] || '—',
        diagnosticos: (c.diagnosticos || []).map(d => ({ ...d, medicamentos: d.medicamentos || [], tratamientos: d.tratamientos || [] })) }; }),
      extras: pro.docs.map(s => ({ id: s.id, tipo: 'procedimiento', fecha: s.data().fecha, datos: s.data().datos }))
    };
  }

  async registrarConsulta(pid, d) {
    await this._init();
    const prof = await this.db.collection('profesionales').doc(String(d.profesionalId)).get();
    if (!prof.exists) throw new AppError(404, 'Odontólogo no encontrado');
    const ref = this.db.collection('pacientes').doc(String(pid)).collection('consultas').doc();
    const doc = { profesionalId: prof.id, fecha: new Date().toISOString(), motivo: d.motivo, observaciones: d.observaciones || '', diagnosticos: [] };
    await ref.set(doc);
    return { id: ref.id, fecha: doc.fecha, motivo: d.motivo, observaciones: d.observaciones, profesional: prof.data().nombre, diagnosticos: [] };
  }

  // Transacción de Firestore: lectura + escritura atómicas (reintenta automáticamente ante conflictos)
  async _mutarConsulta(pid, cid, fn) {
    await this._init();
    const ref = this.db.collection('pacientes').doc(String(pid)).collection('consultas').doc(String(cid));
    return this.db.runTransaction(async tx => {
      const s = await tx.get(ref);
      if (!s.exists) throw new AppError(404, 'Consulta no encontrada');
      const dxs = s.data().diagnosticos || [];
      const out = fn(dxs);
      tx.update(ref, { diagnosticos: dxs });
      return out;
    });
  }

  agregarDiagnostico(pid, cid, d) {
    const dx = { id: crypto.randomUUID(), codigo: d.codigo, descripcion: d.descripcion, tipo: d.tipo, fecha: new Date().toISOString(), medicamentos: [], tratamientos: [] };
    return this._mutarConsulta(pid, cid, dxs => { dxs.push(dx); return dx; });
  }

  recetarMedicamento(pid, cid, did, d) {
    const m = { id: crypto.randomUUID(), nombre: d.nombre, dosis: d.dosis, frecuencia: d.frecuencia, duracion: d.duracion };
    return this._mutarConsulta(pid, cid, dxs => {
      const dx = dxs.find(x => x.id === did);
      if (!dx) throw new AppError(404, 'Diagnóstico no encontrado');
      (dx.medicamentos = dx.medicamentos || []).push(m); return m;
    });
  }

  agregarTratamiento(pid, cid, did, d) {
    const t = { id: crypto.randomUUID(), descripcion: d.descripcion, fechaInicio: d.fechaInicio, fechaFin: d.fechaFin, estado: d.estado };
    return this._mutarConsulta(pid, cid, dxs => {
      const dx = dxs.find(x => x.id === did);
      if (!dx) throw new AppError(404, 'Diagnóstico no encontrado');
      (dx.tratamientos = dx.tratamientos || []).push(t); return t;
    });
  }

  async registrarExtra(pid, tipo, d) {
    await this._init();
    if (tipo !== 'procedimiento') throw new AppError(400, 'Registro no soportado');
    const doc = { fecha: new Date().toISOString(), datos: d };
    await this.db.collection('pacientes').doc(String(pid)).collection('procedimientos').add(doc);
    return { tipo, ...doc };
  }

  async alergiasDe() { return []; }

  async darDeBaja(pid, d) {
    await this._init();
    await this.db.collection('pacientes').doc(String(pid)).update({ activo: false, motivoBaja: d.motivo, detalleBaja: d.detalle || '', fechaBaja: new Date().toISOString() });
    return this.obtenerPaciente(pid);
  }
  async reactivar(pid) {
    await this._init();
    const F = admin.firestore.FieldValue;
    await this.db.collection('pacientes').doc(String(pid)).update({ activo: true, motivoBaja: F.delete(), detalleBaja: F.delete(), fechaBaja: F.delete() });
    return this.obtenerPaciente(pid);
  }

  // Este motor no maneja honorarios en el modelo del proyecto.
  async registrarPago() { throw new AppError(400, 'Esta institución no maneja pagos de honorarios'); }
  async listarPagos() { throw new AppError(400, 'Esta institución no maneja pagos de honorarios'); }
  async vincularConsultasAPago() { throw new AppError(400, 'Esta institución no maneja pagos de honorarios'); }
  async marcarPagoPagado() { throw new AppError(400, 'Esta institución no maneja pagos de honorarios'); }
  async listarConsultasSinPago() { throw new AppError(400, 'Esta institución no maneja pagos de honorarios'); }

  // Camas y facturación no forman parte del modelo de la clínica.
  async listarCamasDisponibles() { throw new AppError(400, 'Esta institución no maneja camas'); }
  async obtenerSeguro() { throw new AppError(400, 'Esta institución no maneja facturación'); }
  async guardarSeguro() { throw new AppError(400, 'Esta institución no maneja facturación'); }
  async listarFacturas() { throw new AppError(400, 'Esta institución no maneja facturación'); }
  async registrarFactura() { throw new AppError(400, 'Esta institución no maneja facturación'); }
  async marcarFacturaPagada() { throw new AppError(400, 'Esta institución no maneja facturación'); }
}
module.exports = FirestoreRepository;

// Centro Médico Pediátrico · MySQL 8 (InnoDB). Muchas consultas cortas y frecuentes; esquema fijo y relacional.
const mysql = require('mysql2/promise');
const { AppError } = require('../../domain/errors');

const id = v => { const n = parseInt(v, 10); if (Number.isNaN(n)) throw new AppError(404, 'Identificador inválido'); return n; };
const dt = s => (s ? String(s).replace(' ', 'T') : null);
const mapPac = r => ({
  id: String(r.id), nombre: r.nombre, apellido: r.apellido, fechaNacimiento: r.fecha_nacimiento, genero: r.genero,
  responsable: r.nombre_padre_madre, telefono: r.telefono_contacto, direccion: r.direccion, tipoSangre: r.tipo_sangre,
  activo: !!r.activo, motivoBaja: r.motivo_baja, detalleBaja: r.detalle_baja, fechaBaja: dt(r.fecha_baja)
});
const mapPago = r => ({
  id: String(r.id), profesionalId: String(r.pediatra_id), profesional: r.profesional,
  periodo: r.periodo, tipoPago: r.tipo_pago, cantidadConsultas: r.cantidad_consultas,
  monto: Number(r.monto), fechaPago: r.fecha_pago ? String(r.fecha_pago).slice(0, 10) : null, estado: r.estado
});

class MySqlRepository {
  constructor(cfg) { this.pool = mysql.createPool({ ...cfg, dateStrings: true, connectionLimit: 10 }); this.ready = null; }

  _init() {
    if (!this.ready) this.ready = this._seed().catch(e => { this.ready = null; throw e; });
    return this.ready;
  }
  async _seed() {
    const [[{ n }]] = await this.pool.query('SELECT COUNT(*) n FROM pediatra');
    if (n > 0) return;
    await this.pool.query(`INSERT INTO pediatra(nombre,apellido,numero_colegiado) VALUES ('Ana','Morales','P-2001'),('Luis','Herrera','P-2002')`);
  }
  async _q(sql, p) { await this._init(); const [r] = await this.pool.query(sql, p); return r; }
  async _tx(fn) {
    await this._init();
    const c = await this.pool.getConnection();
    try { await c.beginTransaction(); const r = await fn(c); await c.commit(); return r; }
    catch (e) { await c.rollback(); throw e; }
    finally { c.release(); }
  }

  async listarProfesionales() {
    return (await this._q(`SELECT id, CONCAT(nombre,' ',apellido) nombre FROM pediatra ORDER BY apellido`)).map(r => ({ id: String(r.id), nombre: r.nombre }));
  }

  async listarPacientes({ q, inactivos }) {
    const like = `%${q}%`;
    return (await this._q(`SELECT * FROM paciente WHERE (? = '' OR nombre LIKE ? OR apellido LIKE ? OR nombre_padre_madre LIKE ?)
      AND (? OR activo=1) ORDER BY apellido, nombre LIMIT 200`, [q, like, like, like, inactivos ? 1 : 0])).map(mapPac);
  }

  async crearPaciente(d) {
    const r = await this._q(`INSERT INTO paciente(nombre,apellido,fecha_nacimiento,genero,nombre_padre_madre,telefono_contacto,direccion,tipo_sangre)
      VALUES(?,?,?,?,?,?,?,?)`, [d.nombre, d.apellido, d.fechaNacimiento, d.genero, d.responsable, d.telefono || null, d.direccion || null, d.tipoSangre || null]);
    return this.obtenerPaciente(r.insertId);
  }

  async obtenerPaciente(pid) {
    const r = await this._q('SELECT * FROM paciente WHERE id=?', [id(pid)]);
    return r[0] ? mapPac(r[0]) : null;
  }

  async obtenerHistorial(pid) {
    const paciente = await this.obtenerPaciente(pid);
    if (!paciente) return null;
    const n = id(pid);
    const con = await this._q(`SELECT c.id, c.fecha, c.motivo, c.observaciones, c.peso, c.talla, CONCAT(p.nombre,' ',p.apellido) profesional
      FROM consulta c JOIN pediatra p ON p.id=c.pediatra_id WHERE c.paciente_id=? ORDER BY c.fecha DESC`, [n]);
    const dx = await this._q(`SELECT d.* FROM diagnostico d JOIN consulta c ON c.id=d.consulta_id WHERE c.paciente_id=? ORDER BY d.fecha`, [n]);
    const rx = await this._q(`SELECT r.id, r.diagnostico_id, m.nombre, r.dosis, r.frecuencia, r.duracion FROM receta_medicamento r
      JOIN medicamento m ON m.id=r.medicamento_id JOIN diagnostico d ON d.id=r.diagnostico_id JOIN consulta c ON c.id=d.consulta_id
      WHERE c.paciente_id=? ORDER BY r.id`, [n]);
    const tx = await this._q(`SELECT t.id, t.diagnostico_id, t.descripcion, t.fecha_inicio, t.fecha_fin, t.estado
      FROM tratamiento t JOIN diagnostico d ON d.id=t.diagnostico_id JOIN consulta c ON c.id=d.consulta_id
      WHERE c.paciente_id=? ORDER BY t.id`, [n]);
    const al = await this._q(`SELECT a.nombre, a.tipo, pa.severidad FROM paciente_alergia pa JOIN alergia a ON a.id=pa.alergia_id WHERE pa.paciente_id=?`, [n]);
    const va = await this._q(`SELECT v.nombre, v.enfermedad_previene, v.dosis_requeridas, e.numero_dosis, e.fecha_aplicacion, e.lote, e.proxima_dosis_fecha
      FROM esquema_vacunacion e JOIN vacuna v ON v.id=e.vacuna_id WHERE e.paciente_id=? ORDER BY e.fecha_aplicacion DESC`, [n]);
    const cr = await this._q(`SELECT fecha, peso, talla, perimetro_cefalico FROM curva_crecimiento WHERE paciente_id=? ORDER BY fecha DESC`, [n]);

    const consultas = con.map(c => ({
      id: String(c.id), fecha: dt(c.fecha), motivo: c.motivo, observaciones: c.observaciones, profesional: c.profesional,
      diagnosticos: dx.filter(d => d.consulta_id === c.id).map(d => ({
        id: String(d.id), codigo: d.codigo_cie10, descripcion: d.descripcion, tipo: d.tipo, fecha: dt(d.fecha),
        medicamentos: rx.filter(r => r.diagnostico_id === d.id).map(r => ({
          id: String(r.id), nombre: r.nombre, dosis: r.dosis, frecuencia: r.frecuencia, duracion: r.duracion })),
        tratamientos: tx.filter(t => t.diagnostico_id === d.id).map(t => ({
          id: String(t.id), descripcion: t.descripcion, fechaInicio: t.fecha_inicio, fechaFin: t.fecha_fin, estado: t.estado }))
      }))
    }));
    const extras = [
      ...al.map(a => ({ tipo: 'alergia', datos: { nombre: a.nombre, tipo: a.tipo, severidad: a.severidad } })),
      ...va.map(v => ({ tipo: 'vacuna', fecha: v.fecha_aplicacion, datos: { nombre: v.nombre, enfermedad: v.enfermedad_previene,
        numeroDosis: v.numero_dosis, dosisRequeridas: v.dosis_requeridas, fecha: v.fecha_aplicacion, lote: v.lote, proximaDosis: v.proxima_dosis_fecha } })),
      ...cr.map(c => ({ tipo: 'crecimiento', fecha: c.fecha, datos: { fecha: c.fecha, peso: +c.peso, talla: +c.talla, perimetroCefalico: c.perimetro_cefalico == null ? undefined : +c.perimetro_cefalico } }))
    ];
    return { paciente, consultas, extras };
  }

  registrarConsulta(pid, d) {
    return this._tx(async c => {
      const [[ped]] = await c.query(`SELECT id, CONCAT(nombre,' ',apellido) nombre FROM pediatra WHERE id=?`, [id(d.profesionalId)]);
      if (!ped) throw new AppError(404, 'Pediatra no encontrado');
      const [r] = await c.query(`INSERT INTO consulta(paciente_id,pediatra_id,fecha,motivo,observaciones) VALUES(?,?,NOW(),?,?)`, [id(pid), ped.id, d.motivo, d.observaciones || null]);
      return { id: String(r.insertId), fecha: new Date().toISOString(), motivo: d.motivo, observaciones: d.observaciones, profesional: ped.nombre, diagnosticos: [] };
    });
  }

  agregarDiagnostico(pid, cid, d) {
    return this._tx(async c => {
      const [[con]] = await c.query('SELECT id FROM consulta WHERE id=? AND paciente_id=? FOR UPDATE', [id(cid), id(pid)]);
      if (!con) throw new AppError(404, 'Consulta no encontrada');
      const [r] = await c.query('INSERT INTO diagnostico(consulta_id,codigo_cie10,descripcion,tipo,fecha) VALUES(?,?,?,?,NOW())', [con.id, d.codigo || null, d.descripcion, d.tipo]);
      return { id: String(r.insertId), codigo: d.codigo, descripcion: d.descripcion, tipo: d.tipo, fecha: new Date().toISOString(), medicamentos: [], tratamientos: [] };
    });
  }

  recetarMedicamento(pid, cid, did, d) {
    return this._tx(async c => {
      const [[dx]] = await c.query(`SELECT d.id FROM diagnostico d JOIN consulta c ON c.id=d.consulta_id
        WHERE d.id=? AND c.id=? AND c.paciente_id=? FOR UPDATE`, [id(did), id(cid), id(pid)]);
      if (!dx) throw new AppError(404, 'Diagnóstico no encontrado');
      await c.query('INSERT IGNORE INTO medicamento(nombre) VALUES(?)', [d.nombre]);
      const [[m]] = await c.query('SELECT id FROM medicamento WHERE nombre=?', [d.nombre]);
      const [r] = await c.query('INSERT INTO receta_medicamento(diagnostico_id,medicamento_id,dosis,frecuencia,duracion,fecha) VALUES(?,?,?,?,?,NOW())',
        [dx.id, m.id, d.dosis, d.frecuencia || null, d.duracion || null]);
      return { id: String(r.insertId), nombre: d.nombre, dosis: d.dosis, frecuencia: d.frecuencia, duracion: d.duracion };
    });
  }

  agregarTratamiento(pid, cid, did, d) {
    return this._tx(async c => {
      const [[dx]] = await c.query(`SELECT d.id FROM diagnostico d JOIN consulta c ON c.id=d.consulta_id
        WHERE d.id=? AND c.id=? AND c.paciente_id=? FOR UPDATE`, [id(did), id(cid), id(pid)]);
      if (!dx) throw new AppError(404, 'Diagnóstico no encontrado');
      const [r] = await c.query('INSERT INTO tratamiento(diagnostico_id,descripcion,fecha_inicio,fecha_fin,estado) VALUES(?,?,?,?,?)',
        [dx.id, d.descripcion, d.fechaInicio, d.fechaFin, d.estado]);
      return { id: String(r.insertId), descripcion: d.descripcion, fechaInicio: d.fechaInicio, fechaFin: d.fechaFin, estado: d.estado };
    });
  }

  registrarExtra(pid, tipo, d) {
    return this._tx(async c => {
      const p = id(pid);
      if (tipo === 'alergia') {
        let [[a]] = await c.query('SELECT id FROM alergia WHERE LOWER(nombre)=LOWER(?)', [d.nombre]);
        if (!a) { const [r] = await c.query('INSERT INTO alergia(nombre,tipo) VALUES(?,?)', [d.nombre, d.tipo]); a = { id: r.insertId }; }
        await c.query('INSERT INTO paciente_alergia(paciente_id,alergia_id,severidad) VALUES(?,?,?) ON DUPLICATE KEY UPDATE severidad=VALUES(severidad)', [p, a.id, d.severidad]);
      } else if (tipo === 'vacuna') {
        let [[v]] = await c.query('SELECT id FROM vacuna WHERE LOWER(nombre)=LOWER(?)', [d.nombre]);
        if (!v) { const [r] = await c.query('INSERT INTO vacuna(nombre,enfermedad_previene,dosis_requeridas) VALUES(?,?,?)', [d.nombre, d.enfermedad || 'N/D', d.dosisRequeridas || 1]); v = { id: r.insertId }; }
        await c.query('INSERT INTO esquema_vacunacion(paciente_id,vacuna_id,numero_dosis,fecha_aplicacion,lote,proxima_dosis_fecha) VALUES(?,?,?,?,?,?)',
          [p, v.id, d.numeroDosis, d.fecha, d.lote || null, d.proximaDosis || null]);
      } else if (tipo === 'crecimiento') {
        await c.query('INSERT INTO curva_crecimiento(paciente_id,fecha,peso,talla,perimetro_cefalico) VALUES(?,?,?,?,?)', [p, d.fecha, d.peso, d.talla, d.perimetroCefalico || null]);
      } else throw new AppError(400, 'Registro no soportado');
      return { tipo, datos: d };
    });
  }

  async alergiasDe(pid) {
    return (await this._q('SELECT a.nombre FROM paciente_alergia pa JOIN alergia a ON a.id=pa.alergia_id WHERE pa.paciente_id=?', [id(pid)])).map(r => r.nombre);
  }
  async darDeBaja(pid, d) {
    await this._q('UPDATE paciente SET activo=0, motivo_baja=?, detalle_baja=?, fecha_baja=NOW() WHERE id=?', [d.motivo, d.detalle || null, id(pid)]);
    return this.obtenerPaciente(pid);
  }
  async reactivar(pid) {
    await this._q('UPDATE paciente SET activo=1, motivo_baja=NULL, detalle_baja=NULL, fecha_baja=NULL WHERE id=?', [id(pid)]);
    return this.obtenerPaciente(pid);
  }

  // ---------- pagos de honorarios ----------
  registrarPago(profesionalId, d) {
    return this._tx(async c => {
      const [[ped]] = await c.query(`SELECT id, CONCAT(nombre,' ',apellido) nombre FROM pediatra WHERE id=?`, [id(profesionalId)]);
      if (!ped) throw new AppError(404, 'Pediatra no encontrado');
      const [r] = await c.query(`INSERT INTO pago_pediatra(pediatra_id,periodo,tipo_pago,cantidad_consultas,monto,fecha_pago,estado)
        VALUES(?,?,?,?,?,?,?)`,
        [ped.id, d.periodo, d.tipoPago, d.cantidadConsultas || 0, d.monto, d.fechaPago, d.estado]);
      const [[row]] = await c.query(`SELECT p.*, CONCAT(e.nombre,' ',e.apellido) profesional
        FROM pago_pediatra p JOIN pediatra e ON e.id=p.pediatra_id WHERE p.id=?`, [r.insertId]);
      return mapPago(row);
    });
  }

  async listarPagos(f = {}) {
    const conds = [], p = [];
    if (f.profesionalId) { p.push(id(f.profesionalId)); conds.push('p.pediatra_id=?'); }
    if (f.desde) { p.push(f.desde); conds.push('p.fecha_pago >= ?'); }
    if (f.hasta) { p.push(f.hasta); conds.push('p.fecha_pago <= ?'); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    return (await this._q(`SELECT p.*, CONCAT(e.nombre,' ',e.apellido) profesional
      FROM pago_pediatra p JOIN pediatra e ON e.id=p.pediatra_id ${where}
      ORDER BY p.fecha_pago DESC, p.id DESC`, p)).map(mapPago);
  }

  async listarConsultasSinPago(profesionalId) {
    return (await this._q(`SELECT c.id, c.fecha, c.motivo, c.paciente_id, CONCAT(p.nombre,' ',p.apellido) paciente
      FROM consulta c JOIN paciente p ON p.id=c.paciente_id
      WHERE c.pediatra_id=? AND c.pago_id IS NULL
      ORDER BY c.fecha DESC LIMIT 200`, [id(profesionalId)]))
      .map(x => ({ id: String(x.id), fecha: dt(x.fecha), motivo: x.motivo,
        pacienteId: String(x.paciente_id), paciente: x.paciente }));
  }

  vincularConsultasAPago(pagoId, consultaIds) {
    return this._tx(async c => {
      const [[pago]] = await c.query('SELECT * FROM pago_pediatra WHERE id=? FOR UPDATE', [id(pagoId)]);
      if (!pago) throw new AppError(404, 'Pago no encontrado');
      const ids = consultaIds.map(id);
      const [rows] = await c.query('SELECT id FROM consulta WHERE id IN (?) AND pediatra_id=? AND pago_id IS NULL FOR UPDATE',
        [ids, pago.pediatra_id]);
      if (rows.length !== ids.length)
        throw new AppError(409, 'Alguna consulta no existe, no pertenece al pediatra o ya tiene pago');
      await c.query('UPDATE consulta SET pago_id=? WHERE id IN (?)', [pago.id, ids]);
      const [[{ n }]] = await c.query('SELECT COUNT(*) n FROM consulta WHERE pago_id=?', [pago.id]);
      await c.query('UPDATE pago_pediatra SET cantidad_consultas=? WHERE id=?', [n, pago.id]);
      const [[row]] = await c.query(`SELECT p.*, CONCAT(e.nombre,' ',e.apellido) profesional
        FROM pago_pediatra p JOIN pediatra e ON e.id=p.pediatra_id WHERE p.id=?`, [pago.id]);
      return mapPago(row);
    });
  }

  marcarPagoPagado(pagoId, fechaPago) {
    return this._tx(async c => {
      const [r] = await c.query(`UPDATE pago_pediatra SET estado='pagado', fecha_pago=? WHERE id=?`, [fechaPago, id(pagoId)]);
      if (!r.affectedRows) throw new AppError(404, 'Pago no encontrado');
      const [[row]] = await c.query(`SELECT p.*, CONCAT(e.nombre,' ',e.apellido) profesional
        FROM pago_pediatra p JOIN pediatra e ON e.id=p.pediatra_id WHERE p.id=?`, [id(pagoId)]);
      return mapPago(row);
    });
  }

  // ---------- no soportado en el Centro Pediátrico ----------
  async listarCamasDisponibles() { throw new AppError(400, 'Esta institución no maneja camas'); }
  async obtenerSeguro() { throw new AppError(400, 'Esta institución no maneja facturación'); }
  async guardarSeguro() { throw new AppError(400, 'Esta institución no maneja facturación'); }
  async listarFacturas() { throw new AppError(400, 'Esta institución no maneja facturación'); }
  async registrarFactura() { throw new AppError(400, 'Esta institución no maneja facturación'); }
  async marcarFacturaPagada() { throw new AppError(400, 'Esta institución no maneja facturación'); }
}
module.exports = MySqlRepository;

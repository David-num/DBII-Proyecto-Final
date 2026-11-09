// Hospital General · PostgreSQL. Consulta = cita; transacciones ACID para cada escritura compuesta.
const { Pool } = require('pg');
const { AppError } = require('../../domain/errors');

const id = v => { const n = parseInt(v, 10); if (Number.isNaN(n)) throw new AppError(404, 'Identificador inválido'); return n; };
const iso = d => (d ? new Date(d).toISOString() : null);

const PAC = `id, nombre, apellido, to_char(fecha_nacimiento,'YYYY-MM-DD') AS fecha_nacimiento, genero, dpi, direccion,
  telefono, tipo_sangre, activo, motivo_baja, detalle_baja, fecha_baja`;
const mapPac = r => ({
  id: String(r.id), nombre: r.nombre, apellido: r.apellido, fechaNacimiento: r.fecha_nacimiento, genero: r.genero,
  documento: r.dpi, direccion: r.direccion, telefono: r.telefono, tipoSangre: r.tipo_sangre,
  activo: r.activo, motivoBaja: r.motivo_baja, detalleBaja: r.detalle_baja, fechaBaja: iso(r.fecha_baja)
});
const fecha = d => (d ? new Date(d).toISOString().slice(0, 10) : null);
const mapPago = r => ({
  id: String(r.id), profesionalId: String(r.medico_id), profesional: r.profesional,
  periodo: r.periodo, tipoPago: r.tipo_pago, cantidadConsultas: r.cantidad_consultas,
  monto: Number(r.monto), fechaPago: fecha(r.fecha_pago), estado: r.estado
});
const mapSeguro = r => ({
  id: String(r.id), pacienteId: String(r.paciente_id), aseguradora: r.aseguradora,
  numeroPoliza: r.numero_poliza, cobertura: r.cobertura
});
const mapFactura = r => ({
  id: String(r.id), pacienteId: String(r.paciente_id), paciente: r.paciente,
  concepto: r.concepto, monto: Number(r.monto), fecha: r.fecha, estadoPago: r.estado_pago,
  citaId: r.cita_id ? String(r.cita_id) : null, internamientoId: r.internamiento_id ? String(r.internamiento_id) : null
});

class PostgresRepository {
  constructor(cfg) { this.pool = new Pool({ connectionString: cfg.url }); this.ready = null; }

  _init() {
    if (!this.ready) this.ready = this._seed().catch(e => { this.ready = null; throw e; });
    return this.ready;
  }
  async _seed() {
    const { rows } = await this.pool.query(`SELECT COUNT(*)::int n FROM empleado WHERE tipo_personal='Médico'`);
    if (rows[0].n === 0) {
      const esp = (await this.pool.query(`INSERT INTO especialidad(nombre,descripcion) VALUES('Medicina General','Atención general') RETURNING id`)).rows[0].id;
      for (const [n, a, c] of [['Laura', 'Méndez', 'C-1001'], ['Carlos', 'Ramírez', 'C-1002']])
        await this.pool.query(`INSERT INTO empleado(nombre,apellido,tipo_personal,especialidad_id,numero_colegiado) VALUES($1,$2,'Médico',$3,$4)`, [n, a, esp, c]);
    }
    const camas = await this.pool.query(`SELECT COUNT(*)::int n FROM cama_habitacion`);
    if (camas.rows[0].n === 0) {
      await this.pool.query(`INSERT INTO cama_habitacion(numero_habitacion,numero_cama,tipo,estado) VALUES
        ('101','A','General','Disponible'), ('101','B','General','Ocupada'),
        ('102','A','UCI','Disponible'), ('102','B','UCI','Disponible'),
        ('103','A','Aislamiento','Disponible'), ('103','B','Aislamiento','Ocupada')`);
    }
  }
  async _tx(fn) {
    await this._init();
    const c = await this.pool.connect();
    try { await c.query('BEGIN'); const r = await fn(c); await c.query('COMMIT'); return r; }
    catch (e) { await c.query('ROLLBACK'); throw e; }
    finally { c.release(); }
  }
  async _q(sql, p) { await this._init(); return (await this.pool.query(sql, p)).rows; }

  async listarProfesionales() {
    const r = await this._q(`SELECT id, nombre||' '||apellido AS nombre FROM empleado WHERE tipo_personal='Médico' ORDER BY apellido`);
    return r.map(x => ({ id: String(x.id), nombre: x.nombre }));
  }

  async listarPacientes({ q, inactivos }) {
    const like = `%${q}%`;
    const r = await this._q(`SELECT ${PAC} FROM paciente
      WHERE ($1 = '' OR nombre ILIKE $2 OR apellido ILIKE $2 OR dpi ILIKE $2) AND ($3 OR activo)
      ORDER BY apellido, nombre LIMIT 200`, [q, like, inactivos]);
    return r.map(mapPac);
  }

  async crearPaciente(d) {
    try {
      const r = await this._q(`INSERT INTO paciente(nombre,apellido,fecha_nacimiento,genero,dpi,direccion,telefono,tipo_sangre)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${PAC}`,
        [d.nombre, d.apellido, d.fechaNacimiento, d.genero, d.documento, d.direccion || null, d.telefono || null, d.tipoSangre || null]);
      return mapPac(r[0]);
    } catch (e) {
      if (e.code === '23505') throw new AppError(409, 'Ya existe un paciente con ese DPI');
      throw e;
    }
  }

  async obtenerPaciente(pid) {
    const r = await this._q(`SELECT ${PAC} FROM paciente WHERE id=$1`, [id(pid)]);
    return r[0] ? mapPac(r[0]) : null;
  }

  async obtenerHistorial(pid) {
    const paciente = await this.obtenerPaciente(pid);
    if (!paciente) return null;
    const n = id(pid);
    const citas = await this._q(`SELECT c.id, c.fecha_hora, c.motivo, c.observaciones, e.nombre||' '||e.apellido AS profesional
      FROM cita c JOIN empleado e ON e.id=c.medico_id WHERE c.paciente_id=$1 ORDER BY c.fecha_hora DESC`, [n]);
    const dx = await this._q(`SELECT id, cita_id, codigo_cie10, descripcion, tipo, fecha FROM diagnostico
      WHERE paciente_id=$1 AND cita_id IS NOT NULL ORDER BY fecha`, [n]);
    const rx = await this._q(`SELECT r.id, r.diagnostico_id, m.nombre, r.dosis, r.frecuencia, r.duracion
      FROM receta_medicamento r JOIN medicamento m ON m.id=r.medicamento_id
      JOIN diagnostico d ON d.id=r.diagnostico_id WHERE d.paciente_id=$1 ORDER BY r.id`, [n]);
    const tx = await this._q(`SELECT t.id, t.diagnostico_id, t.descripcion,
      to_char(t.fecha_inicio,'YYYY-MM-DD') AS fecha_inicio, to_char(t.fecha_fin,'YYYY-MM-DD') AS fecha_fin, t.estado
      FROM tratamiento t JOIN diagnostico d ON d.id=t.diagnostico_id WHERE d.paciente_id=$1 ORDER BY t.id`, [n]);
    const al = await this._q(`SELECT a.nombre, a.tipo, pa.severidad, pa.fecha_registro FROM paciente_alergia pa
      JOIN alergia a ON a.id=pa.alergia_id WHERE pa.paciente_id=$1`, [n]);
    const consultas = citas.map(c => ({
      id: String(c.id), fecha: iso(c.fecha_hora), motivo: c.motivo, observaciones: c.observaciones, profesional: c.profesional,
      diagnosticos: dx.filter(d => d.cita_id === c.id).map(d => ({
        id: String(d.id), codigo: d.codigo_cie10, descripcion: d.descripcion, tipo: d.tipo, fecha: iso(d.fecha),
        medicamentos: rx.filter(r => r.diagnostico_id === d.id).map(r => ({
          id: String(r.id), nombre: r.nombre, dosis: r.dosis, frecuencia: r.frecuencia, duracion: r.duracion })),
        tratamientos: tx.filter(t => t.diagnostico_id === d.id).map(t => ({
          id: String(t.id), descripcion: t.descripcion, fechaInicio: t.fecha_inicio, fechaFin: t.fecha_fin, estado: t.estado }))
      }))
    }));
    const extras = al.map(a => ({ tipo: 'alergia', fecha: iso(a.fecha_registro), datos: { nombre: a.nombre, tipo: a.tipo, severidad: a.severidad } }));
    return { paciente, consultas, extras };
  }

  registrarConsulta(pid, d) {
    return this._tx(async c => {
      const med = (await c.query(`SELECT id, especialidad_id, nombre||' '||apellido AS nombre FROM empleado WHERE id=$1 AND tipo_personal='Médico'`, [id(d.profesionalId)])).rows[0];
      if (!med) throw new AppError(404, 'Médico no encontrado');
      const r = (await c.query(`INSERT INTO cita(paciente_id,medico_id,especialidad_id,fecha_hora,motivo,estado,observaciones)
        VALUES($1,$2,$3,NOW(),$4,'atendida',$5) RETURNING id, fecha_hora`, [id(pid), med.id, med.especialidad_id, d.motivo, d.observaciones || null])).rows[0];
      return { id: String(r.id), fecha: iso(r.fecha_hora), motivo: d.motivo, observaciones: d.observaciones, profesional: med.nombre, diagnosticos: [] };
    });
  }

  agregarDiagnostico(pid, cid, d) {
    return this._tx(async c => {
      const cita = (await c.query(`SELECT id, medico_id FROM cita WHERE id=$1 AND paciente_id=$2 FOR UPDATE`, [id(cid), id(pid)])).rows[0];
      if (!cita) throw new AppError(404, 'Consulta no encontrada');
      const r = (await c.query(`INSERT INTO diagnostico(paciente_id,cita_id,medico_id,codigo_cie10,descripcion,tipo,fecha)
        VALUES($1,$2,$3,$4,$5,$6,NOW()) RETURNING id, fecha`, [id(pid), cita.id, cita.medico_id, d.codigo || 'N/D', d.descripcion, d.tipo])).rows[0];
      return { id: String(r.id), codigo: d.codigo, descripcion: d.descripcion, tipo: d.tipo, fecha: iso(r.fecha), medicamentos: [], tratamientos: [] };
    });
  }

  recetarMedicamento(pid, cid, did, d) {
    return this._tx(async c => {
      const dx = (await c.query(`SELECT id FROM diagnostico WHERE id=$1 AND cita_id=$2 AND paciente_id=$3 FOR UPDATE`, [id(did), id(cid), id(pid)])).rows[0];
      if (!dx) throw new AppError(404, 'Diagnóstico no encontrado');
      let m = (await c.query(`SELECT id FROM medicamento WHERE LOWER(nombre)=LOWER($1)`, [d.nombre])).rows[0];
      if (!m) m = (await c.query(`INSERT INTO medicamento(nombre,presentacion,concentracion,via_administracion_default) VALUES($1,'N/D','N/D','Oral') RETURNING id`, [d.nombre])).rows[0];
      const r = (await c.query(`INSERT INTO receta_medicamento(diagnostico_id,medicamento_id,dosis,frecuencia,duracion) VALUES($1,$2,$3,$4,$5) RETURNING id`,
        [dx.id, m.id, d.dosis, d.frecuencia || null, d.duracion || null])).rows[0];
      return { id: String(r.id), nombre: d.nombre, dosis: d.dosis, frecuencia: d.frecuencia, duracion: d.duracion };
    });
  }

  agregarTratamiento(pid, cid, did, d) {
    return this._tx(async c => {
      const dx = (await c.query(`SELECT id FROM diagnostico WHERE id=$1 AND cita_id=$2 AND paciente_id=$3 FOR UPDATE`,
        [id(did), id(cid), id(pid)])).rows[0];
      if (!dx) throw new AppError(404, 'Diagnóstico no encontrado');
      const r = (await c.query(`INSERT INTO tratamiento(diagnostico_id,descripcion,fecha_inicio,fecha_fin,estado)
        VALUES($1,$2,$3,$4,$5) RETURNING id`,
        [dx.id, d.descripcion, d.fechaInicio, d.fechaFin, d.estado])).rows[0];
      return { id: String(r.id), descripcion: d.descripcion, fechaInicio: d.fechaInicio, fechaFin: d.fechaFin, estado: d.estado };
    });
  }

  registrarExtra(pid, tipo, d) {
    if (tipo !== 'alergia') throw new AppError(400, 'Registro no soportado');
    return this._tx(async c => {
      let a = (await c.query(`SELECT id FROM alergia WHERE LOWER(nombre)=LOWER($1)`, [d.nombre])).rows[0];
      if (!a) a = (await c.query(`INSERT INTO alergia(nombre,tipo) VALUES($1,$2) RETURNING id`, [d.nombre, d.tipo])).rows[0];
      await c.query(`INSERT INTO paciente_alergia(paciente_id,alergia_id,severidad,fecha_registro) VALUES($1,$2,$3,CURRENT_DATE)
        ON CONFLICT (paciente_id, alergia_id) DO UPDATE SET severidad=EXCLUDED.severidad`, [id(pid), a.id, d.severidad]);
      return { tipo, fecha: new Date().toISOString(), datos: d };
    });
  }

  async alergiasDe(pid) {
    const r = await this._q(`SELECT a.nombre FROM paciente_alergia pa JOIN alergia a ON a.id=pa.alergia_id WHERE pa.paciente_id=$1`, [id(pid)]);
    return r.map(x => x.nombre);
  }

  async darDeBaja(pid, d) {
    await this._q(`UPDATE paciente SET activo=FALSE, motivo_baja=$2, detalle_baja=$3, fecha_baja=NOW() WHERE id=$1`, [id(pid), d.motivo, d.detalle || null]);
    return this.obtenerPaciente(pid);
  }
  async reactivar(pid) {
    await this._q(`UPDATE paciente SET activo=TRUE, motivo_baja=NULL, detalle_baja=NULL, fecha_baja=NULL WHERE id=$1`, [id(pid)]);
    return this.obtenerPaciente(pid);
  }

  // ---------- pagos de honorarios ----------
  registrarPago(profesionalId, d) {
    return this._tx(async c => {
      const med = (await c.query(`SELECT id, nombre||' '||apellido AS nombre FROM empleado
        WHERE id=$1 AND tipo_personal='Médico'`, [id(profesionalId)])).rows[0];
      if (!med) throw new AppError(404, 'Médico no encontrado');
      const r = (await c.query(`INSERT INTO pago_medico(medico_id,periodo,tipo_pago,cantidad_consultas,monto,fecha_pago,estado)
        VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [med.id, d.periodo, d.tipoPago, d.cantidadConsultas || 0, d.monto, d.fechaPago, d.estado])).rows[0];
      return { ...mapPago(r), profesional: med.nombre };
    });
  }

  async listarPagos(f = {}) {
    const conds = [], p = [];
    if (f.profesionalId) { p.push(id(f.profesionalId)); conds.push(`p.medico_id=$${p.length}`); }
    if (f.desde) { p.push(f.desde); conds.push(`p.fecha_pago >= $${p.length}`); }
    if (f.hasta) { p.push(f.hasta); conds.push(`p.fecha_pago <= $${p.length}`); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const r = await this._q(`SELECT p.*, e.nombre||' '||e.apellido AS profesional
      FROM pago_medico p JOIN empleado e ON e.id=p.medico_id ${where}
      ORDER BY p.fecha_pago DESC NULLS LAST, p.id DESC`, p);
    return r.map(mapPago);
  }

  async listarConsultasSinPago(profesionalId) {
    const r = await this._q(`SELECT c.id, c.fecha_hora, c.motivo, c.paciente_id, p.nombre||' '||p.apellido AS paciente
      FROM cita c JOIN paciente p ON p.id=c.paciente_id
      WHERE c.medico_id=$1 AND c.pago_id IS NULL AND c.estado='atendida'
      ORDER BY c.fecha_hora DESC LIMIT 200`, [id(profesionalId)]);
    return r.map(x => ({ id: String(x.id), fecha: iso(x.fecha_hora), motivo: x.motivo,
      pacienteId: String(x.paciente_id), paciente: x.paciente }));
  }

  vincularConsultasAPago(pagoId, consultaIds) {
    return this._tx(async c => {
      const pago = (await c.query(`SELECT * FROM pago_medico WHERE id=$1 FOR UPDATE`, [id(pagoId)])).rows[0];
      if (!pago) throw new AppError(404, 'Pago no encontrado');
      const ids = consultaIds.map(id);
      const citas = (await c.query(`SELECT id FROM cita
        WHERE id = ANY($1::int[]) AND medico_id=$2 AND pago_id IS NULL AND estado='atendida'
        FOR UPDATE`, [ids, pago.medico_id])).rows;
      if (citas.length !== ids.length)
        throw new AppError(409, 'Alguna cita no existe, no pertenece al médico o ya tiene pago');
      await c.query(`UPDATE cita SET pago_id=$1 WHERE id = ANY($2::int[])`, [pago.id, ids]);
      const count = (await c.query(`SELECT COUNT(*)::int AS n FROM cita WHERE pago_id=$1`, [pago.id])).rows[0].n;
      await c.query(`UPDATE pago_medico SET cantidad_consultas=$2 WHERE id=$1`, [pago.id, count]);
      const updated = (await c.query(`SELECT p.*, e.nombre||' '||e.apellido AS profesional
        FROM pago_medico p JOIN empleado e ON e.id=p.medico_id WHERE p.id=$1`, [pago.id])).rows[0];
      return mapPago(updated);
    });
  }

  marcarPagoPagado(pagoId, fechaPago) {
    return this._tx(async c => {
      const pago = (await c.query(`UPDATE pago_medico SET estado='pagado', fecha_pago=$2
        WHERE id=$1 RETURNING id`, [id(pagoId), fechaPago])).rows[0];
      if (!pago) throw new AppError(404, 'Pago no encontrado');
      const updated = (await c.query(`SELECT p.*, e.nombre||' '||e.apellido AS profesional
        FROM pago_medico p JOIN empleado e ON e.id=p.medico_id WHERE p.id=$1`, [pago.id])).rows[0];
      return mapPago(updated);
    });
  }

  // ---------- camas (solo Hospital General) ----------
  async listarCamasDisponibles({ tipo } = {}) {
    const r = await this._q(`SELECT id, numero_habitacion, numero_cama, tipo, estado FROM cama_habitacion
      WHERE estado='Disponible' AND ($1='' OR tipo=$1) ORDER BY numero_habitacion, numero_cama`, [tipo || '']);
    return r.map(x => ({
      id: String(x.id), numeroHabitacion: x.numero_habitacion, numeroCama: x.numero_cama,
      tipo: x.tipo, estado: x.estado
    }));
  }

  // ---------- facturación y seguros (solo Hospital General) ----------
  async obtenerSeguro(pid) {
    const n = id(pid);
    let r = (await this._q(`SELECT s.id, s.paciente_id, s.aseguradora, s.numero_poliza, s.cobertura
      FROM seguro_medico s JOIN paciente p ON p.seguro_medico_id=s.id WHERE p.id=$1`, [n]))[0];
    if (!r) {
      r = (await this._q(`SELECT id, paciente_id, aseguradora, numero_poliza, cobertura
        FROM seguro_medico WHERE paciente_id=$1 ORDER BY id LIMIT 1`, [n]))[0];
    }
    return r ? mapSeguro(r) : null;
  }

  guardarSeguro(pid, d) {
    return this._tx(async c => {
      const p = (await c.query(`SELECT id, seguro_medico_id FROM paciente WHERE id=$1 FOR UPDATE`, [id(pid)])).rows[0];
      if (!p) throw new AppError(404, 'Paciente no encontrado');
      let s;
      if (p.seguro_medico_id) {
        s = (await c.query(`UPDATE seguro_medico SET aseguradora=$2, numero_poliza=$3, cobertura=$4
          WHERE id=$1 RETURNING id, paciente_id, aseguradora, numero_poliza, cobertura`,
          [p.seguro_medico_id, d.aseguradora, d.numeroPoliza, d.cobertura || null])).rows[0];
      }
      if (!s) {
        s = (await c.query(`INSERT INTO seguro_medico(paciente_id,aseguradora,numero_poliza,cobertura)
          VALUES($1,$2,$3,$4) RETURNING id, paciente_id, aseguradora, numero_poliza, cobertura`,
          [p.id, d.aseguradora, d.numeroPoliza, d.cobertura || null])).rows[0];
        await c.query(`UPDATE paciente SET seguro_medico_id=$2 WHERE id=$1`, [p.id, s.id]);
      }
      return mapSeguro(s);
    });
  }

  async listarFacturas(f = {}) {
    const conds = [], p = [];
    if (f.pacienteId) { p.push(id(f.pacienteId)); conds.push(`f.paciente_id=$${p.length}`); }
    if (f.desde) { p.push(f.desde); conds.push(`f.fecha >= $${p.length}`); }
    if (f.hasta) { p.push(f.hasta); conds.push(`f.fecha <= $${p.length}`); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const r = await this._q(`SELECT f.id, f.paciente_id, f.internamiento_id, f.cita_id, f.concepto, f.monto,
      to_char(f.fecha,'YYYY-MM-DD') AS fecha, f.estado_pago, p.nombre||' '||p.apellido AS paciente
      FROM factura f JOIN paciente p ON p.id=f.paciente_id ${where}
      ORDER BY f.fecha DESC, f.id DESC LIMIT 500`, p);
    return r.map(mapFactura);
  }

  async registrarFactura(d) {
    const r = (await this._q(`INSERT INTO factura(paciente_id,internamiento_id,cita_id,concepto,monto,fecha,estado_pago)
      VALUES($1,$2,$3,$4,$5,$6,$7)
      RETURNING id, paciente_id, internamiento_id, cita_id, concepto, monto,
        to_char(fecha,'YYYY-MM-DD') AS fecha, estado_pago`,
      [id(d.pacienteId), d.internamientoId ? id(d.internamientoId) : null,
        d.citaId ? id(d.citaId) : null, d.concepto, d.monto, d.fecha, d.estadoPago]))[0];
    const pac = (await this._q(`SELECT nombre||' '||apellido AS paciente FROM paciente WHERE id=$1`, [r.paciente_id]))[0];
    return mapFactura({ ...r, paciente: pac ? pac.paciente : '' });
  }

  async marcarFacturaPagada(fid) {
    const r = (await this._q(`UPDATE factura SET estado_pago='pagado' WHERE id=$1
      RETURNING id, paciente_id, internamiento_id, cita_id, concepto, monto,
        to_char(fecha,'YYYY-MM-DD') AS fecha, estado_pago`, [id(fid)]))[0];
    if (!r) throw new AppError(404, 'Factura no encontrada');
    const pac = (await this._q(`SELECT nombre||' '||apellido AS paciente FROM paciente WHERE id=$1`, [r.paciente_id]))[0];
    return mapFactura({ ...r, paciente: pac ? pac.paciente : '' });
  }
}
module.exports = PostgresRepository;

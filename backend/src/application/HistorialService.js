const { AppError } = require('../domain/errors');

const MOTIVOS_BAJA = ['traslado', 'fallecimiento', 'administrativa', 'otra'];
const TIPOS_DX = ['presuntivo', 'confirmado'];
const ESTADOS_PAGO = ['pendiente', 'pagado'];
const ESTADOS_TRATAMIENTO = ['en curso', 'finalizado', 'suspendido'];
const ESTADOS_FACTURA = ['pendiente', 'pagado', 'anulado'];
const PERIODO_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const txt = v => (v === undefined || v === null ? '' : String(v).trim());

/** Reglas de negocio UNICAS para los 4 motores. Solo habla con el puerto (repo). */
class HistorialService {
  constructor(repo, institucion, usuario) { this.repo = repo; this.inst = institucion; this.user = usuario; }

  _soloMedico() {
    if (this.user.rol !== 'medico') throw new AppError(403, 'Solo el personal clínico puede realizar esta operación');
  }
  _soloAdministrativo() {
    if (this.user.rol !== 'administrativo') throw new AppError(403, 'Solo el personal administrativo puede realizar esta operación');
  }
  _pagosDisponibles() {
    if (!this.inst.pagos) throw new AppError(400, 'Esta institución no maneja pagos de honorarios');
  }
  _camasDisponibles() {
    if (!this.inst.camas) throw new AppError(400, 'Esta institución no maneja camas');
  }
  _facturacionDisponible() {
    if (!this.inst.facturacion) throw new AppError(400, 'Esta institución no maneja facturación');
  }
  async _pacienteActivo(pid) {
    const p = await this.repo.obtenerPaciente(pid);
    if (!p) throw new AppError(404, 'Paciente no encontrado');
    if (!p.activo) throw new AppError(409, 'El historial está archivado (paciente dado de baja)');
    return p;
  }
  _validarCampos(campos, datos) {
    const out = {};
    for (const c of campos) {
      const v = txt(datos[c.name]);
      if (c.required && !v) throw new AppError(400, `El campo "${c.label}" es obligatorio`);
      if (v && c.type === 'number' && Number.isNaN(Number(v))) throw new AppError(400, `"${c.label}" debe ser numérico`);
      if (v && c.type === 'date' && Number.isNaN(Date.parse(v))) throw new AppError(400, `"${c.label}" no es una fecha válida`);
      if (v) out[c.name] = c.type === 'number' ? Number(v) : v;
    }
    return out;
  }

  listarProfesionales() { return this.repo.listarProfesionales(); }
  listarPacientes(q, inactivos) { return this.repo.listarPacientes({ q: txt(q), inactivos: !!inactivos }); }

  // ---------- pagos de honorarios (información confidencial: solo administrativo) ----------
  async registrarPago(d = {}) {
    this._pagosDisponibles();
    this._soloAdministrativo();
    const profesionalId = txt(d.profesionalId);
    if (!profesionalId) throw new AppError(400, `Seleccione ${this.inst.etiquetas.profesional.toLowerCase()}`);
    const periodo = txt(d.periodo);
    if (!PERIODO_RE.test(periodo)) throw new AppError(400, 'El periodo debe tener el formato AAAA-MM');
    const tipoPago = txt(d.tipoPago);
    if (!this.inst.pagos.tipos.includes(tipoPago)) throw new AppError(400, 'Tipo de pago inválido');
    const monto = Number(d.monto);
    if (!Number.isFinite(monto) || monto <= 0) throw new AppError(400, 'El monto debe ser mayor que cero');
    const estado = txt(d.estado) || 'pagado';
    if (!ESTADOS_PAGO.includes(estado)) throw new AppError(400, 'Estado de pago inválido');
    let fechaPago = txt(d.fechaPago);
    if (fechaPago && Number.isNaN(Date.parse(fechaPago))) throw new AppError(400, 'La fecha de pago no es válida');
    if (!fechaPago && estado === 'pagado') fechaPago = new Date().toISOString().slice(0, 10);
    return this.repo.registrarPago(profesionalId, {
      periodo, tipoPago, monto: Math.round(monto * 100) / 100, fechaPago: fechaPago || null, estado, cantidadConsultas: 0
    });
  }

  async listarPagos(filtros = {}) {
    this._pagosDisponibles();
    this._soloAdministrativo();
    const f = {};
    if (txt(filtros.profesionalId)) f.profesionalId = txt(filtros.profesionalId);
    if (txt(filtros.desde)) {
      if (Number.isNaN(Date.parse(filtros.desde))) throw new AppError(400, 'La fecha "desde" no es válida');
      f.desde = txt(filtros.desde);
    }
    if (txt(filtros.hasta)) {
      if (Number.isNaN(Date.parse(filtros.hasta))) throw new AppError(400, 'La fecha "hasta" no es válida');
      f.hasta = txt(filtros.hasta);
    }
    if (f.desde && f.hasta && f.desde > f.hasta) throw new AppError(400, 'El rango de fechas es inválido');
    return this.repo.listarPagos(f);
  }

  async listarConsultasSinPago(profesionalId) {
    this._pagosDisponibles();
    this._soloAdministrativo();
    const pid = txt(profesionalId);
    if (!pid) throw new AppError(400, `Seleccione ${this.inst.etiquetas.profesional.toLowerCase()}`);
    return this.repo.listarConsultasSinPago(pid);
  }

  async vincularConsultasAPago(pagoId, consultaIds) {
    this._pagosDisponibles();
    this._soloAdministrativo();
    if (!txt(pagoId)) throw new AppError(400, 'Pago inválido');
    if (!Array.isArray(consultaIds) || consultaIds.length === 0) throw new AppError(400, 'Seleccione al menos una consulta');
    const ids = [...new Set(consultaIds.map(txt).filter(Boolean))];
    if (ids.length === 0) throw new AppError(400, 'Seleccione al menos una consulta');
    return this.repo.vincularConsultasAPago(txt(pagoId), ids);
  }

  async marcarPagoPagado(pagoId, d = {}) {
    this._pagosDisponibles();
    this._soloAdministrativo();
    if (!txt(pagoId)) throw new AppError(400, 'Pago inválido');
    let fechaPago = txt(d.fechaPago);
    if (fechaPago && Number.isNaN(Date.parse(fechaPago))) throw new AppError(400, 'La fecha de pago no es válida');
    if (!fechaPago) fechaPago = new Date().toISOString().slice(0, 10);
    return this.repo.marcarPagoPagado(txt(pagoId), fechaPago);
  }

  // ---------- camas (solo Hospital General) ----------
  async listarCamasDisponibles(tipo) {
    this._camasDisponibles();
    return this.repo.listarCamasDisponibles({ tipo: txt(tipo) });
  }

  // ---------- facturación y seguros (información confidencial: solo administrativo) ----------
  async obtenerSeguro(pid) {
    this._facturacionDisponible();
    this._soloAdministrativo();
    const p = await this.repo.obtenerPaciente(pid);
    if (!p) throw new AppError(404, 'Paciente no encontrado');
    return this.repo.obtenerSeguro(pid);
  }

  async guardarSeguro(pid, d = {}) {
    this._facturacionDisponible();
    this._soloAdministrativo();
    const p = await this.repo.obtenerPaciente(pid);
    if (!p) throw new AppError(404, 'Paciente no encontrado');
    const aseguradora = txt(d.aseguradora);
    const numeroPoliza = txt(d.numeroPoliza);
    if (!aseguradora) throw new AppError(400, 'La aseguradora es obligatoria');
    if (!numeroPoliza) throw new AppError(400, 'El número de póliza es obligatorio');
    return this.repo.guardarSeguro(pid, {
      aseguradora: aseguradora.slice(0, 80), numeroPoliza: numeroPoliza.slice(0, 30), cobertura: txt(d.cobertura).slice(0, 150)
    });
  }

  async listarFacturas(filtros = {}) {
    this._facturacionDisponible();
    this._soloAdministrativo();
    const f = {};
    if (txt(filtros.pacienteId)) f.pacienteId = txt(filtros.pacienteId);
    if (txt(filtros.desde)) {
      if (Number.isNaN(Date.parse(filtros.desde))) throw new AppError(400, 'La fecha "desde" no es válida');
      f.desde = txt(filtros.desde);
    }
    if (txt(filtros.hasta)) {
      if (Number.isNaN(Date.parse(filtros.hasta))) throw new AppError(400, 'La fecha "hasta" no es válida');
      f.hasta = txt(filtros.hasta);
    }
    if (f.desde && f.hasta && f.desde > f.hasta) throw new AppError(400, 'El rango de fechas es inválido');
    return this.repo.listarFacturas(f);
  }

  async registrarFactura(d = {}) {
    this._facturacionDisponible();
    this._soloAdministrativo();
    const pacienteId = txt(d.pacienteId);
    if (!pacienteId) throw new AppError(400, 'Seleccione un paciente');
    const concepto = txt(d.concepto);
    if (!concepto) throw new AppError(400, 'El concepto es obligatorio');
    const monto = Number(d.monto);
    if (!Number.isFinite(monto) || monto <= 0) throw new AppError(400, 'El monto debe ser mayor que cero');
    const f = txt(d.fecha);
    if (f && Number.isNaN(Date.parse(f))) throw new AppError(400, 'La fecha no es válida');
    const fecha = f ? new Date(f).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    const estadoPago = txt(d.estadoPago) || 'pendiente';
    if (!ESTADOS_FACTURA.includes(estadoPago)) throw new AppError(400, 'Estado de pago inválido');
    const p = await this.repo.obtenerPaciente(pacienteId);
    if (!p) throw new AppError(404, 'Paciente no encontrado');
    return this.repo.registrarFactura({
      pacienteId, concepto: concepto.slice(0, 200), monto: Math.round(monto * 100) / 100, fecha, estadoPago,
      citaId: txt(d.citaId) || null, internamientoId: txt(d.internamientoId) || null
    });
  }

  async marcarFacturaPagada(id) {
    this._facturacionDisponible();
    this._soloAdministrativo();
    if (!txt(id)) throw new AppError(400, 'Factura inválida');
    return this.repo.marcarFacturaPagada(txt(id));
  }

  async crearPaciente(datos) {
    const d = this._validarCampos(this.inst.pacienteCampos, datos);
    if (new Date(d.fechaNacimiento) > new Date()) throw new AppError(400, 'La fecha de nacimiento no puede ser futura');
    return this.repo.crearPaciente(d);
  }

  async obtenerHistorial(pid) {
    const h = await this.repo.obtenerHistorial(pid);
    if (!h) throw new AppError(404, 'Paciente no encontrado');
    // Clasificación de la información: el personal administrativo no ve información restringida
    if (this.user.rol !== 'medico') {
      h.consultas = h.consultas.map(c => ({ ...c, observaciones: undefined, diagnosticos: [], restringido: true }));
      h.extras = [];
    }
    return h;
  }

  async registrarConsulta(pid, d) {
    this._soloMedico();
    await this._pacienteActivo(pid);
    if (!txt(d.profesionalId)) throw new AppError(400, `Seleccione ${this.inst.etiquetas.profesional.toLowerCase()}`);
    if (!txt(d.motivo)) throw new AppError(400, 'El motivo es obligatorio');
    return this.repo.registrarConsulta(pid, {
      profesionalId: txt(d.profesionalId), motivo: txt(d.motivo), observaciones: txt(d.observaciones)
    });
  }

  async agregarDiagnostico(pid, cid, d) {
    this._soloMedico();
    await this._pacienteActivo(pid);
    if (!txt(d.descripcion)) throw new AppError(400, 'La descripción del diagnóstico es obligatoria');
    const tipo = txt(d.tipo) || 'presuntivo';
    if (!TIPOS_DX.includes(tipo)) throw new AppError(400, 'Tipo de diagnóstico inválido');
    return this.repo.agregarDiagnostico(pid, cid, { codigo: txt(d.codigo), descripcion: txt(d.descripcion), tipo });
  }

  async recetarMedicamento(pid, cid, did, d) {
    this._soloMedico();
    await this._pacienteActivo(pid);
    if (!txt(d.nombre) || !txt(d.dosis)) throw new AppError(400, 'Medicamento y dosis son obligatorios');
    const alergias = (await this.repo.alergiasDe(pid)).map(a => a.toLowerCase());
    if (alergias.includes(txt(d.nombre).toLowerCase()))
      throw new AppError(409, `El paciente tiene registrada alergia a ${txt(d.nombre)}: receta rechazada`);
    return this.repo.recetarMedicamento(pid, cid, did, {
      nombre: txt(d.nombre), dosis: txt(d.dosis), frecuencia: txt(d.frecuencia), duracion: txt(d.duracion)
    });
  }

  async agregarTratamiento(pid, cid, did, d = {}) {
    this._soloMedico();
    await this._pacienteActivo(pid);
    if (!txt(d.descripcion)) throw new AppError(400, 'La descripción del tratamiento es obligatoria');
    const fIni = txt(d.fechaInicio);
    if (fIni && Number.isNaN(Date.parse(fIni))) throw new AppError(400, 'La fecha de inicio no es válida');
    const fechaInicio = fIni ? new Date(fIni).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    const fFin = txt(d.fechaFin);
    if (fFin && Number.isNaN(Date.parse(fFin))) throw new AppError(400, 'La fecha de fin no es válida');
    const fechaFin = fFin ? new Date(fFin).toISOString().slice(0, 10) : null;
    if (fechaFin && fechaFin < fechaInicio) throw new AppError(400, 'La fecha de fin no puede ser anterior a la de inicio');
    const estado = txt(d.estado) || 'en curso';
    if (!ESTADOS_TRATAMIENTO.includes(estado)) throw new AppError(400, 'Estado de tratamiento inválido');
    return this.repo.agregarTratamiento(pid, cid, did, {
      descripcion: txt(d.descripcion).slice(0, 250), fechaInicio, fechaFin, estado
    });
  }

  async registrarExtra(pid, tipo, datos) {
    this._soloMedico();
    await this._pacienteActivo(pid);
    const def = this.inst.extras.find(e => e.tipo === tipo);
    if (!def) throw new AppError(400, 'Este registro no existe en la institución');
    let campos = def.campos;
    const out = {};
    if (def.variantes) {
      const v = def.variantes[datos.examen];
      if (!v) throw new AppError(400, 'Seleccione el tipo de examen');
      campos = v.campos; out.examen = datos.examen;
    }
    return this.repo.registrarExtra(pid, tipo, { ...out, ...this._validarCampos(campos, datos) });
  }

  async darDeBaja(pid, d) {
    const p = await this._pacienteActivo(pid);
    if (!MOTIVOS_BAJA.includes(txt(d.motivo))) throw new AppError(400, `Motivo de baja inválido (${MOTIVOS_BAJA.join(', ')})`);
    return this.repo.darDeBaja(p.id, { motivo: txt(d.motivo), detalle: txt(d.detalle) });
  }

  async reactivar(pid) {
    const p = await this.repo.obtenerPaciente(pid);
    if (!p) throw new AppError(404, 'Paciente no encontrado');
    if (p.activo) throw new AppError(409, 'El paciente ya está activo');
    if (p.motivoBaja === 'fallecimiento') throw new AppError(409, 'No se puede reactivar un historial por fallecimiento');
    return this.repo.reactivar(pid);
  }
}
module.exports = HistorialService;

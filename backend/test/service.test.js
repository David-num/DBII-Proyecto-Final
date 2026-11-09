// Prueba de las reglas de negocio con un repositorio en memoria (mismo puerto que los 4 motores).
const assert = require('assert');
const HistorialService = require('../src/application/HistorialService');
const inst = require('../src/domain/institutions');
const { METODOS } = require('../src/domain/ports');

function fakeRepo() {
  const pacs = {}, cons = {}, pagos = {}, facturas = {}, seguros = {}; let n = 0;
  return {
    alergias: [],
    async listarProfesionales() { return [{ id: '1', nombre: 'Dr. X' }]; },
    async listarPacientes() { return Object.values(pacs); },
    async crearPaciente(d) { const p = { id: String(++n), ...d, activo: true }; pacs[p.id] = p; return p; },
    async obtenerPaciente(id) { return pacs[id] || null; },
    async obtenerHistorial(id) { return pacs[id] ? { paciente: pacs[id], consultas: Object.values(cons), extras: [] } : null; },
    async registrarConsulta(pid, d) { const c = { id: String(++n), ...d, diagnosticos: [] }; cons[c.id] = c; return c; },
    async agregarDiagnostico(pid, cid, d) { const x = { id: String(++n), ...d, medicamentos: [], tratamientos: [] }; cons[cid].diagnosticos.push(x); return x; },
    async recetarMedicamento(pid, cid, did, d) { const m = { id: String(++n), ...d }; cons[cid].diagnosticos.find(x => x.id === did).medicamentos.push(m); return m; },
    async agregarTratamiento(pid, cid, did, d) {
      const t = { id: String(++n), ...d };
      const dx = cons[cid].diagnosticos.find(x => x.id === did);
      (dx.tratamientos = dx.tratamientos || []).push(t); return t;
    },
    async registrarExtra() { return {}; },
    async alergiasDe() { return this.alergias; },
    async registrarPago(profesionalId, d) {
      const p = { id: String(++n), profesionalId, profesional: 'Dr. X', ...d }; pagos[p.id] = p; return p;
    },
    async listarPagos() { return Object.values(pagos); },
    async vincularConsultasAPago(pagoId, consultaIds) {
      const p = pagos[pagoId]; p.cantidadConsultas = (p.cantidadConsultas || 0) + consultaIds.length; return p;
    },
    async marcarPagoPagado(pagoId, fechaPago) {
      const p = pagos[pagoId]; p.estado = 'pagado'; p.fechaPago = fechaPago; return p;
    },
    async listarConsultasSinPago() { return []; },
    async listarCamasDisponibles() { return [{ id: '1', numeroHabitacion: '101', numeroCama: 'A', tipo: 'General', estado: 'Disponible' }]; },
    async obtenerSeguro(pid) { return seguros[pid] || null; },
    async guardarSeguro(pid, d) { const s = { id: String(++n), pacienteId: pid, ...d }; seguros[pid] = s; return s; },
    async listarFacturas() { return Object.values(facturas); },
    async registrarFactura(d) { const f = { id: String(++n), ...d, paciente: 'Ana Paz' }; facturas[f.id] = f; return f; },
    async marcarFacturaPagada(id) { facturas[id].estadoPago = 'pagado'; return facturas[id]; },
    async darDeBaja(id, d) { Object.assign(pacs[id], { activo: false, motivoBaja: d.motivo }); return pacs[id]; },
    async reactivar(id) { pacs[id].activo = true; return pacs[id]; }
  };
}
const rej = async (p, status) => { try { await p; } catch (e) { assert.strictEqual(e.status, status, e.message); return; } assert.fail('debía fallar'); };

(async () => {
  const repo = fakeRepo();
  for (const m of METODOS) assert.strictEqual(typeof repo[m], 'function');
  const med = new HistorialService(repo, inst.hospital, { rol: 'medico' });
  const adm = new HistorialService(repo, inst.hospital, { rol: 'administrativo' });
  const lab = new HistorialService(repo, inst.laboratorio, { rol: 'administrativo' });

  // Pagos: solo administrativo, solo instituciones relacionales y con datos válidos.
  await rej(med.listarPagos(), 403);
  await rej(lab.listarPagos(), 400);
  await rej(adm.registrarPago({ profesionalId: '1', periodo: '2026-13', tipoPago: 'Salario fijo', monto: 100 }), 400);
  await rej(adm.registrarPago({ profesionalId: '1', periodo: '2026-11', tipoPago: 'Otro', monto: 100 }), 400);
  await rej(adm.registrarPago({ profesionalId: '1', periodo: '2026-11', tipoPago: 'Salario fijo', monto: 0 }), 400);
  const pago = await adm.registrarPago({ profesionalId: '1', periodo: '2026-11', tipoPago: 'Salario fijo', monto: 100, estado: 'pendiente' });
  assert.strictEqual(pago.fechaPago, null);
  await rej(adm.vincularConsultasAPago(pago.id, []), 400);
  await rej(med.marcarPagoPagado(pago.id, {}), 403);
  await rej(adm.marcarPagoPagado(pago.id, { fechaPago: 'no-es-fecha' }), 400);
  const pagado = await adm.marcarPagoPagado(pago.id, { fechaPago: '2026-11-07' });
  assert.strictEqual(pagado.estado, 'pagado');
  assert.strictEqual(pagado.fechaPago, '2026-11-07');
  assert.strictEqual((await adm.listarPagos()).length, 1);                                  // actualiza el mismo registro

  await rej(med.crearPaciente({ nombre: 'A' }), 400);                                   // faltan campos obligatorios
  const p = await med.crearPaciente({ nombre: 'Ana', apellido: 'Paz', fechaNacimiento: '1990-01-01', genero: 'Femenino', documento: '123' });
  await rej(med.crearPaciente({ nombre: 'Ana', apellido: 'Paz', fechaNacimiento: '2999-01-01', genero: 'Femenino', documento: '1' }), 400);
  const c = await med.registrarConsulta(p.id, { profesionalId: '1', motivo: 'Dolor' });
  const pagoVinculado = await adm.vincularConsultasAPago(pago.id, [c.id]);
  assert.strictEqual(pagoVinculado.cantidadConsultas, 1);
  assert.strictEqual((await adm.listarPagos()).length, 1);
  assert.deepStrictEqual(await adm.listarConsultasSinPago('1'), []);
  await rej(adm.registrarConsulta(p.id, { profesionalId: '1', motivo: 'x' }), 403);      // rol administrativo no atiende
  const dx = await med.agregarDiagnostico(p.id, c.id, { descripcion: 'Gastritis' });
  assert.strictEqual(dx.tipo, 'presuntivo');
  repo.alergias = ['Penicilina'];
  await rej(med.recetarMedicamento(p.id, c.id, dx.id, { nombre: 'penicilina', dosis: '1g' }), 409); // regla de alergias
  await med.recetarMedicamento(p.id, c.id, dx.id, { nombre: 'Omeprazol', dosis: '20 mg' });
  const tx = await med.agregarTratamiento(p.id, c.id, dx.id, { descripcion: 'Reposo', fechaInicio: '2026-11-08' });
  assert.strictEqual(tx.estado, 'en curso');
  await rej(med.agregarTratamiento(p.id, c.id, dx.id, {}), 400);                        // descripción obligatoria
  await rej(med.agregarTratamiento(p.id, c.id, dx.id, { descripcion: 'X', fechaInicio: '2026-11-08', fechaFin: '2026-11-07' }), 400);
  await rej(adm.agregarTratamiento(p.id, c.id, dx.id, { descripcion: 'X' }), 403);       // solo personal clínico

  // Camas: solo Hospital General.
  assert.strictEqual((await med.listarCamasDisponibles('General')).length, 1);
  await rej(new HistorialService(repo, inst.pediatrico, { rol: 'medico' }).listarCamasDisponibles(), 400);

  // Facturación y seguros: solo administrativo y solo Hospital General.
  await rej(med.listarFacturas(), 403);
  await rej(lab.listarFacturas(), 400);
  await rej(adm.registrarFactura({ pacienteId: p.id, concepto: 'Consulta', monto: 0 }), 400);
  const fac = await adm.registrarFactura({ pacienteId: p.id, concepto: 'Consulta', monto: 150.5, fecha: '2026-11-08' });
  assert.strictEqual(fac.estadoPago, 'pendiente');
  assert.strictEqual(fac.paciente, 'Ana Paz');                                           // nombre vía JOIN, no almacenado
  const facPagada = await adm.marcarFacturaPagada(fac.id);
  assert.strictEqual(facPagada.estadoPago, 'pagado');
  await rej(adm.guardarSeguro(p.id, { aseguradora: '' }), 400);
  const seg = await adm.guardarSeguro(p.id, { aseguradora: 'Seguros X', numeroPoliza: 'P-1' });
  assert.strictEqual(seg.aseguradora, 'Seguros X');
  assert.strictEqual((await adm.obtenerSeguro(p.id)).numeroPoliza, 'P-1');

  const h = await adm.obtenerHistorial(p.id);
  assert.strictEqual(h.consultas[0].diagnosticos.length, 0);                              // información restringida oculta
  await med.darDeBaja(p.id, { motivo: 'traslado' });
  await rej(med.registrarConsulta(p.id, { profesionalId: '1', motivo: 'x' }), 409);      // historial archivado = solo lectura
  await rej(med.darDeBaja(p.id, { motivo: 'traslado' }), 409);
  await med.reactivar(p.id);
  await med.registrarConsulta(p.id, { profesionalId: '1', motivo: 'Control' });
  console.log('OK: reglas de negocio verificadas');
})().catch(e => { console.error('FALLO', e); process.exit(1); });

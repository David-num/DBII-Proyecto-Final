/**
 * PUERTO DE SALIDA: HistorialRepository
 * Todo adaptador (PostgreSQL, MySQL, MongoDB, Firebase) implementa exactamente estos métodos y
 * devuelve exactamente las mismas formas. El dominio solo conoce este contrato.
 *
 *  listarProfesionales()                              -> [{id, nombre}]
 *  listarPacientes({q, inactivos})                    -> [{id, nombre, apellido, fechaNacimiento, activo}]
 *  crearPaciente(datos)                               -> paciente
 *  obtenerPaciente(id)                                -> paciente | null
 *  obtenerHistorial(id)                               -> {paciente, consultas:[{..., diagnosticos:[{..., medicamentos:[], tratamientos:[]}]}], extras:[]}
 *  registrarConsulta(pid, {profesionalId, motivo, observaciones}) -> consulta
 *  agregarDiagnostico(pid, cid, {codigo, descripcion, tipo})      -> diagnostico
 *  recetarMedicamento(pid, cid, did, {nombre, dosis, frecuencia, duracion}) -> medicamento
 *  agregarTratamiento(pid, cid, did, {descripcion, fechaInicio, fechaFin, estado}) -> tratamiento
 *  registrarExtra(pid, tipo, datos)                   -> extra
 *  alergiasDe(pid)                                    -> [nombre]
 *  darDeBaja(pid, {motivo, detalle})                  -> paciente
 *  reactivar(pid)                                     -> paciente
 *
 *  Pagos de honorarios (solo instituciones relacionales; los demás adaptadores responden 400):
 *  registrarPago(profesionalId, {periodo, tipoPago, monto, fechaPago, estado}) -> pago
 *  listarPagos({profesionalId, desde, hasta})          -> [pago]
 *  vincularConsultasAPago(pagoId, consultaIds)         -> pago actualizado
 *  marcarPagoPagado(pagoId, fechaPago)                 -> pago actualizado
 *  listarConsultasSinPago(profesionalId)               -> [consulta atendida sin pago]
 *
 *  Camas (solo Hospital General; los demás adaptadores responden 400):
 *  listarCamasDisponibles({tipo})                      -> [{id, numeroHabitacion, numeroCama, tipo, estado}]
 *
 *  Facturación y seguros (solo Hospital General; los demás adaptadores responden 400):
 *  obtenerSeguro(pid)                                  -> seguro | null
 *  guardarSeguro(pid, {aseguradora, numeroPoliza, cobertura}) -> seguro
 *  listarFacturas({pacienteId, desde, hasta})          -> [factura]
 *  registrarFactura({pacienteId, concepto, monto, fecha, estadoPago}) -> factura
 *  marcarFacturaPagada(id)                             -> factura
 */
const METODOS = ['listarProfesionales', 'listarPacientes', 'crearPaciente', 'obtenerPaciente', 'obtenerHistorial',
  'registrarConsulta', 'agregarDiagnostico', 'recetarMedicamento', 'agregarTratamiento', 'registrarExtra', 'alergiasDe', 'darDeBaja', 'reactivar',
  'registrarPago', 'listarPagos', 'vincularConsultasAPago', 'marcarPagoPagado', 'listarConsultasSinPago',
  'listarCamasDisponibles', 'obtenerSeguro', 'guardarSeguro', 'listarFacturas', 'registrarFactura', 'marcarFacturaPagada'];
module.exports = { METODOS };

// Interfaz única: se construye a partir de la configuración de la institución (/api/login), nunca del motor.
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let token = sessionStorage.getItem('token'), ctx = null, actual = null, profesionales = [];

async function api(path, opts = {}) {
  const r = await fetch('/api' + path, { method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== '/login') { salir(); throw new Error(j.error || 'Sesión expirada'); }
  if (!r.ok) throw new Error(j.error || 'Error');
  return j;
}
function toast(msg, err) { const t = $('#toast'); t.textContent = msg; t.className = 'show' + (err ? ' err' : ''); setTimeout(() => (t.className = ''), 3200); }
const fmt = iso => {
  if (!iso) return '—';
  const s = String(iso);
  // Las fechas DATE llegan como AAAA-MM-DD: se interpretan al mediodía para no retroceder un día en UTC-6.
  const d = s.length === 10 ? new Date(s + 'T12:00:00') : new Date(s);
  return d.toLocaleString('es-GT', { dateStyle: 'medium', timeStyle: s.length > 10 ? 'short' : undefined });
};
const edad = f => { const d = new Date(f), n = new Date(); let a = n.getFullYear() - d.getFullYear(); if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) a--; return a; };

// ---------- sesión ----------
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault(); $('#loginError').textContent = '';
  try {
    const f = Object.fromEntries(new FormData(e.target));
    const r = await api('/login', { method: 'POST', body: f });
    token = r.token; sessionStorage.setItem('token', token); iniciar(r);
  } catch (err) { $('#loginError').textContent = err.message; }
});
function salir() { sessionStorage.removeItem('token'); token = null; location.reload(); }
$('#logout').onclick = salir;

async function iniciar(r) {
  ctx = r || await api('/me');
  $('#login').hidden = true; $('#app').hidden = false;
  $('#instNombre').textContent = ctx.institucion.nombre;
  $('#userInfo').textContent = `${ctx.usuario.nombre} · ${ctx.usuario.rol}`;
  $('#camasBtn').hidden = !ctx.institucion.camas;
  $('#camasBtn').onclick = abrirCamas;
  $('#pagosBtn').hidden = !(ctx.institucion.pagos && ctx.usuario.rol === 'administrativo');
  $('#pagosBtn').onclick = abrirPagos;
  $('#facturacionBtn').hidden = !(ctx.institucion.facturacion && ctx.usuario.rol === 'administrativo');
  $('#facturacionBtn').onclick = abrirFacturacion;
  profesionales = await api('/profesionales').catch(() => []);
  cargarLista();
}

// ---------- lista ----------
let timer, mostrarArchivados = false;
$('#buscar').oninput = () => { clearTimeout(timer); timer = setTimeout(cargarLista, 250); };
$('#inactivos').onclick = () => {
  mostrarArchivados = !mostrarArchivados;
  $('#inactivos').textContent = mostrarArchivados ? 'Ocultar archivados' : 'Mostrar archivados';
  $('#inactivos').setAttribute('aria-pressed', String(mostrarArchivados));
  $('#inactivos').classList.toggle('active', mostrarArchivados);
  cargarLista();
};
async function cargarLista() {
  try {
    const ps = await api(`/pacientes?q=${encodeURIComponent($('#buscar').value)}&inactivos=${mostrarArchivados ? 1 : 0}`);
    $('#lista').innerHTML = ps.length ? ps.map(p => `<li data-id="${esc(p.id)}" class="${actual === p.id ? 'sel' : ''}">
      <span class="${p.activo ? '' : 'off'}"><b>${esc(p.apellido)}, ${esc(p.nombre)}</b> ${p.activo ? '' : '<span class="badge off">archivado</span>'}<br>
      <span class="muted small">${edad(p.fechaNacimiento)} años</span></span></li>`).join('') : '<li class="muted">Sin resultados</li>';
    document.querySelectorAll('#lista li[data-id]').forEach(li => (li.onclick = () => abrir(li.dataset.id)));
  } catch (e) { toast(e.message, true); }
}

// ---------- formularios dinámicos ----------
function campo(c, v = '') {
  const req = c.required ? ' required' : '';
  if (c.type === 'select') return `<label>${esc(c.label)}<select name="${c.name}"${req}>${c.options.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select></label>`;
  return `<label>${esc(c.label)}<input name="${c.name}" type="${c.type || 'text'}" ${c.type === 'number' ? 'step="any"' : ''}${req} value="${esc(v)}"></label>`;
}
function formulario(titulo, camposHtml, onSubmit, okLabel = 'Guardar') {
  const f = $('#modalForm');
  f.innerHTML = `<h2>${esc(titulo)}</h2>${camposHtml}<p class="error" id="mErr"></p>
    <div class="actions"><button type="button" id="mCancel">Cancelar</button><button class="primary" id="mOk">${okLabel}</button></div>`;
  $('#mCancel').onclick = () => $('#modal').close();
  f.onsubmit = async e => {
    e.preventDefault();
    try { const fd = new FormData(f); await onSubmit(Object.fromEntries(fd), fd); $('#modal').close(); }
    catch (err) { $('#mErr').textContent = err.message; }
  };
  $('#modal').showModal();
}

$('#nuevo').onclick = () => formulario('Nuevo paciente (historial clínico)',
  ctx.institucion.pacienteCampos.map(c => campo(c)).join(''),
  async d => { const p = await api('/pacientes', { method: 'POST', body: d }); toast('Historial creado'); await cargarLista(); abrir(p.id); });

// ---------- detalle ----------
async function abrir(id) {
  actual = id;
  try {
    const h = await api(`/pacientes/${encodeURIComponent(id)}/historial`);
    pintar(h); cargarLista();
  } catch (e) { toast(e.message, true); }
}

// ---------- pagos de honorarios (solo administrativo, instituciones relacionales) ----------
function abrirPagos() {
  actual = null;
  document.querySelectorAll('#lista li.sel').forEach(li => li.classList.remove('sel'));
  const P = ctx.institucion.pagos;
  $('#detalle').innerHTML = `
    <div class="sec-head"><h2>${esc(P.etiqueta)}</h2><button class="small primary" id="bNuevoPago">+ Registrar pago</button></div>
    <div class="banner">Información confidencial del área administrativa. Registre el pago y luego vincule las atenciones atendidas.</div>
    <div class="filtros">
      <label class="small">${esc(ctx.institucion.etiquetas.profesional)}<select id="pagoProfesional"><option value="">Todos</option>${profesionales.map(x => `<option value="${esc(x.id)}">${esc(x.nombre)}</option>`).join('')}</select></label>
      <label class="small">Desde<input id="pagoDesde" type="date"></label>
      <label class="small">Hasta<input id="pagoHasta" type="date"></label>
      <button class="small" id="bFiltrarPagos">Filtrar</button>
    </div>
    <div id="listaPagos"></div>`;
  $('#bNuevoPago').onclick = nuevoPago;
  $('#bFiltrarPagos').onclick = cargarPagos;
  cargarPagos();
}

async function cargarPagos() {
  const box = $('#listaPagos'); if (!box) return;
  box.innerHTML = '<p class="muted small">Cargando…</p>';
  try {
    const qs = new URLSearchParams();
    const prof = $('#pagoProfesional')?.value;
    if (prof) qs.set('profesionalId', prof);
    const desde = $('#pagoDesde')?.value; if (desde) qs.set('desde', desde);
    const hasta = $('#pagoHasta')?.value; if (hasta) qs.set('hasta', hasta);
    const ps = await api('/pagos' + (qs.toString() ? `?${qs}` : ''));
    box.innerHTML = ps.length ? ps.map(renderPago).join('') : '<p class="muted small">Sin pagos registrados.</p>';
    box.querySelectorAll('[data-vincular]').forEach(b => {
      const p = ps.find(x => x.id === b.dataset.vincular);
      b.onclick = () => vincularPago(p);
    });
    box.querySelectorAll('[data-pagar]').forEach(b => {
      const p = ps.find(x => x.id === b.dataset.pagar);
      b.onclick = () => marcarPagoPagado(p);
    });
  } catch (e) { box.innerHTML = ''; toast(e.message, true); }
}

function renderPago(p) {
  const moneda = ctx.institucion.pagos.moneda || 'Q';
  const pagar = p.estado === 'pendiente'
    ? `<button class="small primary" data-pagar="${esc(p.id)}">Marcar como pagado</button> ` : '';
  return `<div class="item">
    <div class="sec-head"><b>${esc(p.profesional)}</b><span class="badge ${p.estado === 'pagado' ? 'ok' : ''}">${esc(p.estado)}</span></div>
    <div class="meta">Periodo ${esc(p.periodo)} · ${esc(p.tipoPago)} · ${p.cantidadConsultas} consulta(s)</div>
    <div class="small"><b>${moneda} ${Number(p.monto).toFixed(2)}</b>${p.fechaPago ? ` · ${p.estado === 'pagado' ? 'pagado el' : 'fecha de pago'} ${fmt(p.fechaPago)}` : ''}</div>
    <div>${pagar}<button class="small" data-vincular="${esc(p.id)}">Vincular consultas</button></div>
  </div>`;
}

function nuevoPago() {
  const P = ctx.institucion.pagos;
  const hoy = new Date().toISOString().slice(0, 10);
  formulario('Registrar pago de honorarios', `
    <label>${esc(ctx.institucion.etiquetas.profesional)}<select name="profesionalId" required>${profesionales.map(x => `<option value="${esc(x.id)}">${esc(x.nombre)}</option>`).join('')}</select></label>
    <label>Periodo<input name="periodo" type="month" required></label>
    <label>Tipo de pago<select name="tipoPago" required>${P.tipos.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}</select></label>
    <label>Monto (${esc(P.moneda || 'Q')})<input name="monto" type="number" min="0.01" step="0.01" required></label>
    <label>Fecha de pago<input name="fechaPago" type="date" value="${hoy}"></label>
    <label>Estado<select name="estado"><option value="pagado">Pagado</option><option value="pendiente">Pendiente</option></select></label>`,
    async d => { await post('/pagos', d); toast('Pago registrado'); abrirPagos(); });
}

function marcarPagoPagado(p) {
  const hoy = new Date().toISOString().slice(0, 10);
  const moneda = ctx.institucion.pagos.moneda || 'Q';
  formulario(`Marcar pago como pagado · ${p.profesional}`,
    `<p class="muted small">Periodo ${esc(p.periodo)} · ${esc(p.tipoPago)} · ${moneda} ${Number(p.monto).toFixed(2)}.
      Se actualizará este mismo registro; no se creará un pago nuevo.</p>
     <label>Fecha de pago<input name="fechaPago" type="date" value="${p.fechaPago || hoy}" required></label>`,
    async d => { await post(`/pagos/${encodeURIComponent(p.id)}/pagar`, d); toast('Pago marcado como pagado'); abrirPagos(); },
    'Marcar como pagado');
}

async function vincularPago(p) {
  try {
    const cs = await api(`/profesionales/${encodeURIComponent(p.profesionalId)}/consultas-sin-pago`);
    if (!cs.length) return toast('No hay consultas pendientes de pago para este profesional');
    formulario(`Vincular consultas · ${p.profesional}`,
      `<p class="muted small">Seleccione las atenciones que se incluirán en este pago. El pago ya tiene ${p.cantidadConsultas} consulta(s) vinculada(s).</p>
       <div class="checks">${cs.map(c => `<label class="check"><input type="checkbox" name="consultaIds" value="${esc(c.id)}"> <span>${fmt(c.fecha)} · ${esc(c.paciente)} · ${esc(c.motivo)}</span></label>`).join('')}</div>`,
      async (d, fd) => {
        const consultaIds = fd.getAll('consultaIds');
        if (!consultaIds.length) throw new Error('Seleccione al menos una consulta');
        await post(`/pagos/${encodeURIComponent(p.id)}/consultas`, { consultaIds });
        toast('Consultas vinculadas al pago'); abrirPagos();
      }, 'Vincular');
  } catch (e) { toast(e.message, true); }
}

// ---------- camas disponibles (solo Hospital General) ----------
function abrirCamas() {
  actual = null;
  document.querySelectorAll('#lista li.sel').forEach(li => li.classList.remove('sel'));
  $('#detalle').innerHTML = `
    <div class="sec-head"><h2>Camas disponibles</h2><button class="small" id="bRefrescarCamas">Actualizar</button></div>
    <div class="filtros">
      <label class="small">Tipo<select id="camaTipo"><option value="">Todos</option><option>General</option><option>UCI</option><option>Aislamiento</option></select></label>
    </div>
    <div id="listaCamas"></div>`;
  $('#camaTipo').onchange = cargarCamas;
  $('#bRefrescarCamas').onclick = cargarCamas;
  cargarCamas();
}

async function cargarCamas() {
  const box = $('#listaCamas'); if (!box) return;
  box.innerHTML = '<p class="muted small">Cargando…</p>';
  try {
    const tipo = $('#camaTipo')?.value || '';
    const cs = await api('/camas' + (tipo ? `?tipo=${encodeURIComponent(tipo)}` : ''));
    box.innerHTML = cs.length ? cs.map(c => `<div class="item">
      <div class="sec-head"><b>Habitación ${esc(c.numeroHabitacion)} · Cama ${esc(c.numeroCama)}</b><span class="badge ok">${esc(c.estado)}</span></div>
      <div class="meta">Tipo: ${esc(c.tipo)}</div>
    </div>`).join('') : '<p class="muted small">No hay camas disponibles con ese filtro.</p>';
  } catch (e) { box.innerHTML = ''; toast(e.message, true); }
}

// ---------- facturación y seguros (solo administrativo, Hospital General) ----------
let pacientesFactura = [];

async function cargarPacientesFactura() {
  pacientesFactura = await api('/pacientes?q=&inactivos=1');
  return pacientesFactura;
}

async function abrirFacturacion() {
  actual = null;
  document.querySelectorAll('#lista li.sel').forEach(li => li.classList.remove('sel'));
  try { await cargarPacientesFactura(); } catch (e) { toast(e.message, true); }
  const opts = pacientesFactura.map(p => `<option value="${esc(p.id)}">${esc(p.apellido)}, ${esc(p.nombre)}</option>`).join('');
  $('#detalle').innerHTML = `
    <div class="sec-head"><h2>Facturación y seguros</h2></div>
    <div class="banner">Información confidencial del área administrativa.</div>
    <div class="sec">
      <div class="sec-head"><h3>Facturas</h3><button class="small primary" id="bNuevaFactura">+ Nueva factura</button></div>
      <div class="filtros">
        <label class="small">Paciente<select id="factPaciente"><option value="">Todos</option>${opts}</select></label>
        <label class="small">Desde<input id="factDesde" type="date"></label>
        <label class="small">Hasta<input id="factHasta" type="date"></label>
        <button class="small" id="bFiltrarFacturas">Filtrar</button>
      </div>
      <div id="listaFacturas"></div>
    </div>
    <div class="sec">
      <div class="sec-head"><h3>Seguro médico</h3></div>
      <div class="filtros">
        <label class="small">Paciente<select id="segPaciente"><option value="">Seleccione…</option>${opts}</select></label>
        <button class="small" id="bCargarSeguro">Ver seguro</button>
      </div>
      <div id="seguroBox"></div>
    </div>`;
  $('#bNuevaFactura').onclick = nuevaFactura;
  $('#bFiltrarFacturas').onclick = cargarFacturas;
  $('#bCargarSeguro').onclick = cargarSeguro;
  $('#segPaciente').onchange = cargarSeguro;
  cargarFacturas();
}

async function cargarFacturas() {
  const box = $('#listaFacturas'); if (!box) return;
  box.innerHTML = '<p class="muted small">Cargando…</p>';
  try {
    const qs = new URLSearchParams();
    const pid = $('#factPaciente')?.value; if (pid) qs.set('pacienteId', pid);
    const desde = $('#factDesde')?.value; if (desde) qs.set('desde', desde);
    const hasta = $('#factHasta')?.value; if (hasta) qs.set('hasta', hasta);
    const fs = await api('/facturas' + (qs.toString() ? `?${qs}` : ''));
    box.innerHTML = fs.length ? fs.map(renderFactura).join('') : '<p class="muted small">Sin facturas registradas.</p>';
    box.querySelectorAll('[data-pagar-factura]').forEach(b => {
      const f = fs.find(x => x.id === b.dataset.pagarFactura);
      b.onclick = () => marcarFacturaPagada(f);
    });
  } catch (e) { box.innerHTML = ''; toast(e.message, true); }
}

function renderFactura(f) {
  const moneda = ctx.institucion.pagos?.moneda || 'Q';
  const pagar = f.estadoPago === 'pendiente'
    ? `<button class="small primary" data-pagar-factura="${esc(f.id)}">Marcar pagada</button>` : '';
  return `<div class="item">
    <div class="sec-head"><b>${esc(f.paciente)}</b><span class="badge ${f.estadoPago === 'pagado' ? 'ok' : ''}">${esc(f.estadoPago)}</span></div>
    <div class="meta">${esc(f.concepto)} · ${fmt(f.fecha)}</div>
    <div class="small"><b>${moneda} ${Number(f.monto).toFixed(2)}</b></div>
    <div>${pagar}</div>
  </div>`;
}

function nuevaFactura() {
  const opts = pacientesFactura.map(p => `<option value="${esc(p.id)}">${esc(p.apellido)}, ${esc(p.nombre)}</option>`).join('');
  const hoy = new Date().toISOString().slice(0, 10);
  formulario('Registrar factura', `
    <label>Paciente<select name="pacienteId" required>${opts}</select></label>
    <label>Concepto<input name="concepto" required></label>
    <label>Monto (Q)<input name="monto" type="number" min="0.01" step="0.01" required></label>
    <label>Fecha<input name="fecha" type="date" value="${hoy}" required></label>
    <label>Estado<select name="estadoPago"><option value="pendiente">Pendiente</option><option value="pagado">Pagada</option><option value="anulado">Anulada</option></select></label>`,
    async d => { await post('/facturas', d); toast('Factura registrada'); abrirFacturacion(); });
}

function marcarFacturaPagada(f) {
  const moneda = ctx.institucion.pagos?.moneda || 'Q';
  formulario(`Marcar factura como pagada · ${f.paciente}`,
    `<p class="muted small">${esc(f.concepto)} · ${moneda} ${Number(f.monto).toFixed(2)} · ${fmt(f.fecha)}</p>`,
    async () => { await post(`/facturas/${encodeURIComponent(f.id)}/pagar`, {}); toast('Factura marcada como pagada'); abrirFacturacion(); },
    'Marcar pagada');
}

async function cargarSeguro() {
  const box = $('#seguroBox'); if (!box) return;
  const pid = $('#segPaciente')?.value;
  if (!pid) { box.innerHTML = '<p class="muted small">Seleccione un paciente.</p>'; return; }
  box.innerHTML = '<p class="muted small">Cargando…</p>';
  try {
    const s = await api(`/pacientes/${encodeURIComponent(pid)}/seguro`);
    box.innerHTML = `<div class="item">
      <div class="sec-head"><b>Seguro del paciente</b><button class="small" id="bEditarSeguro">${s ? 'Editar' : 'Agregar'}</button></div>
      ${s ? `<div class="meta">${esc(s.aseguradora)} · Póliza ${esc(s.numeroPoliza)}</div><div class="small">${esc(s.cobertura) || 'Sin detalle de cobertura'}</div>` : '<p class="muted small">Sin seguro registrado.</p>'}
    </div>`;
    $('#bEditarSeguro').onclick = () => editarSeguro(pid, s || {});
  } catch (e) { box.innerHTML = ''; toast(e.message, true); }
}

function editarSeguro(pid, s) {
  s = s || {};
  formulario('Seguro médico', `
    <label>Aseguradora<input name="aseguradora" value="${esc(s.aseguradora || '')}" required></label>
    <label>Número de póliza<input name="numeroPoliza" value="${esc(s.numeroPoliza || '')}" required></label>
    <label>Cobertura<textarea name="cobertura" rows="2">${esc(s.cobertura || '')}</textarea></label>`,
    async d => { await post(`/pacientes/${encodeURIComponent(pid)}/seguro`, d); toast('Seguro guardado'); cargarSeguro(); });
}

function pintar({ paciente: p, consultas, extras }) {
  const E = ctx.institucion.etiquetas, medico = ctx.usuario.rol === 'medico', activo = p.activo;
  const datos = ctx.institucion.pacienteCampos.map(c => `<div><b>${esc(c.label)}</b>${esc(p[c.name]) || '—'}</div>`).join('');
  const extrasHtml = ctx.institucion.extras.map(def => {
    const lista = extras.filter(x => x.tipo === def.tipo);
    return `<div class="sec"><div class="sec-head"><h3>${esc(def.titulo)}</h3>
      ${medico && activo ? `<button class="small" data-extra="${def.tipo}">+ Agregar</button>` : ''}</div>
      ${lista.length ? lista.map(x => `<div class="item small">${esc(renderExtra(def, x))}<div class="meta">${fmt(x.fecha)}</div></div>`).join('') : '<p class="muted small">Sin registros</p>'}</div>`;
  }).join('');

  $('#detalle').innerHTML = `
    <div class="sec-head"><h2>${esc(p.nombre)} ${esc(p.apellido)} ${activo ? '' : '<span class="badge off">archivado</span>'}</h2>
      <div>${activo ? '<button class="small danger" id="bBaja">Dar de baja</button>' : (p.motivoBaja !== 'fallecimiento' ? '<button class="small" id="bReact">Reactivar</button>' : '')}</div></div>
    <div class="grid2">${datos}</div>
    ${activo ? '' : `<div class="banner off">Historial archivado — motivo: <b>${esc(p.motivoBaja)}</b> ${p.detalleBaja ? '· ' + esc(p.detalleBaja) : ''} (${fmt(p.fechaBaja)}). Solo lectura.</div>`}
    ${!medico ? '<div class="banner">Información clínica restringida: su rol administrativo solo ve las fechas de atención.</div>' : ''}
    ${extrasHtml}
    <div class="sec"><div class="sec-head"><h3>${esc(E.consulta)}s</h3>
      ${medico && activo ? `<button class="small primary" id="bCons">+ Registrar ${esc(E.consulta.toLowerCase())}</button>` : ''}</div>
      ${consultas.length ? consultas.map(c => consultaHtml(c, medico && activo)).join('') : '<p class="muted small">Sin registros</p>'}</div>`;

  const bB = $('#bBaja'); if (bB) bB.onclick = () => baja(p);
  const bR = $('#bReact'); if (bR) bR.onclick = async () => { try { await api(`/pacientes/${p.id}/reactivar`, { method: 'POST' }); toast('Historial reactivado'); cargarLista(); abrir(p.id); } catch (e) { toast(e.message, true); } };
  const bC = $('#bCons'); if (bC) bC.onclick = () => nuevaConsulta(p);
  document.querySelectorAll('[data-extra]').forEach(b => (b.onclick = () => nuevoExtra(p, b.dataset.extra)));
  document.querySelectorAll('[data-dx]').forEach(b => (b.onclick = () => nuevoDx(p, b.dataset.dx)));
  document.querySelectorAll('[data-rx]').forEach(b => { const [c, d] = b.dataset.rx.split('|'); b.onclick = () => nuevaReceta(p, c, d); });
  document.querySelectorAll('[data-tx]').forEach(b => { const [c, d] = b.dataset.tx.split('|'); b.onclick = () => nuevoTratamiento(p, c, d); });
}

function consultaHtml(c, puede) {
  return `<div class="item"><b>${esc(c.motivo || (c.restringido ? 'Atención registrada' : ''))}</b>
    <div class="meta">${fmt(c.fecha)} · ${esc(c.profesional)}</div>
    ${c.observaciones ? `<div class="small">${esc(c.observaciones)}</div>` : ''}
    ${c.diagnosticos.map(d => `<div class="dx"><b>${esc(d.descripcion)}</b> <span class="badge">${esc(d.tipo)}</span>
      ${d.codigo ? `<span class="muted small"> CIE-10 ${esc(d.codigo)}</span>` : ''}
      ${d.medicamentos.map(m => `<div class="rx">℞ ${esc(m.nombre)} — ${esc(m.dosis)}${m.frecuencia ? ', ' + esc(m.frecuencia) : ''}${m.duracion ? ', ' + esc(m.duracion) : ''}</div>`).join('')}
      ${(d.tratamientos || []).map(t => `<div class="tx">🩺 ${esc(t.descripcion)} — ${esc(t.estado)}${t.fechaInicio ? ` · ${fmt(t.fechaInicio)}${t.fechaFin ? ' → ' + fmt(t.fechaFin) : ''}` : ''}</div>`).join('')}
      ${puede ? `<div><button class="small link" data-rx="${esc(c.id)}|${esc(d.id)}">+ Recetar medicamento</button> <button class="small link" data-tx="${esc(c.id)}|${esc(d.id)}">+ Agregar tratamiento</button></div>` : ''}</div>`).join('')}
    ${puede ? `<button class="small" data-dx="${esc(c.id)}">+ Agregar diagnóstico</button>` : ''}</div>`;
}

function renderExtra(def, x) {
  const d = x.datos;
  if (def.variantes) { const v = def.variantes[d.examen]; return `${v ? v.label : d.examen}: ` + v.campos.filter(c => d[c.name] !== undefined).map(c => `${c.label} ${d[c.name]}`).join(' · '); }
  return def.campos.filter(c => d[c.name] !== undefined && d[c.name] !== '').map(c => `${c.label}: ${d[c.name]}`).join(' · ');
}

// ---------- acciones ----------
const post = (path, body) => api(path, { method: 'POST', body });
function refrescar(msg) { toast(msg); abrir(actual); }

function nuevaConsulta(p) {
  const E = ctx.institucion.etiquetas;
  formulario(`Registrar ${E.consulta.toLowerCase()}`,
    `<label>${esc(E.profesional)}<select name="profesionalId" required>${profesionales.map(x => `<option value="${esc(x.id)}">${esc(x.nombre)}</option>`).join('')}</select></label>
     <label>Motivo<input name="motivo" required></label><label>Observaciones<textarea name="observaciones" rows="3"></textarea></label>`,
    async d => { await post(`/pacientes/${p.id}/consultas`, d); refrescar('Registro guardado'); });
}
function nuevoDx(p, cid) {
  formulario('Agregar diagnóstico',
    `<label>Descripción<input name="descripcion" required></label><label>Código CIE-10 (opcional)<input name="codigo"></label>
     <label>Tipo<select name="tipo"><option>presuntivo</option><option>confirmado</option></select></label>`,
    async d => { await post(`/pacientes/${p.id}/consultas/${cid}/diagnosticos`, d); refrescar('Diagnóstico agregado'); });
}
function nuevaReceta(p, cid, did) {
  formulario('Recetar medicamento',
    `<label>Medicamento<input name="nombre" required></label><label>Dosis<input name="dosis" required placeholder="500 mg"></label>
     <label>Frecuencia<input name="frecuencia" placeholder="cada 8 horas"></label><label>Duración<input name="duracion" placeholder="7 días"></label>`,
    async d => { await post(`/pacientes/${p.id}/consultas/${cid}/diagnosticos/${did}/recetas`, d); refrescar('Medicamento recetado'); });
}
function nuevoTratamiento(p, cid, did) {
  const hoy = new Date().toISOString().slice(0, 10);
  const estados = ctx.institucion.tratamiento?.estados || ['en curso', 'finalizado', 'suspendido'];
  formulario('Agregar tratamiento',
    `<label>Descripción<input name="descripcion" required></label>
     <label>Fecha de inicio<input name="fechaInicio" type="date" value="${hoy}" required></label>
     <label>Fecha de fin<input name="fechaFin" type="date"></label>
     <label>Estado<select name="estado">${estados.map(e => `<option value="${esc(e)}">${esc(e)}</option>`).join('')}</select></label>`,
    async d => { await post(`/pacientes/${p.id}/consultas/${cid}/diagnosticos/${did}/tratamientos`, d); refrescar('Tratamiento agregado'); });
}
function nuevoExtra(p, tipo) {
  const def = ctx.institucion.extras.find(e => e.tipo === tipo);
  const enviar = async d => { await post(`/pacientes/${p.id}/extras/${tipo}`, d); refrescar('Registro guardado'); };
  if (!def.variantes) return formulario(def.titulo, def.campos.map(c => campo(c)).join(''), enviar);
  formulario(def.titulo, `<label>Tipo de examen<select name="examen" id="exSel">${Object.entries(def.variantes).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select></label>
    <div id="exCampos"></div>`, enviar);
  const pintarCampos = () => { $('#exCampos').innerHTML = def.variantes[$('#exSel').value].campos.map(c => campo(c)).join(''); };
  $('#exSel').onchange = pintarCampos; pintarCampos();
  $('#exCampos').style.display = 'grid'; $('#exCampos').style.gap = '10px';
}
function baja(p) {
  formulario('Dar de baja / archivar historial',
    `<label>Motivo<select name="motivo"><option value="traslado">Traslado a otra institución</option><option value="fallecimiento">Fallecimiento</option>
      <option value="administrativa">Causa administrativa</option><option value="otra">Otra</option></select></label>
     <label>Detalle (opcional)<textarea name="detalle" rows="2"></textarea></label>`,
    async d => { await post(`/pacientes/${p.id}/baja`, d); toast('Historial archivado'); cargarLista(); abrir(p.id); }, 'Archivar');
}

if (token) iniciar().catch(() => salir());

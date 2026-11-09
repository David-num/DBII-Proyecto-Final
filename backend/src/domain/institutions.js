// Catálogo de instituciones. Cada institución declara su motor y los campos específicos que
// la interfaz debe pintar. El frontend se construye a partir de esto, NO del motor activo.
const generos = ['Masculino', 'Femenino', 'Otro'];
const base = [
  { name: 'nombre', label: 'Nombre', required: true },
  { name: 'apellido', label: 'Apellido', required: true },
  { name: 'fechaNacimiento', label: 'Fecha de nacimiento', type: 'date', required: true },
  { name: 'genero', label: 'Género', type: 'select', options: generos, required: true }
];
const tail = [
  { name: 'telefono', label: 'Teléfono' },
  { name: 'direccion', label: 'Dirección' },
  { name: 'tipoSangre', label: 'Tipo de sangre', type: 'select', options: ['', 'O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'] }
];

const alergia = {
  tipo: 'alergia', titulo: 'Alergias',
  campos: [
    { name: 'nombre', label: 'Alergia', required: true },
    { name: 'tipo', label: 'Tipo', type: 'select', options: ['Medicamento', 'Alimento', 'Ambiental'], required: true },
    { name: 'severidad', label: 'Severidad', type: 'select', options: ['Leve', 'Moderada', 'Severa'], required: true }
  ]
};

// Solo las instituciones relacionales manejan honorarios en el esquema del proyecto.
const pagosHospital = {
  etiqueta: 'Pago de honorarios', moneda: 'Q',
  tipos: ['Salario fijo', 'Por consulta', 'Por procedimiento']
};
const pagosPediatrico = {
  etiqueta: 'Pago de honorarios', moneda: 'Q',
  tipos: ['Salario fijo', 'Por consulta']
};
// Tratamientos: se registran dentro de un diagnóstico, igual que las recetas.
const tratamiento = { estados: ['en curso', 'finalizado', 'suspendido'] };

module.exports = {
  hospital: {
    id: 'hospital', nombre: 'Hospital General', motor: 'PostgreSQL',
    etiquetas: { consulta: 'Cita médica', profesional: 'Médico' },
    pacienteCampos: [...base, { name: 'documento', label: 'DPI', required: true }, ...tail,],
    extras: [alergia],
    pagos: pagosHospital,
    camas: true, facturacion: true, tratamiento
  },
  pediatrico: {
    id: 'pediatrico', nombre: 'Centro Médico Pediátrico', motor: 'MySQL',
    etiquetas: { consulta: 'Consulta', profesional: 'Pediatra' },
    pacienteCampos: [...base, { name: 'responsable', label: 'Padre / madre / encargado', required: true }, ...tail],
    extras: [
      alergia,
      { tipo: 'vacuna', titulo: 'Esquema de vacunación', campos: [
        { name: 'nombre', label: 'Vacuna', required: true },
        { name: 'enfermedad', label: 'Previene' },
        { name: 'numeroDosis', label: 'No. de dosis', type: 'number', required: true },
        { name: 'dosisRequeridas', label: 'Dosis del esquema', type: 'number' },
        { name: 'fecha', label: 'Fecha de aplicación', type: 'date', required: true },
        { name: 'lote', label: 'Lote' },
        { name: 'proximaDosis', label: 'Próxima dosis', type: 'date' }
      ] },
      { tipo: 'crecimiento', titulo: 'Control de crecimiento', campos: [
        { name: 'fecha', label: 'Fecha', type: 'date', required: true },
        { name: 'peso', label: 'Peso (kg)', type: 'number', required: true },
        { name: 'talla', label: 'Talla (cm)', type: 'number', required: true },
        { name: 'perimetroCefalico', label: 'Perímetro cefálico (cm)', type: 'number' }
      ] }
    ],
    pagos: pagosPediatrico, tratamiento
  },
  laboratorio: {
    id: 'laboratorio', nombre: 'Laboratorio Clínico', motor: 'MongoDB',
    etiquetas: { consulta: 'Orden de examen', profesional: 'Médico remitente' },
    pacienteCampos: [...base, { name: 'documento', label: 'DPI' }, ...tail],
    extras: [
      { tipo: 'resultado', titulo: 'Resultados de exámenes', variantes: {
        hematologia: { label: 'Hematología completa', campos: [
          { name: 'hemoglobina', label: 'Hemoglobina (g/dL)', type: 'number' },
          { name: 'hematocrito', label: 'Hematocrito (%)', type: 'number' },
          { name: 'leucocitos', label: 'Leucocitos (/µL)', type: 'number' },
          { name: 'plaquetas', label: 'Plaquetas (/µL)', type: 'number' }
        ] },
        orina: { label: 'Examen de orina', campos: [
          { name: 'color', label: 'Color' }, { name: 'aspecto', label: 'Aspecto' },
          { name: 'ph', label: 'pH', type: 'number' }, { name: 'densidad', label: 'Densidad', type: 'number' },
          { name: 'proteinas', label: 'Proteínas' }, { name: 'glucosa', label: 'Glucosa' }
        ] },
        cultivo: { label: 'Cultivo', campos: [
          { name: 'muestra', label: 'Muestra' }, { name: 'microorganismo', label: 'Microorganismo aislado' },
          { name: 'antibiograma', label: 'Antibiograma' }, { name: 'interpretacion', label: 'Interpretación' }
        ] }
      } }
    ],
    tratamiento
  },
  clinica: {
    id: 'clinica', nombre: 'Clínica Odontológica', motor: 'Firebase (Firestore)',
    etiquetas: { consulta: 'Cita', profesional: 'Odontólogo' },
    pacienteCampos: [...base, ...tail.slice(0, 2)],
    extras: [
      { tipo: 'procedimiento', titulo: 'Procedimientos dentales', campos: [
        { name: 'piezaDental', label: 'Pieza dental', required: true },
        { name: 'descripcion', label: 'Procedimiento', required: true },
        { name: 'costo', label: 'Costo (Q)', type: 'number', required: true }
      ] }
    ],
    tratamiento
  }
};

-- =============================================================================
-- PROYECTO: APLICACIÓN MULTI-BASE DE DATOS
-- INSTITUCIÓN: HOSPITAL GENERAL
-- MOTOR: PostgreSQL
-- MODELO RELACIONAL NORMALIZADO (3FN)
-- =============================================================================

-- 1. CATÁLOGOS Y ENTIDADES INDEPENDIENTES
CREATE TABLE especialidad (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(60) NOT NULL,
    descripcion VARCHAR(200)
);

CREATE TABLE cama_habitacion (
    id SERIAL PRIMARY KEY,
    numero_habitacion VARCHAR(10) NOT NULL,
    numero_cama VARCHAR(10) NOT NULL,
    tipo VARCHAR(20) NOT NULL,
    estado VARCHAR(15) NOT NULL,
    CONSTRAINT uq_cama_habitacion UNIQUE (numero_habitacion, numero_cama)
);

CREATE TABLE medicamento (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    presentacion VARCHAR(50) NOT NULL,
    concentracion VARCHAR(30) NOT NULL,
    via_administracion_default VARCHAR(30) NOT NULL
);

CREATE TABLE alergia (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(80) NOT NULL,
    tipo VARCHAR(20) NOT NULL,
    descripcion VARCHAR(150)
);

-- 2. ENTIDADES PRINCIPALES (PERSONAL Y PACIENTES)
CREATE TABLE empleado (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(60) NOT NULL,
    apellido VARCHAR(60) NOT NULL,
    tipo_personal VARCHAR(30) NOT NULL,
    especialidad_id INTEGER REFERENCES especialidad(id) ON UPDATE CASCADE ON DELETE SET NULL,
    numero_colegiado VARCHAR(20),
    telefono VARCHAR(20),
    correo VARCHAR(100)
);

CREATE TABLE paciente (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(60) NOT NULL,
    apellido VARCHAR(60) NOT NULL,
    fecha_nacimiento DATE NOT NULL,
    genero VARCHAR(15) NOT NULL,
    dpi VARCHAR(20) NOT NULL UNIQUE,
    direccion VARCHAR(150),
    telefono VARCHAR(20),
    correo VARCHAR(100),
    tipo_sangre VARCHAR(5),
    contacto_emergencia_nombre VARCHAR(120),
    contacto_emergencia_telefono VARCHAR(20),
    seguro_medico_id INTEGER
);

CREATE TABLE seguro_medico (
    id SERIAL PRIMARY KEY,
    paciente_id INTEGER NOT NULL REFERENCES paciente(id) ON UPDATE CASCADE ON DELETE CASCADE,
    aseguradora VARCHAR(80) NOT NULL,
    numero_poliza VARCHAR(30) NOT NULL,
    cobertura VARCHAR(150)
);

-- Relación diferida entre paciente y seguro_medico
ALTER TABLE paciente 
    ADD CONSTRAINT fk_paciente_seguro_medico 
    FOREIGN KEY (seguro_medico_id) REFERENCES seguro_medico(id) 
    ON UPDATE CASCADE ON DELETE SET NULL;

CREATE TABLE paciente_alergia (
    paciente_id INTEGER NOT NULL REFERENCES paciente(id) ON UPDATE CASCADE ON DELETE CASCADE,
    alergia_id INTEGER NOT NULL REFERENCES alergia(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    severidad VARCHAR(15) NOT NULL,
    fecha_registro DATE NOT NULL,
    PRIMARY KEY (paciente_id, alergia_id)
);

-- 3. HONORARIOS MÉDICOS
CREATE TABLE pago_medico (
    id SERIAL PRIMARY KEY,
    medico_id INTEGER NOT NULL REFERENCES empleado(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    periodo VARCHAR(20) NOT NULL,
    tipo_pago VARCHAR(20) NOT NULL,
    cantidad_consultas INTEGER DEFAULT 0,
    monto NUMERIC(10, 2) NOT NULL,
    fecha_pago DATE,
    estado VARCHAR(20) NOT NULL
);

-- 4. ATENCIÓN AMBULATORIA E INTERNAMIENTOS
CREATE TABLE cita (
    id SERIAL PRIMARY KEY,
    paciente_id INTEGER NOT NULL REFERENCES paciente(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    medico_id INTEGER NOT NULL REFERENCES empleado(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    especialidad_id INTEGER NOT NULL REFERENCES especialidad(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    fecha_hora TIMESTAMP NOT NULL,
    motivo VARCHAR(200) NOT NULL,
    estado VARCHAR(20) NOT NULL,
    pago_id INTEGER REFERENCES pago_medico(id) ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE TABLE diagnostico (
    id SERIAL PRIMARY KEY,
    paciente_id INTEGER NOT NULL REFERENCES paciente(id) ON UPDATE CASCADE ON DELETE CASCADE,
    cita_id INTEGER REFERENCES cita(id) ON UPDATE CASCADE ON DELETE SET NULL,
    internamiento_id INTEGER, -- FK agregada tras crear internamiento
    medico_id INTEGER NOT NULL REFERENCES empleado(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    codigo_cie10 VARCHAR(10) NOT NULL,
    descripcion VARCHAR(200) NOT NULL,
    tipo VARCHAR(15) NOT NULL,
    fecha TIMESTAMP NOT NULL
);

CREATE TABLE internamiento (
    id SERIAL PRIMARY KEY,
    paciente_id INTEGER NOT NULL REFERENCES paciente(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    cama_id INTEGER NOT NULL REFERENCES cama_habitacion(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    medico_responsable_id INTEGER NOT NULL REFERENCES empleado(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    fecha_ingreso TIMESTAMP NOT NULL,
    fecha_alta TIMESTAMP,
    motivo_ingreso VARCHAR(200) NOT NULL,
    diagnostico_ingreso_id INTEGER REFERENCES diagnostico(id) ON UPDATE CASCADE ON DELETE SET NULL,
    estado VARCHAR(20) NOT NULL
);

-- Relación diferida entre diagnostico e internamiento
ALTER TABLE diagnostico 
    ADD CONSTRAINT fk_diagnostico_internamiento 
    FOREIGN KEY (internamiento_id) REFERENCES internamiento(id) 
    ON UPDATE CASCADE ON DELETE SET NULL;

-- 5. TRATAMIENTOS, MONITOREO Y ADMINISTRACIÓN DE FÁRMACOS
CREATE TABLE tratamiento (
    id SERIAL PRIMARY KEY,
    diagnostico_id INTEGER NOT NULL REFERENCES diagnostico(id) ON UPDATE CASCADE ON DELETE CASCADE,
    descripcion VARCHAR(250) NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE,
    estado VARCHAR(20) NOT NULL
);

CREATE TABLE administracion_medicamento (
    id SERIAL PRIMARY KEY,
    internamiento_id INTEGER NOT NULL REFERENCES internamiento(id) ON UPDATE CASCADE ON DELETE CASCADE,
    medicamento_id INTEGER NOT NULL REFERENCES medicamento(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    dosis VARCHAR(30) NOT NULL,
    via_administracion VARCHAR(30) NOT NULL,
    fecha_hora TIMESTAMP NOT NULL,
    enfermero_responsable_id INTEGER NOT NULL REFERENCES empleado(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    observaciones VARCHAR(200)
);

CREATE TABLE signos_vitales (
    id SERIAL PRIMARY KEY,
    internamiento_id INTEGER NOT NULL REFERENCES internamiento(id) ON UPDATE CASCADE ON DELETE CASCADE,
    fecha_hora TIMESTAMP NOT NULL,
    temperatura NUMERIC(4, 1),
    presion_arterial VARCHAR(10),
    frecuencia_cardiaca INTEGER,
    frecuencia_respiratoria INTEGER,
    saturacion_oxigeno NUMERIC(4, 1),
    registrado_por INTEGER NOT NULL REFERENCES empleado(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

-- 6. FACTURACIÓN
CREATE TABLE factura (
    id SERIAL PRIMARY KEY,
    paciente_id INTEGER NOT NULL REFERENCES paciente(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    internamiento_id INTEGER REFERENCES internamiento(id) ON UPDATE CASCADE ON DELETE SET NULL,
    cita_id INTEGER REFERENCES cita(id) ON UPDATE CASCADE ON DELETE SET NULL,
    concepto VARCHAR(200) NOT NULL,
    monto NUMERIC(10, 2) NOT NULL,
    fecha DATE NOT NULL,
    estado_pago VARCHAR(20) NOT NULL
);

-- =============================================================================
-- ENTREGA II · EXTENSIONES (modelo corregido a partir de la retroalimentación)
-- Se agregan: baja lógica del paciente, observaciones de la cita y receta de medicamentos
-- =============================================================================
ALTER TABLE paciente ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE paciente ADD COLUMN IF NOT EXISTS motivo_baja VARCHAR(30);
ALTER TABLE paciente ADD COLUMN IF NOT EXISTS detalle_baja VARCHAR(250);
ALTER TABLE paciente ADD COLUMN IF NOT EXISTS fecha_baja TIMESTAMP;
ALTER TABLE cita ADD COLUMN IF NOT EXISTS observaciones VARCHAR(500);

CREATE TABLE IF NOT EXISTS receta_medicamento (
    id SERIAL PRIMARY KEY,
    diagnostico_id INTEGER NOT NULL REFERENCES diagnostico(id) ON UPDATE CASCADE ON DELETE CASCADE,
    medicamento_id INTEGER NOT NULL REFERENCES medicamento(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    dosis VARCHAR(50) NOT NULL,
    frecuencia VARCHAR(50),
    duracion VARCHAR(50),
    fecha TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cita_paciente ON cita(paciente_id, fecha_hora DESC);
CREATE INDEX IF NOT EXISTS idx_diagnostico_paciente ON diagnostico(paciente_id);
CREATE INDEX IF NOT EXISTS idx_tratamiento_diagnostico ON tratamiento(diagnostico_id);
CREATE INDEX IF NOT EXISTS idx_factura_paciente ON factura(paciente_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_seguro_paciente ON seguro_medico(paciente_id);
CREATE INDEX IF NOT EXISTS idx_cama_estado ON cama_habitacion(estado, tipo);

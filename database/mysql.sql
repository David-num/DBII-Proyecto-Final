-- =============================================================================
-- PROYECTO: APLICACIÓN MULTI-BASE DE DATOS
-- INSTITUCIÓN: CENTRO MÉDICO PEDIÁTRICO
-- MOTOR: MySQL 8.0+
-- MODELO RELACIONAL NORMALIZADO (3FN)
-- =============================================================================

CREATE DATABASE IF NOT EXISTS centro_pediatrico CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE centro_pediatrico;

-- 1. CATÁLOGOS Y ENTIDADES INDEPENDIENTES
CREATE TABLE IF NOT EXISTS vacuna (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(80) NOT NULL,
    enfermedad_previene VARCHAR(100) NOT NULL,
    dosis_requeridas INT NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS alergia (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(80) NOT NULL,
    tipo VARCHAR(20) NOT NULL,
    descripcion VARCHAR(150)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pediatra (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(60) NOT NULL,
    apellido VARCHAR(60) NOT NULL,
    numero_colegiado VARCHAR(20) NOT NULL UNIQUE,
    telefono VARCHAR(20)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS paciente (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(60) NOT NULL,
    apellido VARCHAR(60) NOT NULL,
    fecha_nacimiento DATE NOT NULL,
    genero VARCHAR(15) NOT NULL,
    nombre_padre_madre VARCHAR(120) NOT NULL,
    telefono_contacto VARCHAR(20),
    direccion VARCHAR(150),
    tipo_sangre VARCHAR(5)
) ENGINE=InnoDB;

-- 2. RELACIONES DIRECTAS DEL PACIENTE
CREATE TABLE IF NOT EXISTS paciente_alergia (
    paciente_id INT NOT NULL,
    alergia_id INT NOT NULL,
    severidad VARCHAR(15) NOT NULL,
    PRIMARY KEY (paciente_id, alergia_id),
    CONSTRAINT fk_pa_paciente FOREIGN KEY (paciente_id) REFERENCES paciente(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_pa_alergia FOREIGN KEY (alergia_id) REFERENCES alergia(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- 3. HONORARIOS MÉDICOS
CREATE TABLE IF NOT EXISTS pago_pediatra (
    id INT AUTO_INCREMENT PRIMARY KEY,
    pediatra_id INT NOT NULL,
    periodo VARCHAR(20) NOT NULL,
    tipo_pago VARCHAR(20) NOT NULL,
    cantidad_consultas INT DEFAULT 0,
    monto DECIMAL(10, 2) NOT NULL,
    fecha_pago DATE,
    estado VARCHAR(20) NOT NULL,
    CONSTRAINT fk_pago_pediatra FOREIGN KEY (pediatra_id) REFERENCES pediatra(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- 4. ATENCIÓN CLÍNICA Y EVALUACIONES
CREATE TABLE IF NOT EXISTS consulta (
    id INT AUTO_INCREMENT PRIMARY KEY,
    paciente_id INT NOT NULL,
    pediatra_id INT NOT NULL,
    fecha DATETIME NOT NULL,
    motivo VARCHAR(200) NOT NULL,
    peso DECIMAL(5, 2),
    talla DECIMAL(5, 2),
    observaciones VARCHAR(250),
    pago_id INT NULL,
    CONSTRAINT fk_consulta_paciente FOREIGN KEY (paciente_id) REFERENCES paciente(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_consulta_pediatra FOREIGN KEY (pediatra_id) REFERENCES pediatra(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_consulta_pago FOREIGN KEY (pago_id) REFERENCES pago_pediatra(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

-- 5. HISTORIAL DE VACUNACIÓN, CONTROLES Y CRECIMIENTO
CREATE TABLE IF NOT EXISTS esquema_vacunacion (
    id INT AUTO_INCREMENT PRIMARY KEY,
    paciente_id INT NOT NULL,
    vacuna_id INT NOT NULL,
    numero_dosis INT NOT NULL,
    fecha_aplicacion DATE NOT NULL,
    lote VARCHAR(30),
    proxima_dosis_fecha DATE,
    CONSTRAINT fk_esquema_paciente FOREIGN KEY (paciente_id) REFERENCES paciente(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_esquema_vacuna FOREIGN KEY (vacuna_id) REFERENCES vacuna(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS curva_crecimiento (
    id INT AUTO_INCREMENT PRIMARY KEY,
    paciente_id INT NOT NULL,
    fecha DATE NOT NULL,
    peso DECIMAL(5, 2) NOT NULL,
    talla DECIMAL(5, 2) NOT NULL,
    perimetro_cefalico DECIMAL(5, 2),
    percentil_peso DECIMAL(5, 2),
    percentil_talla DECIMAL(5, 2),
    CONSTRAINT fk_curva_paciente FOREIGN KEY (paciente_id) REFERENCES paciente(id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS control_programado (
    id INT AUTO_INCREMENT PRIMARY KEY,
    paciente_id INT NOT NULL,
    fecha_programada DATE NOT NULL,
    tipo_control VARCHAR(50) NOT NULL,
    estado VARCHAR(20) NOT NULL,
    CONSTRAINT fk_control_paciente FOREIGN KEY (paciente_id) REFERENCES paciente(id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

-- =============================================================================
-- ENTREGA II · EXTENSIONES (modelo corregido a partir de la retroalimentación)
-- Se agregan: baja lógica del paciente, diagnóstico por consulta y receta de medicamentos
-- (el modelo de la Entrega I no tenía diagnóstico ni medicamento, requeridos por las reglas de negocio)
-- =============================================================================
ALTER TABLE paciente
    ADD COLUMN activo TINYINT(1) NOT NULL DEFAULT 1,
    ADD COLUMN motivo_baja VARCHAR(30) NULL,
    ADD COLUMN detalle_baja VARCHAR(250) NULL,
    ADD COLUMN fecha_baja DATETIME NULL;

CREATE TABLE IF NOT EXISTS diagnostico (
    id INT AUTO_INCREMENT PRIMARY KEY,
    consulta_id INT NOT NULL,
    codigo_cie10 VARCHAR(10),
    descripcion VARCHAR(200) NOT NULL,
    tipo VARCHAR(15) NOT NULL,
    fecha DATETIME NOT NULL,
    CONSTRAINT fk_diag_consulta FOREIGN KEY (consulta_id) REFERENCES consulta(id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS medicamento (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    presentacion VARCHAR(50)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS receta_medicamento (
    id INT AUTO_INCREMENT PRIMARY KEY,
    diagnostico_id INT NOT NULL,
    medicamento_id INT NOT NULL,
    dosis VARCHAR(50) NOT NULL,
    frecuencia VARCHAR(50),
    duracion VARCHAR(50),
    fecha DATETIME NOT NULL,
    CONSTRAINT fk_receta_diag FOREIGN KEY (diagnostico_id) REFERENCES diagnostico(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_receta_med FOREIGN KEY (medicamento_id) REFERENCES medicamento(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tratamiento (
    id INT AUTO_INCREMENT PRIMARY KEY,
    diagnostico_id INT NOT NULL,
    descripcion VARCHAR(250) NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE,
    estado VARCHAR(20) NOT NULL,
    CONSTRAINT fk_trat_diag FOREIGN KEY (diagnostico_id) REFERENCES diagnostico(id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_consulta_paciente ON consulta(paciente_id, fecha);
CREATE INDEX idx_tratamiento_diagnostico ON tratamiento(diagnostico_id);

# Documento comparativo · Entrega II
Reglas de negocio idénticas (registrar consulta, agregar diagnóstico, recetar medicamento, agregar tratamiento, baja de paciente) sobre
cuatro modelos de datos distintos. Un motor por institución, sin repetir.

## 1. Asignación y justificación
| Institución | Motor | Por qué |
|---|---|---|
| Hospital General | **PostgreSQL** | Necesita integridad transaccional fuerte: un diagnóstico no puede quedar "a medias". PostgreSQL ofrece ACID completo, claves foráneas, `CHECK/UNIQUE` y bloqueo de filas (`FOR UPDATE`). El modelo es muy relacional (cita–diagnóstico–tratamiento–internamiento–factura), con muchas relaciones N:M. |
| Centro Médico Pediátrico | **MySQL (InnoDB)** | Consultas muy frecuentes y cortas, con esquema estable (paciente, consulta, vacunación, crecimiento). MySQL rinde muy bien en lecturas/escrituras simples de alto volumen y mantiene integridad referencial con InnoDB. |
| Laboratorio Clínico | **MongoDB** | Los resultados cambian de estructura según el examen (hematología, orina, cultivo). Un documento flexible evita tablas con decenas de columnas nulas o un modelo EAV. |
| Clínica Odontológica | **Firebase (Firestore)** | No tiene personal técnico: Firestore es administrado (sin servidores, parches ni respaldos propios), escala solo y su volumen es pequeño. Prioriza rapidez de atención de las secretarias. |

## 2. Decisiones de modelado
**PostgreSQL (3FN).** Tablas de la Entrega I corregida; se agregaron `activo/motivo_baja/fecha_baja` en `paciente`,
`observaciones` en `cita`, `receta_medicamento` (diagnóstico → medicamento) y se usa `tratamiento` (diagnóstico → tratamiento).
"Consulta" se implementa como `cita` atendida. Catálogos (`medicamento`, `alergia`, `especialidad`) evitan repetir texto.
Camas (`cama_habitacion`), facturación (`factura`) y seguros (`seguro_medico`) son módulos exclusivos de esta institución.

**MySQL (3FN).** La Entrega I no tenía diagnóstico ni medicamento, necesarios para las reglas de negocio:
se agregaron `diagnostico` (1:N con `consulta`), `medicamento`, `receta_medicamento` y `tratamiento`, más los campos de baja lógica.

**MongoDB (documental).** Colecciones `pacientes`, `profesionales`, `consultas`, `resultados`.
- *Embebido:* diagnósticos, medicamentos y tratamientos dentro de la consulta. Son pocos por consulta, nacen y se leen con ella, y así
  cada alta es una escritura atómica sobre un solo documento.
- *Referenciado:* `resultados` por `pacienteId` en su propia colección. Un paciente acumula cientos de exámenes, embeberlos
  haría crecer el documento sin límite (tope de 16 MB) y obligaría a leerlos siempre. El campo `campos` guarda la estructura variable de cada examen.
- Las consultas también se referencian por `pacienteId` (crecen con los años); índice `{pacienteId, fecha}`.

**Firestore (documental).** `pacientes/{id}` con subcolecciones `consultas` y `procedimientos`.
- *Embebido:* diagnósticos, medicamentos y tratamientos dentro del documento de la consulta (acotados).
- *Subcolección (referencia):* `procedimientos` y `consultas`, porque crecen sin límite y el documento de Firestore tiene tope de 1 MB.
- La búsqueda por nombre se filtra en memoria (Firestore no hace búsqueda parcial de texto); aceptable por el volumen de una clínica pequeña.

## 3. Consistencia
| Motor | Mecanismo |
|---|---|
| PostgreSQL | Transacciones `BEGIN/COMMIT/ROLLBACK` en cada escritura compuesta; `SELECT … FOR UPDATE` sobre la cita/diagnóstico padre; FK con `RESTRICT`/`CASCADE`. |
| MySQL | Transacciones InnoDB (`beginTransaction/commit/rollback`), `FOR UPDATE` en la consulta/diagnóstico padre, FK. |
| MongoDB | Atomicidad a nivel de documento: `$push` sobre la consulta (diagnóstico + receta + tratamiento viven en el mismo documento). No se requieren transacciones multi-documento ni replica set. Validador `$jsonSchema` en las colecciones. |
| Firestore | `runTransaction` (lectura + escritura atómicas con reintento automático) para agregar diagnósticos, recetas y tratamientos al documento de la consulta. |

Reglas comunes (en `HistorialService`, no en los adaptadores): paciente archivado = solo lectura; no se receta un
medicamento al que el paciente es alérgico; fecha de fin de tratamiento no anterior al inicio; fecha de nacimiento no
futura; campos obligatorios por institución. Facturas y seguros solo los gestiona el rol administrativo del Hospital General.

## 4. Seguridad
- **Autenticación:** usuario/contraseña con `bcrypt`; sesión con JWT (4 h). El token contiene la institución, y de ahí se resuelve el motor.
- **Autorización por rol:** `medico` (clínico) y `administrativo`. El administrativo no ve diagnósticos, observaciones ni resultados.
- **Clasificación de la información** (Entrega I): pública (catálogos), confidencial (contacto, honorarios, facturación), restringida (diagnósticos, tratamientos, alergias, resultados, signos vitales).
- **Inyección:** consultas parametrizadas en SQL (`$1`, `?`); en MongoDB se usan `ObjectId` tipados y se escapa la expresión regular de búsqueda; en el frontend todo texto se escapa antes de pintarse (anti-XSS).
- **Fuerza bruta:** límite de 10 intentos de login por minuto y por IP.
- **Aislamiento por institución:** cada institución tiene su propia infraestructura; un usuario nunca recibe un repositorio distinto al de su token.
- **Recomendaciones de despliegue:** usuarios de BD con mínimo privilegio (sin DDL) por institución; TLS en el servidor y en las conexiones; en Firestore reglas `allow read, write: if false` (el acceso es solo desde el servidor con el Admin SDK); secretos en variables de entorno.

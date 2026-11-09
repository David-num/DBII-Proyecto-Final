# Historial clínico multi-motor · Entrega II
Bases de Datos II · Universidad Rafael Landívar

Aplicación cliente-servidor (Node.js + Express + HTML/JS) con **arquitectura hexagonal**. Al iniciar sesión, el
usuario queda ligado a su institución y todas sus operaciones se dirigen al motor correspondiente:

| Institución | Motor | Adaptador |
|---|---|---|
| Hospital General | PostgreSQL | `adapters/postgres` |
| Centro Médico Pediátrico | MySQL | `adapters/mysql` |
| Laboratorio Clínico | MongoDB (Compass) | `adapters/mongo` |
| Clínica Odontológica | Firebase (Firestore) | `adapters/firebase` |

## Estructura
```
backend/src/domain/          reglas del dominio: puerto (ports.js), instituciones, errores
backend/src/application/     HistorialService -> reglas de negocio ÚNICAS para los 4 motores
backend/src/adapters/        un adaptador por motor (implementan el mismo puerto)
backend/src/infrastructure/  repositoryFactory (usuario -> institución -> motor), usuarios demo
backend/src/http/            API REST (Express) + JWT
frontend/                    interfaz única (no depende del motor)
database/                    postgres.sql, mysql.sql, mongo_init.js
docs/comparativo.md          documento comparativo (decisiones, consistencia, seguridad, justificación)
```

## Puesta en marcha
1. **Bases de datos**
   - PostgreSQL y MySQL: `docker compose up -d` (carga `database/postgres.sql` y `database/mysql.sql`).
     Sin Docker: cree las bases `hospital_general` y `centro_pediatrico` y ejecute cada script.
     Si ya tenía las bases creadas, vuelva a ejecutar `database/mysql.sql` para crear la tabla `tratamiento`.
   - MongoDB: con tu instancia local abierta en Compass, ejecuta `mongosh database/mongo_init.js`
     (o deja que la app cree colecciones e índices al primer uso).
   - Firebase: crea un proyecto, activa **Cloud Firestore**, descarga una cuenta de servicio
     (Configuración del proyecto → Cuentas de servicio) y guárdala como `backend/firebase-service-account.json`.
     Alternativa sin cuenta: `npx firebase-tools emulators:start --only firestore` y `FIRESTORE_EMULATOR_HOST=localhost:8080`.
2. **Backend**
   ```bash
   cd backend
   cp .env.example .env     # ajusta credenciales
   npm install
   npm start                # http://localhost:3000  (sirve también el frontend)
   npm test                 # reglas de negocio (repositorio en memoria)
   ```
3. Abre `http://localhost:3000`. Usuarios demo (contraseña `Clave123!`):
   `hospital.medico`, `pediatrico.medico`, `laboratorio.medico`, `clinica.medico` y sus equivalentes `*.admin`
   (rol administrativo: sin acceso a información clínica restringida).

## Operaciones (mismas reglas en los 4 motores)
Registrar paciente nuevo · buscar/listar · ver historial completo · registrar consulta · agregar diagnóstico ·
recetar medicamento (rechaza alergias registradas) · agregar tratamientos al diagnóstico (en curso, finalizado o
suspendido) · módulos propios de cada institución (alergias, vacunas, crecimiento, resultados de laboratorio,
procedimientos dentales) · dar de baja/archivar (traslado, fallecimiento, administrativa, otra) y reactivar.
Un historial archivado queda en solo lectura.

Los usuarios `*.admin` de **Hospital General** y **Centro Médico Pediátrico** tienen además el módulo de
**pagos de honorarios**: registrar pagos, filtrarlos por profesional y fecha, vincular citas/consultas atendidas,
consultar las que aún no tienen pago y marcar un pago pendiente como pagado sin crear un registro duplicado.
Es información confidencial: solo el rol administrativo puede verla y gestionarla. Laboratorio y Clínica no
manejan pagos en este modelo.

El **Hospital General** agrega dos módulos operativos:
- **Camas disponibles**: consulta de camas libres por tipo (General, UCI, Aislamiento) y habitación.
- **Facturación y seguros** (solo rol administrativo): registro de facturas por paciente, filtro por fechas,
  cambio de estado a pagada y administración del seguro médico (aseguradora, póliza y cobertura). El nombre del
  paciente se muestra mediante JOIN; no se duplica en la factura.

## Cómo cambiar de motor una institución
Solo se edita `backend/src/infrastructure/repositoryFactory.js`; el dominio, la API y la interfaz no cambian.

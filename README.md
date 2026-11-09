# Historial clínico multi-motor · Entrega II

Bases de Datos II · Universidad Rafael Landívar

Aplicación cliente-servidor (Node.js + Express + HTML/JS) con **arquitectura hexagonal**. Al iniciar sesión, el usuario queda ligado a su institución y todas sus operaciones se dirigen al motor correspondiente:

| Institución | Motor | Adaptador |
|---|---|---|
| Hospital General | PostgreSQL | `adapters/postgres` |
| Centro Médico Pediátrico | MySQL | `adapters/mysql` |
| Laboratorio Clínico | MongoDB (Compass) | `adapters/mongo` |
| Clínica Odontológica | Firebase (Firestore) | `adapters/firebase` |

> **Credenciales y archivo `.env`:** todos los valores sensibles (contenido completo de `backend/.env`, contraseñas de las bases de datos, usuarios demo y cuenta de servicio de Firebase) están en el **Word donde se envió el enlace de este proyecto**. Este README no incluye contraseñas ni secretos.

## Estructura del proyecto

```text
backend/src/domain/          reglas del dominio: puerto (ports.js), instituciones, errores
backend/src/application/     HistorialService -> reglas de negocio ÚNICAS para los 4 motores
backend/src/adapters/        un adaptador por motor (implementan el mismo puerto)
backend/src/infrastructure/  repositoryFactory (usuario -> institución -> motor), usuarios demo
backend/src/http/            API REST (Express) + JWT
backend/test/                pruebas de las reglas de negocio
frontend/                    interfaz única (no depende del motor)
database/                    postgres.sql, mysql.sql, mongo_init.js
docs/comparativo.md          documento comparativo (decisiones, consistencia, seguridad, justificación)
```

## Requisitos previos

Instale o verifique lo siguiente antes de empezar:

- **Node.js 18 o superior** y **npm**.
- **Git** (si va a clonar el repositorio).
- **Docker Desktop** (opcional, pero es la forma recomendada de levantar PostgreSQL y MySQL).
- **MongoDB local** con **MongoDB Compass** y `mongosh` (necesario para el Laboratorio Clínico).
- **Firebase** (cuenta de servicio o emulador) para la Clínica Odontológica.

Puede comprobar las versiones desde una terminal:

```bash
node -v
npm -v
docker --version
```

## Puesta en marcha paso a paso

### Paso 1. Obtener el proyecto

Clone el repositorio o descomprima la carpeta entregada. Después entre a la carpeta raíz:

```bash
git clone <URL-DEL-REPOSITORIO>
cd DBII-Proyecto-Final
```

Si ya tiene la carpeta descargada, simplemente abra una terminal dentro de ella.

### Paso 2. Crear el archivo `backend/.env`

El servidor lee la configuración desde `backend/.env`. Cree ese archivo a partir de la plantilla incluida.

**Windows PowerShell:**

```powershell
Copy-Item backend/.env.example backend/.env
```

**Linux, macOS o Git Bash:**

```bash
cp backend/.env.example backend/.env
```

Luego abra `backend/.env` y complete los valores. **Los valores exactos que debe copiar (contraseñas, cadenas de conexión, secreto JWT y credenciales de Firebase) están en el Word donde se envió el enlace de este proyecto.**

> El archivo debe llamarse `.env` y estar dentro de `backend/`, no en la raíz. Además, `npm start` debe ejecutarse desde la carpeta `backend`.

### Paso 3. Levantar las bases de datos

Puede usar Docker para PostgreSQL y MySQL, o instancias locales. MongoDB y Firebase se configuran aparte.

#### Opción A — PostgreSQL y MySQL con Docker (recomendada)

Desde la raíz del proyecto:

```bash
docker compose up -d
```

Este comando:

- Descarga y levanta **PostgreSQL 16** en el puerto `5432`.
- Descarga y levanta **MySQL 8** en el puerto `3306`.
- Crea la base `hospital_general` y ejecuta `database/postgres.sql`.
- Ejecuta `database/mysql.sql`, que crea la base `centro_pediatrico`.

Verifique que ambos contenedores estén corriendo:

```bash
docker compose ps
```

Las credenciales de estos contenedores están en el Word donde se envió el enlace de este proyecto.

> Espere unos segundos después de levantar MySQL antes de iniciar la aplicación. Si la primera petición responde con error de conexión, espere y vuelva a intentar.

#### Opción B — PostgreSQL y MySQL instalados localmente

Si no usa Docker, cree las bases y ejecute los scripts manualmente.

**PostgreSQL:**

```bash
psql -U postgres -c "CREATE DATABASE hospital_general;"
psql -U postgres -d hospital_general -f database/postgres.sql
```

También puede crear la base `hospital_general` desde pgAdmin y luego ejecutar el contenido de `database/postgres.sql` sobre ella.

**MySQL:**

```bash
mysql -u root -p < database/mysql.sql
```

El script de MySQL crea la base `centro_pediatrico` automáticamente. Si ya tenía las bases creadas, vuelva a ejecutar `database/mysql.sql` para asegurarse de que exista la tabla `tratamiento`.

Las contraseñas de PostgreSQL y MySQL están en el Word donde se envió el enlace de este proyecto.

#### MongoDB — Laboratorio Clínico

Con su instancia local de MongoDB abierta (por ejemplo, desde Compass), ejecute desde la raíz del proyecto:

```bash
mongosh "mongodb://localhost:27017" database/mongo_init.js
```

El script crea la base `laboratorio_clinico`, sus colecciones y sus índices.

> Si las colecciones ya existen, el script puede mostrar un aviso. No es necesario volver a ejecutarlo: la aplicación crea los índices y los datos iniciales que faltan al primer uso.

La cadena de conexión de MongoDB está en el Word donde se envió el enlace de este proyecto.

#### Firebase — Clínica Odontológica

Tiene dos alternativas:

**Opción 1: proyecto real de Firebase**

1. Cree un proyecto en Firebase Console.
2. Active **Cloud Firestore**.
3. Descargue una cuenta de servicio desde **Configuración del proyecto → Cuentas de servicio**.
4. Guarde el archivo como `backend/firebase-service-account.json`.

La ruta y los datos de la cuenta de servicio están en el Word donde se envió el enlace de este proyecto.

**Opción 2: emulador local (sin cuenta de servicio)**

```bash
cd backend
npx firebase-tools emulators:start --only firestore
```

Luego agregue al `backend/.env` la variable del emulador. El valor exacto está en el Word donde se envió el enlace de este proyecto.

### Paso 4. Instalar las dependencias del backend

```bash
cd backend
npm install
```

### Paso 5. Ejecutar la aplicación

Desde la carpeta `backend`:

```bash
npm start
```

Debe aparecer un mensaje similar a:

```text
Servidor en http://localhost:3000
```

Abra en el navegador:

```text
http://localhost:3000
```

Para desarrollo con recarga automática puede usar:

```bash
npm run dev
```

Para detener el servidor presione `Ctrl + C`.

### Paso 6. Iniciar sesión

La aplicación incluye usuarios de demostración para cada institución y rol. Los nombres de usuario son:

| Usuario | Rol | Institución |
|---|---|---|
| `hospital.medico` | médico | Hospital General |
| `hospital.admin` | administrativo | Hospital General |
| `pediatrico.medico` | médico | Centro Médico Pediátrico |
| `pediatrico.admin` | administrativo | Centro Médico Pediátrico |
| `laboratorio.medico` | médico | Laboratorio Clínico |
| `laboratorio.admin` | administrativo | Laboratorio Clínico |
| `clinica.medico` | médico | Clínica Odontológica |
| `clinica.admin` | administrativo | Clínica Odontológica |

La contraseña de todos los usuarios demo está en el Word donde se envió el enlace de este proyecto.

Los usuarios con rol administrativo no tienen acceso a la información clínica restringida.

### Paso 7. Ejecutar las pruebas

Desde la carpeta `backend`:

```bash
npm test
```

Las pruebas validan las reglas de negocio con un repositorio en memoria; no necesitan que las bases de datos estén levantadas.

### Detener los servicios de Docker

Cuando termine, puede apagar PostgreSQL y MySQL sin borrar los datos:

```bash
docker compose down
```

Si necesita reiniciar las bases desde cero (esto **borra** los datos y vuelve a ejecutar los scripts):

```bash
docker compose down -v
docker compose up -d
```

## Solución de problemas

- **La aplicación responde “No se pudo conectar con la base de datos de la institución”:** verifique que el motor correspondiente esté levantado, que el puerto sea correcto y que los valores de `backend/.env` coincidan con los del Word donde se envió el enlace de este proyecto.
- **Error al iniciar sesión:** confirme que está usando el nombre de usuario exacto y la contraseña indicada en el Word. Los usuarios demo se cargan en memoria al iniciar el servidor.
- **El puerto `3000` está ocupado:** cierre el proceso que lo esté usando o cambie `PORT` en `backend/.env`.
- **Los puertos `5432` o `3306` están ocupados:** detenga el PostgreSQL o MySQL local que ya esté corriendo, o cambie los puertos en `docker-compose.yml` y en `backend/.env`.
- **Firebase indica que no encuentra la cuenta de servicio:** confirme que el archivo se llame `backend/firebase-service-account.json` y que `npm start` se ejecute desde `backend`.
- **MongoDB no conecta:** verifique que el servicio local esté activo y que la cadena de conexión del Word coincida con la de `backend/.env`.
- **Cambié un script SQL y Docker no lo aplica:** los scripts de inicialización solo se ejecutan la primera vez que se crea el volumen. Use `docker compose down -v` y vuelva a levantar con `docker compose up -d`.

## Operaciones

Las mismas reglas se aplican en los 4 motores:

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

- **Camas disponibles:** consulta de camas libres por tipo (General, UCI, Aislamiento) y habitación.
- **Facturación y seguros** (solo rol administrativo): registro de facturas por paciente, filtro por fechas,
  cambio de estado a pagada y administración del seguro médico (aseguradora, póliza y cobertura). El nombre del
  paciente se muestra mediante JOIN; no se duplica en la factura.

## Cómo cambiar de motor una institución

Solo se edita `backend/src/infrastructure/repositoryFactory.js`; el dominio, la API y la interfaz no cambian.

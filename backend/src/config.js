require('dotenv').config();
const e = process.env;
module.exports = {
  port: +e.PORT || 3000,
  jwtSecret: e.JWT_SECRET || 'dev-secret',
  postgres: { url: e.PG_URL || 'postgresql://postgres:postgres@localhost:5432/hospital_general' },
  mysql: {
    host: e.MYSQL_HOST || 'localhost', port: +e.MYSQL_PORT || 3306,
    user: e.MYSQL_USER || 'root', password: e.MYSQL_PASSWORD || 'root',
    database: e.MYSQL_DATABASE || 'centro_pediatrico'
  },
  mongo: { uri: e.MONGO_URI || 'mongodb://localhost:27017', db: e.MONGO_DB || 'laboratorio_clinico' },
  firebase: {
    serviceAccount: e.FIREBASE_SERVICE_ACCOUNT || '', projectId: e.FIREBASE_PROJECT_ID || 'clinica-odontologica'
  }
};

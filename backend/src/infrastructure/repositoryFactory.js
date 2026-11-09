// Enrutamiento por institución: ÚNICO lugar donde se conoce qué motor usa cada institución.
const cfg = require('../config');
const { METODOS } = require('../domain/ports');

const FABRICAS = {
  hospital:    () => new (require('../adapters/postgres/PostgresRepository'))(cfg.postgres),
  pediatrico:  () => new (require('../adapters/mysql/MySqlRepository'))(cfg.mysql),
  laboratorio: () => new (require('../adapters/mongo/MongoRepository'))(cfg.mongo),
  clinica:     () => new (require('../adapters/firebase/FirestoreRepository'))(cfg.firebase)
};
const cache = {};

function repositorioDe(institucion) {
  if (!FABRICAS[institucion]) throw new Error(`Institución desconocida: ${institucion}`);
  if (!cache[institucion]) {
    const repo = FABRICAS[institucion]();
    for (const m of METODOS) if (typeof repo[m] !== 'function') throw new Error(`El adaptador de ${institucion} no implementa ${m}`);
    cache[institucion] = repo;
  }
  return cache[institucion];
}
module.exports = { repositorioDe };

// Laboratorio clínico · MongoDB (Compass / mongosh)
// Uso:  mongosh "mongodb://localhost:27017" database/mongo_init.js
// Modelo documental (Entrega II):
//   pacientes      -> documento del paciente (datos estables)
//   profesionales  -> médicos remitentes / bioanalistas
//   consultas      -> órdenes/atenciones; EMBEBEN diagnósticos, medicamentos y tratamientos (acotados, se leen juntos)
//   resultados     -> REFERENCIADOS por pacienteId (cientos por paciente, estructura variable por examen)
const dbl = db.getSiblingDB("laboratorio_clinico");

dbl.createCollection("pacientes");
dbl.createCollection("profesionales");
dbl.createCollection("consultas", {
  validator: { $jsonSchema: {
    bsonType: "object",
    required: ["pacienteId", "profesionalId", "fecha", "motivo", "diagnosticos"],
    properties: {
      pacienteId: { bsonType: "objectId" },
      profesionalId: { bsonType: "objectId" },
      fecha: { bsonType: "date" },
      motivo: { bsonType: "string" },
      diagnosticos: { bsonType: "array" }
    }
  } }
});
dbl.createCollection("resultados", {
  validator: { $jsonSchema: {
    bsonType: "object",
    required: ["pacienteId", "examen", "fecha", "campos"],
    properties: {
      pacienteId: { bsonType: "objectId" },
      examen: { bsonType: "string" },
      fecha: { bsonType: "date" },
      campos: { bsonType: "object", description: "estructura variable según el tipo de examen" }
    }
  } }
});

dbl.pacientes.createIndex({ apellido: 1, nombre: 1 });
dbl.consultas.createIndex({ pacienteId: 1, fecha: -1 });
dbl.resultados.createIndex({ pacienteId: 1, fecha: -1 });
print("laboratorio_clinico listo");

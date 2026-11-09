// Usuarios de demostración. Cada usuario pertenece a UNA institución y tiene un rol.
// En producción esto vendría de un servicio de identidad; aquí basta para demostrar el enrutamiento por usuario.
const bcrypt = require('bcryptjs');
const instituciones = ['hospital', 'clinica', 'laboratorio', 'pediatrico'];
const PASSWORD = 'Clave123!';
const hash = bcrypt.hashSync(PASSWORD, 10);

const usuarios = [];
for (const i of instituciones) {
  usuarios.push({ usuario: `${i}.medico`, nombre: `Personal clínico (${i})`, institucion: i, rol: 'medico', hash });
  usuarios.push({ usuario: `${i}.admin`, nombre: `Administrativo (${i})`, institucion: i, rol: 'administrativo', hash });
}
module.exports = {
  PASSWORD,
  buscar: u => usuarios.find(x => x.usuario === u),
  verificar: (u, pass) => bcrypt.compareSync(pass, u.hash)
};

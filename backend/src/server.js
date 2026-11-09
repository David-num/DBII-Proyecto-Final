const app = require('./http/app');
const { port } = require('./config');
app.listen(port, () => console.log(`Servidor en http://localhost:${port}`));

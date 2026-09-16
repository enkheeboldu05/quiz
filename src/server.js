require('dotenv').config();
const app = require('./app');
const config = require('./config');

app.listen(config.port, () => {
  console.log(`Lecture Quiz is running at http://localhost:${config.port}`);
});

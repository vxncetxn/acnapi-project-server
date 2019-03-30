require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
var cors = require("cors");

const app = express();
app.use(cors());
// app.use(function(req, res, next) {
//   res.header("Access-Control-Allow-Origin", "*");
//   res.header(
//     "Access-Control-Allow-Headers",
//     "Origin, X-Requested-With, Content-Type, Accept"
//   );
//   next();
// });
app.use(bodyParser.json());

require("./routes/dialogflowRoutes")(app);

const PORT = process.env.PORT || 5000;
app.listen(PORT);

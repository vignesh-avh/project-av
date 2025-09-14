const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const predictController = require('./controllers/predictController');

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

app.post('/predict', upload.single('image'), predictController.handlePrediction);

module.exports = app;

const express = require('express');
const multer = require('multer');
const router = express.Router();
const { handlePrediction } = require('../controllers/predictController');

const upload = multer({ dest: 'uploads/' });
router.post('/', upload.single('image'), handlePrediction);

module.exports = router;

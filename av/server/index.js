const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');

const app = express();
const PORT = 8080;

// Middleware
app.use(cors());
app.use(express.json());

// File Upload Setup (multer)
const upload = multer({ dest: 'uploads/' });

// Replicate Token
const REPLICATE_TOKEN = "r8_To54pIymvGjFsHaMVkNBtQANyAvbZcr02aY7Z";
const REPLICATE_VERSION = "67657606c2c09eb8d8c08bf85934caa69666f15e2a67b27805ee62c192cddcb3";

// POST /predict
app.post('/predict', upload.single('image'), async (req, res) => {
  try {
    const imageFile = req.file;
    const imageBase64 = fs.readFileSync(imageFile.path, { encoding: 'base64' });

    const response = await axios.post(
      'https://api.replicate.com/v1/predictions',
      {
        version: REPLICATE_VERSION,
        input: {
          image: `data:image/jpeg;base64,${imageBase64}`
        }
      },
      {
        headers: {
          Authorization: `Token ${REPLICATE_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Cleanup uploaded file
    fs.unlinkSync(imageFile.path);

    res.json({ result: response.data?.output || 'No result' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Prediction failed' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

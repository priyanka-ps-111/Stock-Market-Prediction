
const { PythonShell } = require('python-shell');
const express = require('express');
const app = express();
const path = require('path');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const ejs = require('ejs');
app.use(express.static(__dirname));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
const stringify = require('csv-stringify');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const csvWriter = require('csv-write-stream');
let uploadedCsvFilePath = '';
let editedCsvFilePath = ''; // Declare the global variable for edited CSV file path

// app.use((req, res, next) => {
//   res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000'); // Replace with the URL of your React development server
//   res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
//   res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
//   next();
// });

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'PAM.html'));
});

const bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});
const upload = multer({ storage });

app.post('/train', (req, res) => {
  const uploadDir = path.join(__dirname, 'uploads');

  fs.readdir(uploadDir, (err, files) => {
    if (err) {
      console.error('Error reading directory:', err);
      return res.status(500).send('Error reading directory');
    }

    const csvFiles = files.filter((file) => file.endsWith('.csv'));

    if (csvFiles.length === 0) {
      return res.status(400).send('No CSV files uploaded');
    }

    csvFiles.sort((a, b) => {
      const filePathA = path.join(uploadDir, a);
      const filePathB = path.join(uploadDir, b);
      const statsA = fs.statSync(filePathA);
      const statsB = fs.statSync(filePathB);
      return statsB.mtime.getTime() - statsA.mtime.getTime();
    });

    const csvFilePath = path.join(uploadDir, csvFiles[0]);
    const templateFilePath = path.join(__dirname, 'Train.ejs');

    fs.access(templateFilePath, fs.constants.F_OK, (err) => {
      if (err) {
        console.error('Template file does not exist:', err);
        return res.status(500).send('Error rendering template');
      }

      ejs.renderFile(templateFilePath, { csvFilePath }, (err, html) => {
        if (err) {
          console.error('Error rendering template:', err);
          return res.status(500).send('Error rendering template');
        }

        res.send(html);
      });
    });
  });
});

app.post('/result', (req, res) => {
  const uploadDir = path.join(__dirname, 'uploads');

  fs.readdir(uploadDir, (err, files) => {
    if (err) {
      console.error('Error reading directory:', err);
      return res.status(500).send('Error reading directory');
    }

    const csvFiles = files.filter((file) => file.endsWith('.csv'));

    if (csvFiles.length === 0) {
      return res.status(400).send('No CSV files uploaded');
    }

    csvFiles.sort((a, b) => {
      const filePathA = path.join(uploadDir, a);
      const filePathB = path.join(uploadDir, b);
      const statsA = fs.statSync(filePathA);
      const statsB = fs.statSync(filePathB);
      return statsB.mtime.getTime() - statsA.mtime.getTime();
    });

    const csvFilePath = path.join(uploadDir, csvFiles[0]);
    const templateFilePath = path.join(__dirname, 'Result.ejs');

    fs.access(templateFilePath, fs.constants.F_OK, (err) => {
      if (err) {
        console.error('Template file does not exist:', err);
        return res.status(500).send('Error rendering template');
      }

      ejs.renderFile(templateFilePath, { csvFilePath }, (err, html) => {
        if (err) {
          console.error('Error rendering template:', err);
          return res.status(500).send('Error rendering template');
        }

        res.send(html);
      });
    });
  });
});

app.post('/upload-csv', upload.single('csvFile'), (req, res) => {
  try {
    if (!req.file) {
      res.status(400).send('No file uploaded');
      return;
    }

    const file = req.file;
    console.log('Uploaded file:', file);
    uploadedCsvFilePath = file.path;
    const results = [];
    fs.createReadStream(uploadedCsvFilePath)
      .pipe(csv())
      .on('data', (row) => {
        results.push(row);
      })
      .on('end', () => {
        res.json(results);
      });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).send('Error uploading file');
  }
});

app.post('/trainModels', (req, res) => {
  const csvFilePath = uploadedCsvFilePath;
  const selectedModels = req.body.models.split(',');

  const runModel = (modelName, callback) => {
    const options = {
      mode: 'text',
      pythonOptions: ['-u'],
      scriptPath: path.join(__dirname, 'Train'),
      args: [csvFilePath],
    };

    PythonShell.run(`${modelName}.py`, options)
      .then(() => {
        callback();
      })
      .catch((err) => {
        console.error(err);
        callback(err);
      });
  };

  const processNextModel = (index) => {
    if (index >= selectedModels.length) {
      console.log('Finished training all models');
      return;
    }

    const modelName = selectedModels[index];
    console.log('modelName:', modelName); 
    runModel(modelName, (err) => {
      if (err) {
        res.status(500).send(`Error running ${modelName}`);
      } else {
        console.log(csvFilePath);
        processNextModel(index + 1);
      }
    });
  };
  processNextModel(0);
});

app.post('/testModels', (req, res) => {
  const csvFilePath = uploadedCsvFilePath;
  const selectedModels = Array.isArray(req.body.models)?req.body.models : [req.body.models];

  const runModel = (modelName) => {
    return new Promise((resolve, reject) => {
      const options = {
        mode: 'text',
        pythonOptions: ['-u'],
        scriptPath: path.join(__dirname, 'Test'),
        args: [csvFilePath],
      };
  
      PythonShell.run(`${modelName}.py`, options)
        .then((results) => {
          const x = results.length;            
          const rmse = parseFloat(results[x - 3]);
          const r2error = parseFloat(results[x - 2]);
          const Accuracy = parseFloat(results[x - 1]);
          console.log('Mean Squared Error:', rmse);
          console.log('R-squared Score:', r2error);
          console.log('Accuracy', Accuracy);
          resolve({ modelName, rmse, r2error, Accuracy });
        })
        .catch((err) => {
          console.error(err);
          reject(`Error running ${modelName}`);
        });
    });
  };
  
  const processNextModel = (index, selectedModels, modelResults) => {
    if (index >= selectedModels.length) {
      const resultObject = {};
      for (const result of modelResults) {
        resultObject[result.modelName] = {
          rmse: result.rmse,
          r2error: result.r2error,
          Accuracy: result.Accuracy
        };
      }
      const jsonResponse = JSON.stringify(resultObject, null, 2);
      res.status(200).type('json').send(jsonResponse);
      return;
    }
  
    const modelName = selectedModels[index];
    console.log('modelName:', modelName);
  
    runModel(modelName)
      .then((result) => {
        modelResults.push(result);
        processNextModel(index + 1, selectedModels, modelResults);
      })
      .catch((err) => {
        res.status(500).send(err);
      });
  };
  
  processNextModel(0, selectedModels, []);
  
  
});

app.post('/executeModels', (req, res) => {
  const csvFilePath = uploadedCsvFilePath;
  const selectedModels = req.body.models.split(',');

  const runModel = (modelName) => {
    return new Promise((resolve, reject) => {
      const options = {
        mode: 'text',
        pythonOptions: ['-u'],
        scriptPath: path.join(__dirname, 'Execute'),
        args: [csvFilePath],
      };
  
      PythonShell.run(`${modelName}.py`, options)
        .then((results) => {
          const x = results.length;
          const rmse = parseFloat(results[x - 1]);
          const r2error = parseFloat(results[x - 2]);
          console.log('Mean Squared Error:', rmse);
          console.log('R-squared Score:', r2error);
          resolve({ modelName, rmse, r2error });
        })
        .catch((err) => {
          console.error(err);
          reject(`Error running ${modelName}`);
        });
    });
  };
  
  const processNextModel = (index, selectedModels, modelResults) => {
    if (index >= selectedModels.length) {
      const resultObject = {};
      for (const result of modelResults) {
        resultObject[result.modelName] = {
          rmse: result.rmse,
          r2error: result.r2error,
        };
      }
      const jsonResponse = JSON.stringify(resultObject, null, 2);
      res.status(200).type('json').send(jsonResponse);
      return;
    }
  
    const modelName = selectedModels[index];
    console.log('modelName:', modelName);
  
    runModel(modelName)
      .then((result) => {
        modelResults.push(result);
        processNextModel(index + 1, selectedModels, modelResults);
      })
      .catch((err) => {
        res.status(500).send(err);
      });
  };
  
  processNextModel(0, selectedModels, []);
  
  
});

const port = process.env.REACT_APP_SERVER_PORT || 3333;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});




const http = require('http');

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/execute',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log('Status Code:', res.statusCode);
    console.log('Response Body:', data);
  });
});

req.on('error', (error) => {
  console.error(error);
});

// Using a non-existent assignmentId (MongoDB will likely return 404 or 500 if not a valid ObjectId).
// Let's use a dummy ObjectId format for it.
req.write(JSON.stringify({
  code: 'SELT * FROM invalid_table;',
  assignmentId: '5f9f1b9b9c9d440000000000'
}));
req.end();

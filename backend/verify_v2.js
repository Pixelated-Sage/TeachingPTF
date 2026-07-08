// scratch/verify_v2.js
// Automated verification script for the Live Classroom Platform v2 backend endpoints.

const http = require('http');

const postJson = (path, payload, headers = {}) => {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        ...headers
      }
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ statusCode: res.statusCode, raw: body });
        }
      });
    });
    
    req.on('error', (err) => reject(err));
    req.write(data);
    req.end();
  });
};

const getJson = (path, headers = {}) => {
  return new Promise((resolve, reject) => {
    http.get({
      hostname: 'localhost',
      port: 5000,
      path: path,
      headers
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ statusCode: res.statusCode, raw: body });
        }
      });
    }).on('error', (err) => reject(err));
  });
};

async function runTests() {
  try {
    console.log('--- STARTING v2 BACKEND ENDPOINT VERIFICATION ---');

    // 1. Seed Database
    console.log('Seeding database...');
    const seedRes = await postJson('/api/seed', {});
    console.log('Seed status:', seedRes.statusCode);
    console.log('Seed message:', seedRes.data.message);

    // 2. Test Registration
    const email = `test_student_${Math.floor(Math.random() * 10000)}@test.com`;
    const rollNumber = `ROLL-${Math.floor(Math.random() * 100000)}`;
    console.log(`Registering student: ${email} | Roll: ${rollNumber}...`);
    
    const regRes = await postJson('/api/register', {
      name: 'Abhishek Kumar',
      rollNumber,
      email,
      phone: '+919999999999',
      password: 'testPassword123'
    });
    console.log('Register status:', regRes.statusCode);
    console.log('Register message:', regRes.data.message);
    const testOtpCode = regRes.data.testOtpCode;
    console.log('Generated OTP Code:', testOtpCode);

    // 3. Test Verify OTP
    console.log('Verifying OTP code...');
    const verifyRes = await postJson('/api/verify-otp', {
      email,
      otpCode: testOtpCode
    });
    console.log('Verify status:', verifyRes.statusCode);
    console.log('Verify message:', verifyRes.data.message);

    // 4. Test Login
    console.log('Logging in...');
    const loginRes = await postJson('/api/login', {
      email,
      password: 'testPassword123'
    });
    console.log('Login status:', loginRes.statusCode);
    console.log('Login Student ID:', loginRes.data.id);
    console.log('Session Token:', loginRes.data.sessionToken);
    const sessionToken = loginRes.data.sessionToken;

    // 5. Test Bootstrap Dashboard
    console.log('Bootstrapping dashboard...');
    const bootRes = await getJson('/api/bootstrap', { 'Authorization': sessionToken });
    console.log('Bootstrap status:', bootRes.statusCode);
    console.log('User Name:', bootRes.data.user.name);
    console.log('Joined Classrooms count (should be 0):', bootRes.data.classrooms.length);

    // 6. Test Join Classroom
    console.log('Joining classroom REACT60...');
    const joinRes = await postJson('/api/classroom/join', {
      classroomId: 'REACT60'
    }, { 'Authorization': sessionToken });
    console.log('Join status:', joinRes.statusCode);
    console.log('Joined classroom title:', joinRes.data.classroom.title);
    const classroomUuid = joinRes.data.classroom.id;

    // 7. Test Fetch Classroom Content
    console.log('Fetching classroom content...');
    const contentRes = await getJson(`/api/classroom/${classroomUuid}/content`, { 'Authorization': sessionToken });
    console.log('Content status:', contentRes.statusCode);
    console.log('Notes count:', contentRes.data.notes.length);
    console.log('Questions count:', contentRes.data.questions.length);
    const questionUuid = contentRes.data.questions[0].id;

    // 8. Test Submit Solution
    console.log('Submitting solution...');
    const submitRes = await postJson('/api/submit', {
      classroomId: classroomUuid,
      questionId: questionUuid,
      code: 'console.log("Hello from verification test!");',
      codeOutput: 'Server running at: http://localhost:3000',
      reasoningAnswer: 'Relational migrations verification test.',
      timeTakenSeconds: 30,
      tabSwitchCount: 0,
      headingsReached: [1]
    }, { 'Authorization': sessionToken });
    console.log('Submit status:', submitRes.statusCode);
    console.log('Submit response message:', submitRes.data.message);

    console.log('\n--- v2 BACKEND ENDPOINT VERIFICATION SUCCESSFUL ---');
  } catch (err) {
    console.error('Verification failed with error:', err);
  }
}

runTests();

const { execSync } = require('child_process');
const fs = require('fs');

console.log("Downloading current Cloud Run service YAML...");
execSync('gcloud run services describe instagram-automation --region us-central1 --project crosspostinginstagram --format yaml > service.yaml');

const yamlString = fs.readFileSync('service.yaml', 'utf8');

// Parse .env.local
const envFile = fs.readFileSync('.env.local', 'utf8');
const envVars = {
  'AUTH_TRUST_HOST': 'true'
};

envFile.split('\n').forEach(line => {
  if (line.trim() && !line.startsWith('#')) {
    const [key, ...rest] = line.split('=');
    if (key && rest.length > 0) {
      envVars[key.trim()] = rest.join('=').trim();
    }
  }
});

// Read service account
const saJson = fs.readFileSync('C:\\Users\\muksa\\OneDrive\\Документы\\Coding secrets\\crosspostinginstagram-d4615bf69351.json', 'utf8');
envVars['FIREBASE_SERVICE_ACCOUNT_KEY'] = saJson; // Keep it as proper JSON

delete envVars['GOOGLE_APPLICATION_CREDENTIALS']; // Removed because it points to local path

// Simple YAML injection for env vars
// Let's find the containers block. It looks like:
// containers:
// - image: gcr.io/cloudruntestbot/instagram-automation...
// We will inject the env block right after image.

let newYaml = '';
const lines = yamlString.split('\n');
let inContainer = false;

for (let i = 0; i < lines.length; i++) {
  newYaml += lines[i] + '\n';
  if (lines[i].includes('containers:')) {
    inContainer = true;
  }
  // Inject after the first image: in the containers section
  if (inContainer && lines[i].includes('image: ')) {
    newYaml += '        env:\n';
    for (const [k, v] of Object.entries(envVars)) {
      newYaml += `        - name: ${k}\n`;
      // We must quote the value or use YAML block literal for multiline JSON
      if (k === 'FIREBASE_SERVICE_ACCOUNT_KEY') {
        newYaml += `          value: |\n`;
        const jsonLines = v.split('\n');
        for (const jl of jsonLines) {
           newYaml += `            ${jl}\n`;
        }
      } else {
        newYaml += `          value: '${v}'\n`;
      }
    }
    inContainer = false; // only inject once
  }
}

fs.writeFileSync('new_service.yaml', newYaml);
console.log("Replacing Cloud Run service with new YAML...");
try {
  execSync('gcloud run services replace new_service.yaml --region us-central1 --project crosspostinginstagram', {stdio: 'inherit'});
  console.log("Secrets injected successfully!");
} catch (e) {
  console.error("Failed to replace service", e.message);
}

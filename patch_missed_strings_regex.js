const fs = require('fs');
const path = require('path');

const dashPath = path.join(__dirname, 'src', 'components', 'Dashboard.tsx');
let source = fs.readFileSync(dashPath, 'utf8');

// Use RegEx to be immune to weird spacing/newlines
source = source.replace(
  /<Instagram className="h-5 w-5 text-pink-600" \/>\s*Source Post/g,
  '<Instagram className="h-5 w-5 text-pink-600" />\n                    {t(\'dashboard\', \'sourcePost\')}'
);

source = source.replace(
  /\{loading \? <RefreshCw className="mr-2 h-4 w-4 animate-spin inline" \/> : "Fetch Latest"\}/g,
  '{loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin inline" /> : t(\'dashboard\', \'fetchLatest\')}'
);

source = source.replace(
  /<Save className="w-3\.5 h-3\.5" \/>\s*Сохранить/g,
  '<Save className="w-3.5 h-3.5" />\n                      {t(\'dashboard\', \'pinterestLink.save\')}'
);

source = source.replace(
  /<Send className="h-4 w-4" \/>\s*Publish All/g,
  '<Send className="h-4 w-4" />\n                      {t(\'dashboard\', \'socialNetworks.publishAll\')}'
);

fs.writeFileSync(dashPath, source, 'utf8');
console.log('Successfully patched Dashboard.tsx with Regex');

const fs = require('fs');
const path = require('path');

const dashPath = path.join(__dirname, 'src', 'components', 'Dashboard.tsx');
let source = fs.readFileSync(dashPath, 'utf8');

// Use RegEx to be immune to weird spacing/newlines
source = source.replace(
  /<Trash2 className="w-4 h-4" \/>\s*Удалить соцсеть/g,
  `<Trash2 className="w-4 h-4" />\n                                    {t('dashboard', 'networkCard.deleteNetwork')}`
);

source = source.replace(
  /<p className="text-green-600 text-xs mt-1 font-medium bg-green-50 p-2 rounded border border-green-100">Успешно опубликовано!<\/p>/g,
  `<p className="text-green-600 text-xs mt-1 font-medium bg-green-50 p-2 rounded border border-green-100">{t('dashboard', 'networkCard.success')}</p>`
);

source = source.replace(
  /type="datetime-local"/g,
  `type="datetime-local"\n                        lang={language === 'ru' ? 'ru-RU' : 'en-US'}`
);

fs.writeFileSync(dashPath, source, 'utf8');
console.log('Successfully patched Dashboard.tsx with Regex 2');

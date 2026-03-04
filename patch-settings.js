const fs = require('fs');
const path = require('path');

// 1. Update translations.ts
const transPath = path.join(__dirname, 'src', 'i18n', 'translations.ts');
let trans = fs.readFileSync(transPath, 'utf8');

const enSettingsFields = `
        mainPromptDesc: "This instruction will be sent to the neural network BEFORE the platform-specific instruction.",
        fields: {
          OPENAI_MODEL: { label: "OpenAI Model" },
          OPENAI_API_KEY: { label: "OpenAI API Key", placeholder: "sk-proj-..." },
          RAPIDAPI_KEY: { label: "RapidAPI Key (Instagram Data)", placeholder: "..." },
          POSTMYPOST_TOKEN: { label: "PostMyPost Token (Bearer Auth)", placeholder: "..." },
          POSTMYPOST_PROJECT_ID: { label: "PostMyPost Project ID", placeholder: "331831" },
          INSTAGRAM_URL: { label: "Source Instagram Account URL", placeholder: "https://instagram.com/username" },
          CLOUDINARY_CLOUD_NAME: { label: "Cloudinary Cloud Name", placeholder: "your_cloud_name" },
          CLOUDINARY_API_KEY: { label: "Cloudinary API Key", placeholder: "..." },
          CLOUDINARY_API_SECRET: { label: "Cloudinary API Secret", placeholder: "..." },
          CLOUDINARY_REG_DATE: { label: "Cloudinary Registration Date (YYYY-MM-DD)", placeholder: "2025-12-22" }
        },
        models: {
          "gpt-5.2": "gpt-5.2 (Recommended)",
          "gpt-5.2-thinking": "gpt-5.2 thinking (Deep analysis)",
          "gpt-5": "gpt-5 (Fast)",
          "gpt-5-mini": "gpt-5 mini (Cheap)",
          "gpt-5-nano": "gpt-5 nano (Cheapest)"
        },
        mainPromptLabel: "Main Prompt",
        mainPromptPlaceholder: "Marketer instruction..."`;

const ruSettingsFields = `
        mainPromptDesc: "Эта инструкция будет отправляться нейросети ПЕРЕД инструкцией конкретной платформы.",
        fields: {
          OPENAI_MODEL: { label: "Модель OpenAI" },
          OPENAI_API_KEY: { label: "OpenAI API Ключ", placeholder: "sk-proj-..." },
          RAPIDAPI_KEY: { label: "RapidAPI Ключ (Instagram Data)", placeholder: "..." },
          POSTMYPOST_TOKEN: { label: "PostMyPost Токен (Bearer Auth)", placeholder: "..." },
          POSTMYPOST_PROJECT_ID: { label: "PostMyPost ID Проекта", placeholder: "331831" },
          INSTAGRAM_URL: { label: "Ссылка на Instagram аккаунт источник", placeholder: "https://instagram.com/username" },
          CLOUDINARY_CLOUD_NAME: { label: "Cloudinary Cloud Name", placeholder: "your_cloud_name" },
          CLOUDINARY_API_KEY: { label: "Cloudinary API Ключ", placeholder: "..." },
          CLOUDINARY_API_SECRET: { label: "Cloudinary API Секрет", placeholder: "..." },
          CLOUDINARY_REG_DATE: { label: "Cloudinary дата регистрации (ГГГГ-ММ-ДД)", placeholder: "2025-12-22" }
        },
        models: {
          "gpt-5.2": "gpt-5.2 (Рекомендуется)",
          "gpt-5.2-thinking": "gpt-5.2 thinking (Глубокий анализ)",
          "gpt-5": "gpt-5 (Быстрый)",
          "gpt-5-mini": "gpt-5 mini (Дешевый)",
          "gpt-5-nano": "gpt-5 nano (Самый дешевый)"
        },
        mainPromptLabel: "Основной Промпт (Main Prompt)",
        mainPromptPlaceholder: "Инструкция маркетолога..."`;

trans = trans.replace('mainPromptDesc: "This instruction will be sent to the neural network BEFORE the platform-specific instruction."', enSettingsFields);
trans = trans.replace('mainPromptDesc: "Эта инструкция будет отправляться нейросети ПЕРЕД инструкцией конкретной платформы."', ruSettingsFields);

fs.writeFileSync(transPath, trans, 'utf8');
console.log('Updated translations.ts');


// 2. Update Dashboard.tsx
const dashboardPath = path.join(__dirname, 'src', 'components', 'Dashboard.tsx');
let dash = fs.readFileSync(dashboardPath, 'utf8');

dash = dash.replace(
  '<label className="text-sm font-medium">{field.label}</label>',
  '<label className="text-sm font-medium">{t(\'dashboard\', `settingsText.fields.${field.id}.label`)}</label>'
);

dash = dash.replace(
  'placeholder={field.placeholder}',
  'placeholder={t(\'dashboard\', `settingsText.fields.${field.id}.placeholder`) || field.placeholder}'
);

dash = dash.replace('<option value="gpt-5.2">gpt-5.2 (Рекомендуется)</option>', '<option value="gpt-5.2">{t(\'dashboard\', \'settingsText.models.gpt-5.2\')}</option>');
dash = dash.replace('<option value="gpt-5.2-thinking">gpt-5.2 thinking (Глубокий анализ)</option>', '<option value="gpt-5.2-thinking">{t(\'dashboard\', \'settingsText.models.gpt-5.2-thinking\')}</option>');
dash = dash.replace('<option value="gpt-5">gpt-5 (Быстрый)</option>', '<option value="gpt-5">{t(\'dashboard\', \'settingsText.models.gpt-5\')}</option>');
dash = dash.replace('<option value="gpt-5-mini">gpt-5 mini (Дешевый)</option>', '<option value="gpt-5-mini">{t(\'dashboard\', \'settingsText.models.gpt-5-mini\')}</option>');
dash = dash.replace('<option value="gpt-5-nano">gpt-5 nano (Самый дешевый)</option>', '<option value="gpt-5-nano">{t(\'dashboard\', \'settingsText.models.gpt-5-nano\')}</option>');

dash = dash.replace('<label className="text-sm font-medium">Основной Промпт (Main Prompt)</label>', '<label className="text-sm font-medium">{t(\'dashboard\', \'settingsText.mainPromptLabel\')}</label>');
dash = dash.replace('placeholder="Инструкция маркетолога..."', 'placeholder={t(\'dashboard\', \'settingsText.mainPromptPlaceholder\')}');

fs.writeFileSync(dashboardPath, dash, 'utf8');
console.log('Updated Dashboard.tsx');

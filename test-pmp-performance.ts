
import fs from 'fs';
import { uploadMediaUrlsToPostMyPost } from './src/lib/postmypost';

/**
 * РУКОВОДСТВО ПО ЗАПУСКУ:
 * 1. Убедитесь, что у вас есть файл .env.local в корне проекта с переменной POSTMYPOST_TOKEN.
 * 2. Запустите тест командой:
 *    node --experimental-strip-types test-pmp-performance.ts
 */

async function runTest() {
  console.log('--- Настройка теста производительности PostMyPost ---');

  // 1. Пытаемся прочитать токен из .env.local
  let token = process.env.POSTMYPOST_TOKEN;
  if (!token && fs.existsSync('.env.local')) {
    const envContent = fs.readFileSync('.env.local', 'utf-8');
    const match = envContent.match(/POSTMYPOST_TOKEN=["']?([^"'\n]+)["']?/);
    if (match) token = match[1];
  }

  if (!token) {
    console.error('❌ ОШИБКА: POSTMYPOST_TOKEN не найден в .env.local или переменных окружения.');
    process.exit(1);
  }

  // 2. Используем указанный проект
  const projectId = 333024;
  const mediaUrls = [
    'https://picsum.photos/seed/1/800/600',
    'https://picsum.photos/seed/2/800/600',
    'https://picsum.photos/seed/3/800/600'
  ];

  console.log(`🚀 Начинаем параллельную загрузку ${mediaUrls.length} файлов...`);
  const start = Date.now();

  try {
    const fileIds = await uploadMediaUrlsToPostMyPost(mediaUrls, token, projectId);
    const duration = Date.now() - start;

    console.log('\n✅ ТЕСТ ЗАВЕРШЕН УСПЕШНО');
    console.log(`⏱️ Общее время: ${(duration / 1000).toFixed(2)} сек.`);
    console.log(`🆔 Полученные File IDs: ${fileIds.join(', ')}`);
    console.log('\nПримечание: При последовательной загрузке время было бы примерно в 3 раза больше,');
    console.log('так как каждый файл требует ~4-6 секунд на инициализацию, загрузку и ожидание статуса.');

  } catch (error: any) {
    console.error('\n❌ ОШИБКА ПРИ ТЕСТИРОВАНИИ:');
    console.error(error.message);
  }
}

runTest();

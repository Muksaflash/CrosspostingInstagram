"use client";

import { useLanguage } from "@/components/LanguageProvider";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function PageHeader({ userName }: { userName: string | null | undefined }) {
  const { language, setLanguage, t } = useLanguage();

  return (
    <header className="mb-8 flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('page', 'title')}</h1>
        <p className="text-gray-500 dark:text-gray-400">{t('page', 'welcome')}, {userName}</p>
      </div>
      <div className="flex items-center gap-4">
        <ThemeToggle />
        <div className="flex bg-gray-200 dark:bg-gray-800 p-1 py-1 px-1 rounded-lg">
          <button
            onClick={() => setLanguage('ru')}
            className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${language === 'ru' ? 'bg-white dark:bg-gray-700 shadow-sm text-black dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
          >
            RU
          </button>
          <button
            onClick={() => setLanguage('en')}
            className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${language === 'en' ? 'bg-white dark:bg-gray-700 shadow-sm text-black dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
          >
            EN
          </button>
        </div>
      </div>
    </header>
  );
}

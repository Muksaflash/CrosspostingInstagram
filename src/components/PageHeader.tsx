"use client";

import { useLanguage } from "@/components/LanguageProvider";

export default function PageHeader({ userName }: { userName: string | null | undefined }) {
  const { language, setLanguage, t } = useLanguage();

  return (
    <header className="mb-8 flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">{t('page', 'title')}</h1>
        <p className="text-gray-500">{t('page', 'welcome')}, {userName}</p>
      </div>
      <div className="flex bg-gray-200 p-1 py-1 px-1 rounded-lg">
        <button
          onClick={() => setLanguage('ru')}
          className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${language === 'ru' ? 'bg-white shadow-sm text-black' : 'text-gray-500 hover:text-gray-900'}`}
        >
          RU
        </button>
        <button
          onClick={() => setLanguage('en')}
          className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${language === 'en' ? 'bg-white shadow-sm text-black' : 'text-gray-500 hover:text-gray-900'}`}
        >
          EN
        </button>
      </div>
    </header>
  );
}

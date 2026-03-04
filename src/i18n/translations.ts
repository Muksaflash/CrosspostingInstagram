export type Language = 'en' | 'ru';

export const translations = {
  en: {
    dashboard: {
      limitsAndQuotas: "Limits and Quotas",
      requestsPerMonth: "Instagram requests per month",
      outOf: "out of",
      willUpdate: "Will update",
      noData: "No data",
      slideshowCredits: "Slideshow credits per month",
      plan: "Plan",
      creditsUsed: "Credits used",
      regDateNotSet: "Registration date not set in settings",
      tabs: {
        dashboard: "Dashboard",
        settings: "Settings"
      },
      logout: "Logout",
      settingsText: {
        title: "API Integrations",
        desc: "Configure your personal API keys for the automation to work.",
        save: "Save",
        savePrompt: "Save Prompt",
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
        mainPromptPlaceholder: "Marketer instruction..."
      },
      sourcePost: "Source Post",
      fetchLatest: "Fetch Latest",
      fetchByLink: "Fetch post by link",
      scheduleDate: "Publish time (leave empty to publish now)",
      postPreview: "Post preview",
      postTextPlaceholder: "Instagram post text...",
      adaptBtn: "Adapt for Networks",
      noPostLoaded: "No post loaded",
      postTypes: {
        image: "Image",
        video: "Video",
        carousel: "Carousel",
        carousel_mixed: "Carousel Mixed",
        carousel_video: "Carousel Video",
        carousel_image: "Carousel Image"
      },
      mediaCountOf: "of",
      autoPost: {
        title: "Automatic Publishing",
        desc: "Checks for new Instagram posts every hour and publishes to enabled networks."
      },
      pinterestLink: {
        title: "Link for Pinterest",
        save: "Save",
        desc: "This link will be added to all Pinterest pins (if the account doesn't have its own link)."
      },
      socialNetworks: {
        title: "Social Networks",
        addNetwork: "Add Network",
        publishAll: "Publish All"
      },
      networkCard: {
        rewrite: "Rewrite text",
        publish: "Publish",
        error: "Error",
        success: "Successfully published!",
        promptLabel: "System Prompt (AI Instruction)",
        promptPlaceholder: "Instruction for AI to rewrite the post...",
        titleLabel: "Title",
        titlePlaceholder: "Title for the post...",
        adaptedTextLabel: "Adapted Text",
        adaptedTextPlaceholder: "Rewritten text will appear here...",
        settings: "Settings",
        advancedSettings: "Advanced settings",
        deleteNetwork: "Delete network"
      },
      modals: {
        addNetworkTitle: "Connect Social Network",
        addNetworkDesc: "Select an account from your PostMyPost project to add to automation.",
        noAccounts: "No accounts found. Make sure your PostMyPost Token and Project ID are correct in Settings.",
        platform: "Platform",
        added: "Added",
        add: "Add",
        advSettingsTitle: "Publishing settings",
        contentFilter: "Content filter (Reels vs Images)",
        noFilter: "No filter (Publish all)",
        onlyReels: "Only Reels (Single videos)",
        excludeReels: "Exclude Reels (Photos / Carousels)",
        filterDesc: "Useful for separating Pinterest / VK accounts into Reels and Regular posts.",
        slideshowMode: "Slideshow Mode",
        slideshowAuto: "Auto (Depends on network)",
        slideshowAlways: "Always combine photos into video (Slideshow)",
        slideshowNever: "Never (Leave as carousel)",
        slideshowDesc: "Auto = Reddit/TikTok/Pinterest_reels are converted automatically, others as carousel.",
        pubType: "Publication Type",
        pubTypeNormal: "Normal post (1)",
        pubTypeShorts: "Shorts / Reels on YouTube/Rutube (4)",
        tiktokOptions: "TikTok specific options",
        tiktokPrivacy: "Privacy Status",
        pinterestPinLink: "PIN link (Pinterest)",
        pinterestPinLinkDesc: "Added as a link to Pinterest publication.",
        saveAndClose: "Save and close"
      }
    },
    page: {
      title: "Cross Post Inst",
      welcome: "Welcome",
    }
  },
  ru: {
    dashboard: {
      limitsAndQuotas: "Лимиты и Квоты",
      requestsPerMonth: "Запросов к Instagram за месячный период",
      outOf: "из",
      willUpdate: "Обновится",
      noData: "Нет данных",
      slideshowCredits: "Кредиты на слайдшоу за месячный период",
      plan: "План",
      creditsUsed: "Кредитов израсходовано",
      regDateNotSet: "Дата регистрации не задана в настройках",
      tabs: {
        dashboard: "Дашборд",
        settings: "Настройки"
      },
      logout: "Выйти",
      settingsText: {
        title: "API Интеграции",
        desc: "Настройте персональные API ключи для работы автоматизации.",
        save: "Сохранить",
        savePrompt: "Сохранить Промпт",
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
        mainPromptPlaceholder: "Инструкция маркетолога..."
      },
      sourcePost: "Исходный пост",
      fetchLatest: "Получить последний",
      fetchByLink: "Получить пост по ссылке",
      scheduleDate: "Время публикации (оставьте пустым для публикации сейчас)",
      postPreview: "Превью поста",
      postTextPlaceholder: "Текст поста из Instagram...",
      adaptBtn: "Адаптировать для соцсетей",
      noPostLoaded: "Пост не загружен",
      postTypes: {
        image: "Изображение",
        video: "Видео",
        carousel: "Карусель",
        carousel_mixed: "Смешанная карусель",
        carousel_video: "Видео карусель",
        carousel_image: "Фото карусель"
      },
      mediaCountOf: "из",
      autoPost: {
        title: "Автоматическая выкладка",
        desc: "Каждый час проверяет новые посты в Instagram и публикует во включенные сети."
      },
      pinterestLink: {
        title: "Ссылка для Pinterest",
        save: "Сохранить",
        desc: "Эта ссылка будет добавлена ко всем пинам Pinterest (если у аккаунта нет своей ссылки)."
      },
      socialNetworks: {
        title: "Социальные сети",
        addNetwork: "Добавить соцсеть",
        publishAll: "Опубликовать всё"
      },
      networkCard: {
        rewrite: "Переписать текст",
        publish: "Опубликовать",
        error: "Ошибка",
        success: "Успешно опубликовано!",
        promptLabel: "Системный Промпт (Инструкция AI)",
        promptPlaceholder: "Инструкция для нейросети по переписыванию поста...",
        titleLabel: "Заголовок",
        titlePlaceholder: "Заголовок для поста...",
        adaptedTextLabel: "Адаптированный Текст",
        adaptedTextPlaceholder: "Здесь появится переписанный текст...",
        settings: "Настройки",
        advancedSettings: "Доп. настройки",
        deleteNetwork: "Удалить соцсеть"
      },
      modals: {
        addNetworkTitle: "Подключить соцсеть",
        addNetworkDesc: "Выберите аккаунт из вашего проекта PostMyPost для добавления в автоматизацию.",
        noAccounts: "Аккаунты не найдены. Убедитесь, что токен PostMyPost и ID проекта указаны верно в настройках.",
        platform: "Платформа",
        added: "Добавлено",
        add: "Добавить",
        advSettingsTitle: "Настройки публикации",
        contentFilter: "Фильтр контента (Reels vs Картинки)",
        noFilter: "Без фильтра (Публиковать всё)",
        onlyReels: "Только Reels (Одиночные видео)",
        excludeReels: "Исключать Reels (Фото / Карусели)",
        filterDesc: "Полезно для разделения аккаунтов Pinterest / VK на Reels и Обычные посты.",
        slideshowMode: "Режим Слайдшоу",
        slideshowAuto: "Авто (Зависит от соцсети)",
        slideshowAlways: "Всегда объединять фото в видео (Слайдшоу)",
        slideshowNever: "Никогда (Оставлять карусель)",
        slideshowDesc: "Авто = Reddit/TikTok/Pinterest_reels конвертируются автоматически, остальные — каруселью.",
        pubType: "Тип публикации (Publication Type)",
        pubTypeNormal: "Обычный пост (1)",
        pubTypeShorts: "Shorts / Reels на YouTube/Rutube (4)",
        tiktokOptions: "Специфичные опции TikTok",
        tiktokPrivacy: "Privacy Status",
        pinterestPinLink: "Ссылка для ПИНА (Pinterest)",
        pinterestPinLinkDesc: "Добавляется как link к публикации Pinterest.",
        saveAndClose: "Сохранить и закрыть"
      }
    },
    page: {
      title: "Cross Post Inst",
      welcome: "Добро пожаловать",
    }
  }
} as const;

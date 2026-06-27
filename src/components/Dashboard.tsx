"use client";

import { useState, useEffect, useRef } from "react";
import { Instagram, Wand2, Send, RefreshCw, Settings, Search, Key, Save, LogOut, Plus, X, Trash2, Zap, ImageOff } from "lucide-react";
import { saveSocialNetwork, saveUserSetting, setAutoPostEnabledSetting, getUserSettings, getQuotas } from "@/app/actions";
import { translations } from "@/i18n/translations";
import { defaultPrompts, PLATFORM_KEYS, type PlatformKey, detectPlatform } from "@/lib/prompts";
import { type SocialNetwork, type PublishingSettings } from "@/lib/types";
import { type InstagramPost } from "@/lib/instagram";
import Image from "next/image";
import { signOut } from "next-auth/react";
import { useLanguage } from "@/components/LanguageProvider";
import DatePicker, { registerLocale } from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { ru as ruLocale } from "date-fns/locale/ru";
import { enUS as enLocale } from "date-fns/locale/en-US";

registerLocale("ru", ruLocale);
registerLocale("en", enLocale);


function QuotaWidget({ quotas, fetchQuotas, loading }: any) {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);

  if (!quotas || (!quotas.instagram && !quotas.slideshow)) return null;

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm mb-6 border border-gray-100 dark:border-zinc-800 overflow-hidden">
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
      >
        <div className="flex items-center gap-4">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
            {t('dashboard', 'limitsAndQuotas')}
          </h2>
          {!isOpen && (
            <div className="flex gap-3 text-xs font-medium text-gray-500 dark:text-gray-400">
              {quotas.instagram && (
                <span className="bg-gray-100 dark:bg-zinc-800 px-2 py-1 rounded">
                  Insta: {quotas.instagram.limit - quotas.instagram.remaining} / {quotas.instagram.limit}
                </span>
              )}
              {quotas.slideshow && (
                <span className="bg-gray-100 dark:bg-zinc-800 px-2 py-1 rounded">
                  Slide: {quotas.slideshow.credits_usage} / {quotas.slideshow.credits_limit}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={(e) => { e.stopPropagation(); fetchQuotas(); }}
            disabled={loading}
            className="text-gray-400 hover:text-blue-600 disabled:opacity-50"
            title="Обновить квоты"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <div className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </div>
        </div>
      </div>

      {isOpen && (
        <div className="p-4 pt-0 border-t border-gray-100 dark:border-zinc-800">
          <div className="grid md:grid-cols-2 gap-4 mt-4">
            {/* Instagram */}
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-[#2D5A40] text-white px-4 py-2 font-medium text-sm">
                {t('dashboard', 'requestsPerMonth')}
              </div>
              <div className="p-4 space-y-1 text-sm bg-gray-50 dark:bg-zinc-800 min-h-[100px]">
                {quotas.instagram ? (
                  <>
                    <p className="text-gray-900 dark:text-gray-100">{quotas.instagram.limit - quotas.instagram.remaining} {t('dashboard', 'outOf')} {quotas.instagram.limit}</p>
                    {quotas.instagramRefreshDate && <p className="text-gray-600 dark:text-gray-400">{t('dashboard', 'willUpdate')} {quotas.instagramRefreshDate}</p>}
                  </>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400">{t('dashboard', 'noData')}</p>
                )}
              </div>
            </div>

            {/* Slideshow */}
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-[#2D5A40] text-white px-4 py-2 font-medium text-sm">
                {t('dashboard', 'slideshowCredits')}
              </div>
              <div className="p-4 space-y-1 text-sm bg-gray-50 dark:bg-zinc-800 min-h-[100px]">
                {quotas.slideshow ? (
                  <>
                    <p className="text-gray-900 dark:text-gray-100">{t('dashboard', 'plan')}: {quotas.slideshow.plan}</p>
                    <p className="text-gray-900 dark:text-gray-100">
                      {t('dashboard', 'creditsUsed')}: {quotas.slideshow.credits_limit > 0 ? Math.round((quotas.slideshow.credits_usage / quotas.slideshow.credits_limit) * 100) : 0}%
                      ({quotas.slideshow.credits_usage} {t('dashboard', 'outOf')} {quotas.slideshow.credits_limit})
                    </p>
                    {quotas.slideshowRefreshDate && <p className="text-gray-600 dark:text-gray-400">{t('dashboard', 'willUpdate')} {quotas.slideshowRefreshDate}</p>}
                    {!quotas.slideshowRefreshDate && <p className="text-gray-400 text-xs">{t('dashboard', 'regDateNotSet')}</p>}
                  </>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400">Нет данных</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard({ initialNetworks, initialPost }: { initialNetworks: any[]; initialPost?: any }) {
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'settings'>('dashboard');
  const [settingsTab, setSettingsTab] = useState<'general' | 'prompts'>('general');

  const [networks, setNetworks] = useState<SocialNetwork[]>(initialNetworks.length ? initialNetworks : [
    { name: 'Telegram', enabled: true, model: 'gpt-5.4', prompt: 'Перепиши текст для Telegram канала...' },
    { name: 'VK', enabled: true, model: 'gpt-5.4', prompt: 'Адаптируй для ВКонтакте...' },
    { name: 'Instagram', enabled: false, model: 'gpt-5.4', prompt: '...' }, // Usually disable adapt for source
  ]);
  
  const [post, setPost] = useState<InstagramPost | null>(initialPost || null);
  const [previewImageFailed, setPreviewImageFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [publishingAll, setPublishingAll] = useState(false);
  const [fetchLink, setFetchLink] = useState("");
  const [scheduleDate, setScheduleDate] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [autoPostEnabled, setAutoPostEnabled] = useState(false);
  const [autoPostEnabledSince, setAutoPostEnabledSince] = useState<string>("");
  const [autoPostSaving, setAutoPostSaving] = useState(false);
  const [pinterestLink, setPinterestLink] = useState<string>("");

  const [quotas, setQuotas] = useState<any>(null);
  const [quotaLoading, setQuotaLoading] = useState(false);

  const [apiKeys, setApiKeys] = useState({
    OPENAI_API_KEY: '',
    RAPIDAPI_KEY: '',
    POSTMYPOST_TOKEN: '',
    POSTMYPOST_PROJECT_ID: '',
    INSTAGRAM_URL: '',
    CLOUDINARY_CLOUD_NAME: '',
    CLOUDINARY_API_KEY: '',
    CLOUDINARY_API_SECRET: '',
    CLOUDINARY_REG_DATE: '',
    OPENAI_MODEL: 'gpt-5.4',
    MAIN_PROMPT: 'Ты маркетолог, который адаптирует тексты постов под разные соцсети. Если в посте есть ссылка на сайт курса то вставляй всегда эту...',
    CUSTOM_PROMPTS: '{}'
  });
  const [customPrompts, setCustomPrompts] = useState<Record<string, string>>({});
  const [keysLoading, setKeysLoading] = useState(false);

  // Modal specific state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [availableAccounts, setAvailableAccounts] = useState<any[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [expandedSettingsIdx, setExpandedSettingsIdx] = useState<number | null>(null);
  const [advancedSettingsIdx, setAdvancedSettingsIdx] = useState<number | null>(null);
  const [duplicateConfirm, setDuplicateConfirm] = useState<{ message: string } | null>(null);
  const duplicateConfirmResolver = useRef<((confirmed: boolean) => void) | null>(null);

  useEffect(() => {
    // Always load settings on mount to restore auto-post toggle state
    loadSettings();
  }, []);

  useEffect(() => {
    if (activeTab === 'settings') {
      loadSettings();
    } else if (activeTab === 'dashboard') {
      loadQuotas();
    }
  }, [activeTab]);

  useEffect(() => {
    setPreviewImageFailed(false);
  }, [post?.imageUrl]);

  const loadQuotas = async () => {
    setQuotaLoading(true);
    try {
      const q = await getQuotas();
      setQuotas(q);
    } catch (e) {
      console.error(e);
    }
    setQuotaLoading(false);
  };

  const loadSettings = async () => {
    setKeysLoading(true);
    const settings = await getUserSettings();
    if (settings) {
      setApiKeys({
        OPENAI_API_KEY: settings.OPENAI_API_KEY || '',
        RAPIDAPI_KEY: settings.RAPIDAPI_KEY || '',
        POSTMYPOST_TOKEN: settings.POSTMYPOST_TOKEN || '',
        POSTMYPOST_PROJECT_ID: settings.POSTMYPOST_PROJECT_ID || '',
        INSTAGRAM_URL: settings.INSTAGRAM_URL || '',
        CLOUDINARY_CLOUD_NAME: settings.CLOUDINARY_CLOUD_NAME || '',
        CLOUDINARY_API_KEY: settings.CLOUDINARY_API_KEY || '',
        CLOUDINARY_API_SECRET: settings.CLOUDINARY_API_SECRET || '',
        CLOUDINARY_REG_DATE: settings.CLOUDINARY_REG_DATE || '',
        OPENAI_MODEL: settings.OPENAI_MODEL || 'gpt-5.4',
        MAIN_PROMPT: settings.MAIN_PROMPT || 'Ты маркетолог, который адаптирует тексты постов под разные соцсети. Если в посте есть ссылка на сайт курса то вставляй всегда эту...',
        CUSTOM_PROMPTS: settings.CUSTOM_PROMPTS || '{}'
      });
      try {
        setCustomPrompts(JSON.parse(settings.CUSTOM_PROMPTS || '{}'));
      } catch (e) {
        setCustomPrompts({});
      }
      const autoEnabled = settings.AUTO_POST_ENABLED !== undefined && settings.AUTO_POST_ENABLED !== ''
        ? settings.AUTO_POST_ENABLED === 'true'
        : !!settings.AUTO_POST_ENABLED_AT;
      setAutoPostEnabled(autoEnabled);
      setAutoPostEnabledSince(settings.AUTO_POST_ENABLED_SINCE || settings.AUTO_POST_ENABLED_AT || settings.AUTO_POST_WATERMARK_AT || '');
      setPinterestLink(settings.PINTEREST_LINK || '');
    }
    setKeysLoading(false);
  };

  const handleSaveKey = async (key: string, value: string) => {
    await saveUserSetting(key, value);
  };

  const formatAutoPostDate = (value: string) => {
    const timestamp = Number(value);
    if (!timestamp) return "";

    try {
      return new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(timestamp));
    } catch {
      return new Date(timestamp).toLocaleString();
    }
  };

  const handleAutoPostToggle = async (checked: boolean) => {
    const previousEnabled = autoPostEnabled;
    const previousSince = autoPostEnabledSince;

    setAutoPostEnabled(checked);
    setAutoPostSaving(true);
    try {
      const result = await setAutoPostEnabledSetting(checked);
      setAutoPostEnabled(result.enabled);
      setAutoPostEnabledSince(result.enabledSince || '');
    } catch (e) {
      console.error(e);
      setAutoPostEnabled(previousEnabled);
      setAutoPostEnabledSince(previousSince);
      alert(t('dashboard', 'autoPost.saveError'));
    } finally {
      setAutoPostSaving(false);
    }
  };

  const handleSaveCustomPrompt = async (platform: PlatformKey, text: string) => {
    const newPrompts = { ...customPrompts, [platform]: text };
    setCustomPrompts(newPrompts);
    const jsonStr = JSON.stringify(newPrompts);
    setApiKeys({ ...apiKeys, CUSTOM_PROMPTS: jsonStr });
    await handleSaveKey('CUSTOM_PROMPTS', jsonStr);
  };

  const handleSuggestPrompt = (idx: number) => {
    const net = networks[idx];
    const platform = detectPlatform(net.name);
    if (!platform) {
      alert(t('dashboard', 'networkCard.suggestPromptError'));
      return;
    }

    // First check custom prompts, then fallback to system default
    const suggestedPrompt = customPrompts[platform] || defaultPrompts[language as 'en' | 'ru'][platform];

    if (net.prompt && net.prompt !== suggestedPrompt) {
      if (!window.confirm(t('dashboard', 'networkCard.suggestPromptConfirm'))) {
        return;
      }
    }

    const newNetworks = [...networks];
    newNetworks[idx].prompt = suggestedPrompt;
    setNetworks(newNetworks);
    saveSocialNetwork(net._docId || net.accountId || net.name, newNetworks[idx]);
    setExpandedSettingsIdx(null);
  };

  // Handler stubs - these would call Server Actions or API routes
  const handleFetchLatest = async () => {
    setLoading(true);
    try {
      const { fetchLatestPost } = await import("@/app/actions");
      const result = await fetchLatestPost();
      if (!result.ok) {
        alert(getFetchPostErrorMessage(result));
        return;
      }
      setPost(result.post);
    } catch (e: any) {
      console.error(e);
      alert(getFetchPostErrorMessage({ code: 'FETCH_POST_FAILED' }));
    } finally {
      setLoading(false);
    }
  };

  const handleFetchByLink = async () => {
    if (!fetchLink) return;
    setLoading(true);
    try {
      const { fetchLatestPost } = await import("@/app/actions");
      const result = await fetchLatestPost(fetchLink);
      if (!result.ok) {
        alert(getFetchPostErrorMessage(result));
        return;
      }
      setPost(result.post);
    } catch (e: any) {
      console.error(e);
      alert(getFetchPostErrorMessage({ code: 'FETCH_POST_FAILED' }));
    } finally {
      setLoading(false);
    }
  };
  
  const handleAdaptAll = async () => {
    if (!post?.caption) {
      alert("Нет исходного текста поста для переписывания.");
      return;
    }

    const newNetworks = [...networks];
    let isChanged = false;

    // Set all enabled networks to rewriting status
    for (let i = 0; i < newNetworks.length; i++) {
      const net = newNetworks[i];
      if (net.enabled && net.prompt) {
        newNetworks[i].status = 'rewriting';
        isChanged = true;
      }
    }

    if (isChanged) setNetworks([...newNetworks]);

    const { adaptPostText } = await import("@/app/actions");

    const promises = newNetworks.map(async (net, i) => {
      if (net.enabled && net.prompt) {
        try {
          const adapted = await adaptPostText(post.caption, net.prompt, apiKeys.MAIN_PROMPT, apiKeys.OPENAI_MODEL || 'gpt-5.4', {
            name: net.name,
            platform: net.platform,
            pmpChannelId: net.pmpChannelId,
          });
          newNetworks[i].adaptedTitle = adapted.title;
          newNetworks[i].adaptedText = adapted.text;
          newNetworks[i].textLimitAdjusted = Boolean(adapted.shortened);
          newNetworks[i].textLimitPlatform = adapted.platformLabel || adapted.platform || '';
          newNetworks[i].status = 'success';
          newNetworks[i].errorMsg = undefined;
          await saveSocialNetwork(net._docId || net.accountId || net.name, newNetworks[i]);
        } catch (error: any) {
          console.error("Rewrite Error:", error);
          newNetworks[i].status = 'error';
          alert(`Ошибка для ${net.name}: ${error.message}`);
        }
      }
    });

    await Promise.all(promises);
    setNetworks([...newNetworks]);
  };

  type PublishErrorResponse = {
    code?: string;
    message?: string;
    details?: {
      platformLabel?: string;
      networkName?: string;
      contentLength?: number;
      contentMax?: number;
      titleLength?: number;
      titleMax?: number;
      summary?: string;
    };
  };

  type PublishResponseBody = {
    status?: string;
    skippedDuplicates?: unknown[];
    publishedAccounts?: unknown[];
    forcedDuplicate?: boolean;
  };

  const formatDashboardText = (keyPath: string, values: Record<string, string | number> = {}) => {
    let text = t('dashboard', keyPath);
    for (const [key, value] of Object.entries(values)) {
      text = text.replace(`{${key}}`, String(value));
    }
    return text;
  };

  const createForceAttemptId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  };

  const askDuplicatePublishConfirm = (message: string) => {
    if (duplicateConfirmResolver.current) {
      duplicateConfirmResolver.current(false);
    }

    setDuplicateConfirm({ message });
    return new Promise<boolean>((resolve) => {
      duplicateConfirmResolver.current = resolve;
    });
  };

  const resolveDuplicatePublishConfirm = (confirmed: boolean) => {
    duplicateConfirmResolver.current?.(confirmed);
    duplicateConfirmResolver.current = null;
    setDuplicateConfirm(null);
  };

  const readPublishError = async (res: Response): Promise<PublishErrorResponse> => {
    const text = await res.text();
    try {
      const parsed = JSON.parse(text);
      return {
        code: typeof parsed?.code === 'string' ? parsed.code : undefined,
        message: typeof parsed?.message === 'string' ? parsed.message : text,
        details: parsed?.details && typeof parsed.details === 'object' ? parsed.details : undefined
      };
    } catch {
      return { message: text };
    }
  };

  const getPublishErrorMessage = (error: PublishErrorResponse) => {
    if (error.code === 'SLIDESHOW_CREATION_FAILED') {
      return language === 'ru'
        ? 'Не получилось создать слайдшоу: ошибка подключенного сервиса Cloudinary. Попробуйте ещё раз. Если ошибка повторится, обратитесь к администратору.'
        : 'Could not create the slideshow: the connected Cloudinary service returned an error. Please try again. If the error repeats, contact the administrator.';
    }

    if (error.code === 'SLIDESHOW_SERVICE_NOT_CONFIGURED') {
      return language === 'ru'
        ? 'Не получилось создать слайдшоу: сервис Cloudinary не настроен. Проверьте настройки или обратитесь к администратору.'
        : 'Could not create the slideshow: Cloudinary is not configured. Check the settings or contact the administrator.';
    }

    if (error.code === 'TEXT_LIMIT_EXCEEDED') {
      const details = error.details || {};
      const platform = details.platformLabel || details.networkName || 'platform';
      const parts: string[] = [];
      if (details.contentLength && details.contentMax) {
        parts.push(language === 'ru'
          ? `текст ${details.contentLength}/${details.contentMax}`
          : `text ${details.contentLength}/${details.contentMax}`);
      }
      if (details.titleLength && details.titleMax) {
        parts.push(language === 'ru'
          ? `заголовок ${details.titleLength}/${details.titleMax}`
          : `title ${details.titleLength}/${details.titleMax}`);
      }
      const limitDetails = parts.length ? ` (${parts.join(', ')})` : '';
      return language === 'ru'
        ? `Текст для ${platform} стал длиннее допустимого лимита${limitDetails}. Сократите его в поле адаптированного текста или нажмите «Переписать текст» ещё раз.`
        : `The text for ${platform} is over the allowed limit${limitDetails}. Shorten it in the adapted text field or click "Rewrite text" again.`;
    }

    if (error.message && error.message !== 'Internal Server Error') {
      return error.message;
    }

    return language === 'ru'
      ? 'Не удалось опубликовать пост. Попробуйте ещё раз. Если ошибка повторится, обратитесь к администратору.'
      : 'Could not publish the post. Please try again. If the error repeats, contact the administrator.';
  };

  const getFetchPostErrorMessage = (error: { code?: string; message?: string }) => {
    if (error.code === 'INSTAGRAM_LINK_NOT_FOUND') {
      return language === 'ru'
        ? 'Instagram сейчас не отдал ссылку на медиа. Обычно это временный сбой подключенного сервиса RapidAPI. Попробуйте ещё раз через минуту или получите пост по прямой ссылке.'
        : 'Instagram did not return the media link right now. This is usually a temporary issue with the connected RapidAPI service. Try again in a minute or fetch the post by direct link.';
    }

    if (error.code === 'INSTAGRAM_EMPTY_RESPONSE') {
      return language === 'ru'
        ? 'Instagram не вернул посты для этого аккаунта. Проверьте ссылку на аккаунт или попробуйте повторить запрос позже.'
        : 'Instagram did not return posts for this account. Check the account link or try again later.';
    }

    if (error.code === 'INVALID_INSTAGRAM_LINK') {
      return language === 'ru'
        ? 'Не удалось распознать ссылку Instagram. Вставьте ссылку на пост, reels или tv.'
        : 'Could not recognize the Instagram link. Paste a link to a post, reel, or tv item.';
    }

    if (error.code === 'RAPIDAPI_NOT_CONFIGURED') {
      return language === 'ru'
        ? 'RapidAPI ключ не настроен. Проверьте настройки интеграций.'
        : 'RapidAPI key is not configured. Check the integration settings.';
    }

    return language === 'ru'
      ? 'Не удалось получить пост из Instagram. Попробуйте ещё раз. Если ошибка повторится, обратитесь к администратору.'
      : 'Could not fetch the Instagram post. Please try again. If the error repeats, contact the administrator.';
  };
  
  const handlePublishAll = async () => {
    if (publishingAll) return;
    if (!post?.mediaUrls || !post.mediaUrls.length) {
      alert("Нет медиа файлов для публикации");
      return;
    }

    const enabledNetworks = networks.filter((n) => n.enabled && (n.adaptedText || post.caption));
    if (enabledNetworks.length === 0) {
      alert("Нет готовых сетей для публикации (нужно включить сеть и иметь текст).");
      return;
    }

    // Inject global Pinterest link as fallback for networks that don't have their own
    const networksWithPinLink = enabledNetworks.map(net => {
      if (pinterestLink && (net.platform || net.name).toLowerCase().includes('pinterest')) {
        const ps = net.publishingSettings || {};
        if (!ps.pinterestLink) {
          return { ...net, publishingSettings: { ...ps, pinterestLink } };
        }
      }
      return net;
    });

    const newNetworks = [...networks];
    enabledNetworks.forEach(net => {
      const idx = newNetworks.findIndex(n => n === net);
      if (idx !== -1) newNetworks[idx].status = 'publishing';
    });
    setNetworks([...newNetworks]);
    setPublishingAll(true);

    try {
      const sendPublishAllRequest = async (forceDuplicate = false, forceAttemptId?: string): Promise<PublishResponseBody> => {
        const res = await fetch("/api/postmypost/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            networks: networksWithPinLink,
            mediaUrls: post.mediaUrls,
            originalCaption: post.caption,
            postKey: post.postKey,
            postUrl: post.postUrl,
            postAt: scheduleDate ? new Date(scheduleDate).toISOString() : undefined,
            ...(forceDuplicate ? { forceDuplicate: true, forceAttemptId } : {})
          })
        });

        if (!res.ok) {
          throw new Error(getPublishErrorMessage(await readPublishError(res)));
        }

        try {
          return await res.json();
        } catch {
          return {};
        }
      };

      let responseBody = await sendPublishAllRequest();
      let skippedCount = responseBody?.skippedDuplicates?.length || 0;
      let publishedCount = Array.isArray(responseBody?.publishedAccounts)
        ? responseBody.publishedAccounts.length
        : (responseBody?.status === 'skipped' ? 0 : enabledNetworks.length);

      if (skippedCount && !publishedCount && responseBody?.status === 'skipped') {
        const confirmed = await askDuplicatePublishConfirm(t('dashboard', 'publishAlerts.duplicateConfirmAll'));
        if (!confirmed) {
          enabledNetworks.forEach(net => {
            const idx = newNetworks.findIndex(n => n === net);
            if (idx !== -1) newNetworks[idx].status = 'idle';
          });
          setNetworks([...newNetworks]);
          return;
        }

        responseBody = await sendPublishAllRequest(true, createForceAttemptId());
        skippedCount = responseBody?.skippedDuplicates?.length || 0;
        publishedCount = Array.isArray(responseBody?.publishedAccounts)
          ? responseBody.publishedAccounts.length
          : (responseBody?.status === 'skipped' ? 0 : enabledNetworks.length);
      }

      enabledNetworks.forEach(net => {
        const idx = newNetworks.findIndex(n => n === net);
        if (idx !== -1) newNetworks[idx].status = 'success';
      });
      if (skippedCount) {
        if (!publishedCount) {
          alert(t('dashboard', 'publishAlerts.duplicateSkipped'));
        } else {
          alert(formatDashboardText('publishAlerts.duplicatesSkipped', { count: skippedCount }));
        }
        setNetworks([...newNetworks]);
        return;
      }
      alert(t('dashboard', 'publishAlerts.published'));
    } catch (err: any) {
      console.error(err);
      enabledNetworks.forEach(net => {
        const idx = newNetworks.findIndex(n => n === net);
        if (idx !== -1) {
          newNetworks[idx].status = 'error';
          newNetworks[idx].errorMsg = err.message;
        }
      });
      alert('Ошибка публикации: ' + err.message);
    } finally {
      setPublishingAll(false);
    }
    setNetworks([...newNetworks]);
  };

  const handleOpenAddNetworkModal = async () => {
    setIsModalOpen(true);
    setLoadingAccounts(true);
    try {
      const res = await fetch("/api/postmypost/accounts");
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      // Handle cases where the API returns an object (e.g., {"data": [...]}) instead of a direct array
      const accountsArray = Array.isArray(data) ? data : (data?.data || data?.items || data?.accounts || []);
      setAvailableAccounts(accountsArray);
    } catch (e: any) {
      alert("Error fetching PostMyPost accounts: " + e.message);
      setAvailableAccounts([]);
    }
    setLoadingAccounts(false);
  };

  const handleAddNetwork = (account: any) => {
    const newNetwork: SocialNetwork = {
      name: account.name || account.platform,
      enabled: true,
      model: apiKeys.OPENAI_MODEL || 'gpt-5.4',
      prompt: `Адаптируй этот пост для публикации в ${account.platform}...`,
      accountId: account.id,
      platform: account.platform,
      status: 'idle',
      publishingSettings: {
        slideshowMode: 'auto',
        contentFilter: 'none',
        publicationType: 1,
        tiktokPrivacyStatus: 1,
        tiktokComment: true,
        tiktokDuet: true,
        tiktokStitch: true
      },
    };
    const newNetworks = [...networks, newNetwork];
    setNetworks(newNetworks);
    saveSocialNetwork(newNetwork.accountId || newNetwork.name, newNetwork);
    setIsModalOpen(false);
  };

  const toggleNetwork = (index: number) => {
    const newNetworks = [...networks];
    newNetworks[index].enabled = !newNetworks[index].enabled;
    setNetworks(newNetworks);
    const net = newNetworks[index];
    saveSocialNetwork(net._docId || net.accountId || net.name, net);
  };

  const handleRewriteSingle = async (index: number) => {
    if (!post?.caption) {
      alert("Нет исходного текста поста для переписывания. Сначала загрузите пост.");
      return;
    }

    const newNetworks = [...networks];
    const net = newNetworks[index];
    if (!net.prompt) {
      alert("У этой соцсети нет инструкции(Prompt) для нейросети.");
      return;
    }

    newNetworks[index].status = 'rewriting';
    setNetworks([...newNetworks]);

    try {
      const { adaptPostText } = await import("@/app/actions");
      const adapted = await adaptPostText(post.caption, net.prompt, apiKeys.MAIN_PROMPT, apiKeys.OPENAI_MODEL || 'gpt-5.4', {
        name: net.name,
        platform: net.platform,
        pmpChannelId: net.pmpChannelId,
      });
      newNetworks[index].adaptedTitle = adapted.title;
      newNetworks[index].adaptedText = adapted.text;
      newNetworks[index].textLimitAdjusted = Boolean(adapted.shortened);
      newNetworks[index].textLimitPlatform = adapted.platformLabel || adapted.platform || '';
      newNetworks[index].status = 'success';
      newNetworks[index].errorMsg = undefined;
      saveSocialNetwork(net._docId || net.accountId || net.name, newNetworks[index]);
    } catch (error: any) {
      console.error("Single Rewrite Error:", error);
      newNetworks[index].status = 'error';
      alert(`Ошибка для ${net.name}: ${error.message}`);
    }
    setNetworks([...newNetworks]);
  };

  const handlePublishSingle = async (index: number) => {
    if (networks[index]?.status === 'publishing') return;
    if (!post?.mediaUrls || !post.mediaUrls.length) {
      alert("Нет медиа файлов для публикации");
      return;
    }
    const newNetworks = [...networks];
    newNetworks[index].status = 'publishing';
    setNetworks(newNetworks);

    // Inject global Pinterest link as fallback
    let netToPublish = networks[index];
    if (pinterestLink && (netToPublish.platform || netToPublish.name).toLowerCase().includes('pinterest')) {
      const ps = netToPublish.publishingSettings || {};
      if (!ps.pinterestLink) {
        netToPublish = { ...netToPublish, publishingSettings: { ...ps, pinterestLink } };
      }
    }

    try {
      const sendPublishSingleRequest = async (forceDuplicate = false, forceAttemptId?: string): Promise<PublishResponseBody> => {
        const res = await fetch("/api/postmypost/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            networks: [netToPublish],
            mediaUrls: post.mediaUrls,
            originalCaption: post.caption,
            postKey: post.postKey,
            postUrl: post.postUrl,
            postAt: scheduleDate ? new Date(scheduleDate).toISOString() : undefined,
            ...(forceDuplicate ? { forceDuplicate: true, forceAttemptId } : {})
          })
        });

        if (!res.ok) {
          throw new Error(getPublishErrorMessage(await readPublishError(res)));
        }

        try {
          return await res.json();
        } catch {
          return {};
        }
      };

      let responseBody = await sendPublishSingleRequest();

      let skippedCount = responseBody?.skippedDuplicates?.length || 0;
      let publishedCount = Array.isArray(responseBody?.publishedAccounts)
        ? responseBody.publishedAccounts.length
        : (responseBody?.status === 'skipped' ? 0 : 1);
      if (skippedCount && !publishedCount && responseBody?.status === 'skipped') {
        const confirmed = await askDuplicatePublishConfirm(
          formatDashboardText('publishAlerts.duplicateConfirmSingle', { network: networks[index].name })
        );
        if (!confirmed) {
          newNetworks[index].status = 'idle';
          setNetworks([...newNetworks]);
          return;
        }

        responseBody = await sendPublishSingleRequest(true, createForceAttemptId());
        skippedCount = responseBody?.skippedDuplicates?.length || 0;
        publishedCount = Array.isArray(responseBody?.publishedAccounts)
          ? responseBody.publishedAccounts.length
          : (responseBody?.status === 'skipped' ? 0 : 1);
      }

      if (skippedCount && !publishedCount) {
        newNetworks[index].status = 'idle';
        alert(t('dashboard', 'publishAlerts.duplicateSkipped'));
        setNetworks([...newNetworks]);
        return;
      }

      newNetworks[index].status = 'success';
      alert(formatDashboardText('publishAlerts.publishedTo', { network: networks[index].name }));
    } catch (err: any) {
      console.error(err);
      newNetworks[index].status = 'error';
      newNetworks[index].errorMsg = err.message;
      alert(`Ошибка публикации в ${networks[index].name}: ` + err.message);
    }
    setNetworks([...newNetworks]);
  };

  const handleDeleteNetwork = async (index: number) => {
    const net = networks[index];
    if (!net._docId && !net.accountId && !net.name) return;

    // Remove from UI
    const newNetworks = networks.filter((_, i) => i !== index);
    setNetworks(newNetworks);

    // Remove from backend
    const { deleteSocialNetwork } = await import('@/app/actions');
    await deleteSocialNetwork(net._docId || net.accountId || net.name);
  };

  return (
    <div className="space-y-6">
      {duplicateConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
          >
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {t('dashboard', 'publishAlerts.duplicateTitle')}
            </h3>
            <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
              {duplicateConfirm.message}
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => resolveDuplicatePublishConfirm(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-zinc-700 dark:text-gray-200 dark:hover:bg-zinc-800"
              >
                {t('dashboard', 'publishAlerts.cancel')}
              </button>
              <button
                type="button"
                onClick={() => resolveDuplicatePublishConfirm(true)}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
              >
                {t('dashboard', 'publishAlerts.confirmRepeat')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center border-b pb-4">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`font-semibold ${activeTab === 'dashboard' ? 'text-black dark:text-white border-b-2 border-black dark:border-white pb-4 -mb-4' : 'text-gray-500 dark:text-gray-400'}`}
          >
            {t('dashboard', 'tabs.dashboard')}
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`font-semibold flex items-center gap-2 ${activeTab === 'settings' ? 'text-black dark:text-white border-b-2 border-black dark:border-white pb-4 -mb-4' : 'text-gray-500 dark:text-gray-400'}`}
          >
            <Key className="w-4 h-4" /> {t('dashboard', 'tabs.settings')}
          </button>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          className="text-gray-500 dark:text-gray-400 hover:text-red-600 flex items-center gap-2 text-sm font-medium transition-colors"
        >
          <LogOut className="w-4 h-4" /> {t('dashboard', 'logout')}
        </button>
      </div>

      {activeTab === 'settings' ? (
        <div className="max-w-2xl bg-white dark:bg-zinc-900 p-6 rounded-xl shadow-sm space-y-6">
          <div className="border-t pt-6">
            <h2 className="text-xl font-bold">{t('dashboard', 'settingsText.title')}</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm">{t('dashboard', 'settingsText.desc')}</p>
          </div>

          <div className="flex border-b">
            <button
              onClick={() => setSettingsTab('general')}
              className={`py-2 px-4 font-medium text-sm transition-colors ${settingsTab === 'general' ? 'border-b-2 border-black dark:border-white text-black dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:text-gray-300'}`}
            >
              {t('dashboard', 'settingsText.tabs.general')}
            </button>
            <button
              onClick={() => setSettingsTab('prompts')}
              className={`py-2 px-4 font-medium text-sm transition-colors ${settingsTab === 'prompts' ? 'border-b-2 border-black dark:border-white text-black dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:text-gray-300'}`}
            >
              {t('dashboard', 'settingsText.tabs.prompts')}
            </button>
          </div>

          {keysLoading ? (
            <p className="text-gray-500 dark:text-gray-400">Loading settings...</p>
          ) : settingsTab === 'general' ? (
            <div className="space-y-4">
              {[
                { id: 'OPENAI_MODEL', label: 'OpenAI Model', type: 'select' },
                { id: 'OPENAI_API_KEY', label: 'OpenAI API Key', placeholder: 'sk-proj-...' },
                  { id: 'RAPIDAPI_KEY', label: 'RapidAPI Key (Instagram Data)', placeholder: '...' },
                { id: 'POSTMYPOST_TOKEN', label: 'PostMyPost Token (Bearer Auth)', placeholder: '...' },
                { id: 'POSTMYPOST_PROJECT_ID', label: 'PostMyPost Project ID', placeholder: '331831' },
                { id: 'INSTAGRAM_URL', label: 'Source Instagram Account URL', placeholder: 'https://instagram.com/username' },
                { id: 'CLOUDINARY_CLOUD_NAME', label: 'Cloudinary Cloud Name', placeholder: 'your_cloud_name' },
                { id: 'CLOUDINARY_API_KEY', label: 'Cloudinary API Key', placeholder: '...' },
                { id: 'CLOUDINARY_API_SECRET', label: 'Cloudinary API Secret', placeholder: '...' },
                  { id: 'CLOUDINARY_REG_DATE', label: 'Cloudinary дата регистрации (ГГГГ-ММ-ДД)', placeholder: '2025-12-22' },
              ].map((field) => (
                <div key={field.id} className="grid gap-2">
                  <label className="text-sm font-medium">{t('dashboard', `settingsText.fields.${field.id}.label`)}</label>
                  <div className="flex gap-2">
                    {field.type === 'select' ? (
                      <select
                        value={apiKeys[field.id as keyof typeof apiKeys]}
                        onChange={(e) => {
                          setApiKeys({ ...apiKeys, [field.id]: e.target.value });
                          handleSaveKey(field.id, e.target.value);
                        }}
                        className="flex-1 border p-2 rounded-md bg-white dark:bg-zinc-900"
                      >
                        {Object.entries(translations[language].dashboard.settingsText.models).map(([key, label]) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={field.id.includes('KEY') || field.id.includes('TOKEN') ? 'password' : 'text'}
                        value={apiKeys[field.id as keyof typeof apiKeys]}
                        onChange={(e) => setApiKeys({ ...apiKeys, [field.id]: e.target.value })}
                        placeholder={t('dashboard', `settingsText.fields.${field.id}.placeholder`) || field.placeholder}
                        className="flex-1 border p-2 rounded-md"
                      />
                    )}
                    <button
                      onClick={() => handleSaveKey(field.id, apiKeys[field.id as keyof typeof apiKeys])}
                      className="bg-black text-white px-4 py-2 rounded-md hover:bg-gray-800 flex items-center gap-2"
                    >
                      <Save className="w-4 h-4" /> {t('dashboard', 'settingsText.save')}
                    </button>
                  </div>
                </div>
              ))}

            </div>
          ) : (
            <div className="space-y-8">
              <div className="grid gap-2">
                <label className="text-sm font-bold text-gray-900 dark:text-gray-100">{t('dashboard', 'settingsText.mainPromptLabel')}</label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{t('dashboard', 'settingsText.mainPromptDesc')}</p>
                <div className="flex gap-2 flex-col">
                  <textarea
                    value={apiKeys.MAIN_PROMPT}
                    onChange={(e) => setApiKeys({ ...apiKeys, MAIN_PROMPT: e.target.value })}
                    placeholder={t('dashboard', 'settingsText.mainPromptPlaceholder')}
                    className="flex-1 border p-3 rounded-md min-h-[100px] text-sm"
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={() => handleSaveKey('MAIN_PROMPT', apiKeys.MAIN_PROMPT)}
                      className="bg-black text-white px-4 py-2 rounded-md hover:bg-gray-800 flex items-center gap-2"
                    >
                      <Save className="w-4 h-4" /> {t('dashboard', 'settingsText.savePrompt')}
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t">
                <h3 className="text-lg font-bold mb-2">{t('dashboard', 'settingsText.tabs.prompts')}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t('dashboard', 'settingsText.promptsTabDesc')}</p>

                <div className="space-y-6">
                  {PLATFORM_KEYS.map((platform) => {
                    const systemPrompt = defaultPrompts[language as 'en' | 'ru'][platform];
                    const currentPrompt = customPrompts[platform] !== undefined ? customPrompts[platform] : systemPrompt;
                    const isCustom = customPrompts[platform] !== undefined;

                    return (
                      <div key={platform} className="grid gap-2 p-4 bg-gray-50 dark:bg-zinc-800 rounded-lg border border-gray-100 dark:border-zinc-800 relative">
                        <label className="text-sm font-semibold capitalize flex items-center justify-between">
                          <span>{t('dashboard', 'settingsText.platformPromptLabel')} {platform}</span>
                          {isCustom && <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">Custom</span>}
                        </label>
                        <textarea
                          value={currentPrompt}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCustomPrompts({ ...customPrompts, [platform]: val });
                          }}
                          placeholder={t('dashboard', 'settingsText.platformPromptPlaceholder')}
                          className={`flex-1 border p-3 rounded-md min-h-[80px] text-sm ${isCustom ? 'border-blue-200 focus:border-blue-500' : 'border-gray-200 dark:border-zinc-700'}`}
                        />
                        <div className="flex justify-between items-center mt-2">
                          {isCustom ? (
                            <button
                              onClick={() => {
                                const newPrompts = { ...customPrompts };
                                delete newPrompts[platform];
                                setCustomPrompts(newPrompts);
                                const jsonStr = JSON.stringify(newPrompts);
                                setApiKeys({ ...apiKeys, CUSTOM_PROMPTS: jsonStr });
                                handleSaveKey('CUSTOM_PROMPTS', jsonStr);
                              }}
                              className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1"
                            >
                              Reset to default
                            </button>
                          ) : (
                            <div /> // Spacer
                          )}
                          <button
                            onClick={() => handleSaveCustomPrompt(platform, currentPrompt)}
                            className="bg-gray-800 text-white px-3 py-1.5 text-sm rounded-md hover:bg-black flex items-center gap-1.5 transition-colors"
                          >
                            <Save className="w-3.5 h-3.5" /> {t('dashboard', 'settingsText.savePrompt')}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <QuotaWidget quotas={quotas} fetchQuotas={loadQuotas} loading={quotaLoading} />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Left Column: Source Post */}
              <div className="space-y-6 lg:col-span-1">
                <div className="rounded-xl bg-white dark:bg-zinc-900 p-6 shadow-sm">
                  <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
                    <Instagram className="h-5 w-5 text-pink-600" />
                    {t('dashboard', 'sourcePost')}
                  </h2>

                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <button
                        onClick={handleFetchLatest}
                        disabled={loading}
                        className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin inline" /> : t('dashboard', 'fetchLatest')}
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                        {t('dashboard', 'fetchByLink')}
                      </label>
                      <div className="flex gap-2">
                        <input
                          value={fetchLink}
                          onChange={(e) => setFetchLink(e.target.value)}
                          placeholder="https://instagram.com/p/..."
                          className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-900 dark:text-gray-100 dark:placeholder:text-gray-500"
                        />
                        <button
                          onClick={handleFetchByLink}
                          disabled={loading || !fetchLink}
                          className="rounded-lg bg-gray-100 p-2 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                          title="Получить пост"
                        >
                          <Search className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Schedule Date Input */}
                    <div className="pt-2 border-t">
                      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                        {t('dashboard', 'scheduleDate')}
                      </label>
                      <DatePicker
                        selected={selectedDate}
                        onChange={(date: Date | null) => {
                          setSelectedDate(date);
                          if (date) {
                            // Convert to format required by action: YYYY-MM-DDTHH:mm
                            const tzOffset = date.getTimezoneOffset() * 60000;
                            const localISOTime = (new Date(date.getTime() - tzOffset)).toISOString().slice(0, 16);
                            setScheduleDate(localISOTime);
                          } else {
                            setScheduleDate("");
                          }
                        }}
                        showTimeSelect
                        timeFormat="HH:mm"
                        timeIntervals={15}
                        timeCaption={language === "ru" ? "Время" : "Time"}
                        dateFormat="dd.MM.yyyy HH:mm"
                        locale={language}
                        placeholderText={language === "ru" ? "ДД.ММ.ГГГГ --:--" : "MM/DD/YYYY --:--"}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-900 dark:text-gray-100 dark:placeholder:text-gray-500"
                      />
                    </div>

                    {post ? (
                      <div className="space-y-3 pt-4 border-t">
                        {post.imageUrl && (
                          <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-gray-100 dark:bg-zinc-800">
                            {!previewImageFailed ? (
                              <img
                                src={`/api/proxy-image?url=${encodeURIComponent(post.imageUrl)}`}
                                alt={t('dashboard', 'postPreview')}
                                onError={() => setPreviewImageFailed(true)}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-gray-500 dark:text-gray-400">
                                <ImageOff className="h-8 w-8 text-gray-400 dark:text-gray-500" />
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                  {language === 'ru' ? 'Превью недоступно' : 'Preview unavailable'}
                                </p>
                                <p className="max-w-xs text-xs leading-relaxed">
                                  {language === 'ru'
                                    ? 'Instagram мог обновить ссылку на медиа. Получите пост заново, если нужно увидеть картинку.'
                                    : 'Instagram may have refreshed this media link. Fetch the post again if you need to see the image.'}
                                </p>
                              </div>
                            )}
                            <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
                              <span className="rounded bg-black/60 backdrop-blur-sm px-2 py-1 text-xs font-medium text-white shadow-sm">
                                {t('dashboard', `postTypes.${(post.type || '').toLowerCase().replace(/\s+/g, '_')}`) || post.type}
                              </span>
                              {post.mediaUrls && post.mediaUrls.length > 1 && (
                                <span className="rounded bg-black/60 backdrop-blur-sm px-2 py-1 text-xs font-medium text-white shadow-sm flex items-center gap-1">
                                  <Instagram className="w-3 h-3" />
                                  1 {t('dashboard', 'mediaCountOf')} {post.mediaUrls.length}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                        <textarea
                          value={post.caption || ""}
                          onChange={(e) => setPost({ ...post, caption: e.target.value })}
                          className="w-full text-sm text-gray-800 dark:text-gray-200 min-h-[150px] max-h-60 overflow-y-auto whitespace-pre-wrap p-3 rounded-md bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 focus:bg-white dark:focus:bg-zinc-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors resize-y focus:outline-none"
                          placeholder={t('dashboard', 'postTextPlaceholder')}
                        />

                        <button
                          onClick={handleAdaptAll}
                          className="w-full rounded-lg bg-purple-600 px-4 py-2 text-white hover:bg-purple-700 flex items-center justify-center gap-2"
                        >
                          <Wand2 className="h-4 w-4" />
                          {t('dashboard', 'adaptBtn')}
                        </button>
                      </div>
                    ) : (
                      <div className="flex h-64 items-center justify-center rounded-lg bg-gray-50 dark:bg-zinc-800 border-2 border-dashed">
                        <p className="text-gray-400 text-sm">{t('dashboard', 'noPostLoaded')}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Networks */}
              <div className="space-y-6 lg:col-span-2">
                {/* Auto-Posting Toggle Card */}
                <div className="flex flex-col gap-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 p-5 shadow-sm dark:from-zinc-900 dark:to-zinc-800 dark:border-zinc-700 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <span className="font-semibold text-gray-800 dark:text-gray-200 text-lg">{t('dashboard', 'autoPost.title')}</span>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {t('dashboard', 'autoPost.desc')}
                    </p>
                    {autoPostEnabled && autoPostEnabledSince && (
                      <p className="mt-2 text-xs font-medium text-blue-700 dark:text-blue-300">
                        {t('dashboard', 'autoPost.enabledSince')}: {formatAutoPostDate(autoPostEnabledSince)}
                      </p>
                    )}
                    {autoPostSaving && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {t('dashboard', 'autoPost.saving')}
                      </p>
                    )}
                  </div>
                  <label className={`relative inline-flex min-w-max items-center self-start sm:self-center ${autoPostSaving ? 'cursor-wait opacity-70' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      checked={autoPostEnabled}
                      disabled={autoPostSaving}
                      onChange={async (e) => {
                        await handleAutoPostToggle(e.target.checked);
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-400 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white dark:bg-zinc-700 after:border-gray-300 dark:border-zinc-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {/* Global Pinterest Link */}
                <div className="rounded-xl bg-gradient-to-r from-red-50 to-pink-50 border border-red-100 p-5 shadow-sm dark:from-zinc-900 dark:to-zinc-800 dark:border-zinc-700">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">📌</span>
                    <span className="font-semibold text-gray-800 dark:text-gray-200">{t('dashboard', 'pinterestLink.title')}</span>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      type="url"
                      value={pinterestLink}
                      onChange={(e) => setPinterestLink(e.target.value)}
                      placeholder="https://mysite.com/course"
                      className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-red-400 focus:outline-none dark:border-zinc-600 dark:bg-zinc-900 dark:text-gray-100 dark:placeholder:text-gray-500"
                    />
                    <button
                      onClick={() => handleSaveKey('PINTEREST_LINK', pinterestLink)}
                      className="rounded-lg bg-red-600 px-4 py-2 text-white text-sm font-medium hover:bg-red-700 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {t('dashboard', 'pinterestLink.save')}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{t('dashboard', 'pinterestLink.desc')}</p>
                </div>

                <div className="rounded-xl bg-white dark:bg-zinc-900 p-6 shadow-sm">
                  <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                      <h2 className="text-xl font-semibold">{t('dashboard', 'socialNetworks.title')}</h2>
                      <button
                        onClick={handleOpenAddNetworkModal}
                        className="flex w-full items-center justify-center gap-1 rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors dark:bg-zinc-800 dark:text-gray-300 dark:hover:bg-zinc-700 sm:w-auto"
                      >
                        <Plus className="h-4 w-4" /> {t('dashboard', 'socialNetworks.addNetwork')}
                      </button>
                    </div>
                    <button
                      onClick={handlePublishAll}
                      disabled={!post || publishingAll}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium leading-tight text-white hover:bg-green-700 disabled:opacity-50 sm:w-auto sm:px-6 sm:text-base"
                    >
                      {publishingAll ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      {t('dashboard', 'socialNetworks.publishAll')}
                    </button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    {networks.map((net, idx) => (
                      <div key={net._docId || net.accountId || idx} className={`relative rounded-xl border p-4 transition-all ${net.enabled ? 'bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700' : 'bg-gray-50 dark:bg-zinc-800 border-gray-100 dark:border-zinc-800 opacity-75'}`}>
                        <div className="mb-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              className="font-medium bg-transparent border-b border-transparent hover:border-gray-300 dark:border-zinc-600 focus:border-blue-500 focus:outline-none transition-colors max-w-[150px] truncate"
                              value={net.name}
                              onChange={(e) => {
                                const newNet = [...networks];
                                newNet[idx].name = e.target.value;
                                setNetworks(newNet);
                              }}
                              onBlur={() => {
                                saveSocialNetwork(net._docId || net.accountId || net.name, networks[idx]);
                              }}
                              title="Rename network"
                            />
                            {net.status === 'loading' && <RefreshCw className="h-3 w-3 animate-spin text-gray-400" />}
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" checked={net.enabled} onChange={() => toggleNetwork(idx)} className="sr-only peer" />
                            <div className="w-9 h-5 bg-gray-200 dark:bg-zinc-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white dark:bg-zinc-900 after:border-gray-300 dark:border-zinc-600 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                            <div className="relative">
                              <button
                                onClick={() => setExpandedSettingsIdx(expandedSettingsIdx === idx ? null : idx)}
                                className="p-1 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                                title={t('dashboard', 'networkCard.settings')}
                              >
                                <Settings className="w-4 h-4" />
                              </button>
                              {expandedSettingsIdx === idx && (
                                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-zinc-900 rounded-md shadow-lg border border-gray-100 dark:border-zinc-800 p-1 z-10">
                                  <button
                                    onClick={() => {
                                      setAdvancedSettingsIdx(idx);
                                      setExpandedSettingsIdx(null);
                                    }}
                                    className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 rounded flex items-center gap-2 transition-colors border-b border-gray-100 dark:border-zinc-800 mb-1"
                                  >
                                    <Settings className="w-4 h-4" />
                                    {t('dashboard', 'networkCard.advancedSettings')}
                                  </button>
                                  <button
                                    onClick={() => handleSuggestPrompt(idx)}
                                    className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 rounded flex items-center gap-2 transition-colors border-b border-gray-100 dark:border-zinc-800 mb-1"
                                  >
                                    <Zap className="w-4 h-4 text-amber-500" />
                                    {t('dashboard', 'networkCard.suggestPrompt')}
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (confirm(`{t('dashboard', 'networkCard.deleteNetwork')} ${net.name}?`)) {
                                        handleDeleteNetwork(idx);
                                        setExpandedSettingsIdx(null);
                                      }
                                    }}
                                    className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded flex items-center gap-2 transition-colors"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                    {t('dashboard', 'networkCard.deleteNetwork')}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {net.enabled && (
                          <div className="space-y-4 pt-4 mt-2 border-t border-gray-100 dark:border-zinc-800">
                            <div className="grid gap-3 sm:grid-cols-2">
                              <button
                                onClick={() => handleRewriteSingle(idx)}
                                disabled={net.status === 'rewriting' || net.status === 'publishing' || (!post && !net.adaptedText)}
                                className="flex items-center justify-center gap-2 bg-blue-100 text-blue-700 hover:bg-blue-200 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 dark:bg-blue-950/50 dark:text-blue-200 dark:hover:bg-blue-900/60"
                              >
                                {net.status === 'rewriting' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                                {t('dashboard', 'networkCard.rewrite')}
                              </button>
                              <button
                                onClick={() => handlePublishSingle(idx)}
                                disabled={net.status === 'rewriting' || net.status === 'publishing' || (!post && !net.adaptedText)}
                                className="flex items-center justify-center gap-2 bg-green-100 text-green-700 hover:bg-green-200 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 dark:bg-emerald-950/50 dark:text-emerald-200 dark:hover:bg-emerald-900/60"
                              >
                                {net.status === 'publishing' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                {t('dashboard', 'networkCard.publish')}
                              </button>
                            </div>
                            {net.status === 'error' && (
                              <p className="text-red-600 dark:text-red-200 text-xs mt-1 font-medium bg-red-50 dark:bg-red-950/50 p-2 rounded border border-red-100 dark:border-red-900/60">{net.errorMsg}</p>
                            )}
                            {net.status === 'success' && (
                              <p className="text-green-600 dark:text-emerald-200 text-xs mt-1 font-medium bg-green-50 dark:bg-emerald-950/50 p-2 rounded border border-green-100 dark:border-emerald-900/60">{t('dashboard', 'networkCard.success')}</p>
                            )}
                            {net.textLimitAdjusted && (
                              <p className="text-amber-700 dark:text-amber-200 text-xs mt-1 font-medium bg-amber-50 dark:bg-amber-950/40 p-2 rounded border border-amber-100 dark:border-amber-900/60">
                                {t('dashboard', 'networkCard.textShortened').replace('{platform}', net.textLimitPlatform || net.name)}
                              </p>
                            )}

                            <div className="space-y-1">
                              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">{t('dashboard', 'networkCard.promptLabel')}</label>
                              <textarea
                                value={net.prompt || ''}
                                onChange={(e) => {
                                  const newNet = [...networks];
                                  newNet[idx].prompt = e.target.value;
                                  setNetworks(newNet);
                                }}
                                onBlur={() => {
                                  saveSocialNetwork(net._docId || net.accountId || net.name, networks[idx]);
                                }}
                                placeholder={t('dashboard', 'networkCard.promptPlaceholder')}
                                className="w-full rounded-md border border-gray-200 bg-white p-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none min-h-[60px] dark:border-zinc-700 dark:bg-zinc-950 dark:text-gray-100 dark:placeholder:text-gray-500"
                              />
                            </div>

                            <div className="space-y-3">
                              <div>
                                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">{t('dashboard', 'networkCard.titleLabel')}</label>
                                <input
                                  type="text"
                                  value={net.adaptedTitle || ''}
                                  onChange={(e) => {
                                    const newNet = [...networks];
                                    newNet[idx].adaptedTitle = e.target.value;
                                    newNet[idx].textLimitAdjusted = false;
                                    newNet[idx].textLimitPlatform = '';
                                    setNetworks(newNet);
                                  }}
                                  onBlur={() => {
                                    saveSocialNetwork(net._docId || net.accountId || net.name, networks[idx]);
                                  }}
                                  placeholder={t('dashboard', 'networkCard.titlePlaceholder')}
                                  className="w-full mt-1 rounded-md border border-gray-200 bg-white p-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-gray-100 dark:placeholder:text-gray-500"
                                />
                              </div>
                              <div>
                                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">{t('dashboard', 'networkCard.adaptedTextLabel')}</label>
                                <textarea
                                  value={net.adaptedText || ''}
                                  onChange={(e) => {
                                    const newNet = [...networks];
                                    newNet[idx].adaptedText = e.target.value;
                                    newNet[idx].textLimitAdjusted = false;
                                    newNet[idx].textLimitPlatform = '';
                                    setNetworks(newNet);
                                  }}
                                  onBlur={() => {
                                    saveSocialNetwork(net._docId || net.accountId || net.name, networks[idx]);
                                  }}
                                  placeholder={t('dashboard', 'networkCard.adaptedTextPlaceholder')}
                                  className="w-full mt-1 rounded-md border border-gray-200 bg-white p-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none min-h-[100px] dark:border-zinc-700 dark:bg-zinc-950 dark:text-gray-100 dark:placeholder:text-gray-500"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Network Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl bg-white dark:bg-zinc-900 p-6 shadow-2xl relative">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 dark:text-gray-400"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 className="text-xl font-bold mb-4">{t('dashboard', 'modals.addNetworkTitle')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t('dashboard', 'modals.addNetworkDesc')}</p>

            {loadingAccounts ? (
              <div className="flex justify-center p-8">
                <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
              </div>
            ) : availableAccounts.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-zinc-800 rounded-lg border border-dashed">
                {t('dashboard', 'modals.noAccounts')}
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto space-y-3">
                {availableAccounts.map((acc: any) => {
                  const isAdded = networks.some(n => n.accountId === acc.id);
                  return (
                    <div key={acc.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-zinc-700 hover:border-blue-200 hover:bg-blue-50/50 transition-colors">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">{acc.name || acc.platform}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 flex gap-2">
                          <span>{t('dashboard', 'modals.platform')}: <span className="capitalize">{acc.platform}</span></span>
                          <span>({acc.id})</span>
                        </p>
                      </div>
                      <button
                        onClick={() => handleAddNetwork(acc)}
                        disabled={isAdded}
                        className={`px-4 py-1.5 rounded-md text-sm font-medium ${isAdded ? 'bg-gray-100 dark:bg-zinc-800 text-gray-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                      >
                        {isAdded ? t('dashboard', 'modals.added') : t('dashboard', 'modals.add')}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Advanced Settings Modal */}
      {advancedSettingsIdx !== null && networks[advancedSettingsIdx] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl bg-white dark:bg-zinc-900 p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => {
                const net = networks[advancedSettingsIdx];
                saveSocialNetwork(net._docId || net.accountId || net.name, net);
                setAdvancedSettingsIdx(null);
              }}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 dark:text-gray-400"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 className="text-xl font-bold mb-2">{t('dashboard', 'modals.advSettingsTitle')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 font-medium bg-gray-50 dark:bg-zinc-800 p-2 rounded inline-block">{networks[advancedSettingsIdx].name}</p>

            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-semibold block text-gray-700 dark:text-gray-300">{t('dashboard', 'modals.contentFilter')}</label>
                <div className="flex flex-col gap-2">
                  {[
                    { id: 'single_image', label: t('dashboard', 'modals.filterSingleImage') },
                    { id: 'single_video', label: t('dashboard', 'modals.filterSingleVideo') },
                    { id: 'carousel', label: t('dashboard', 'modals.filterCarousel') },
                    { id: 'mixed_carousel', label: t('dashboard', 'modals.filterMixedCarousel') }
                  ].map(option => {
                    let currentFilters = networks[advancedSettingsIdx].publishingSettings?.contentFilter;
                    // Migrate legacy values to array
                    if (!Array.isArray(currentFilters)) {
                      if (currentFilters === 'only_reels') currentFilters = ['single_video'];
                      else if (currentFilters === 'exclude_reels') currentFilters = ['single_image', 'carousel', 'mixed_carousel'];
                      else currentFilters = ['single_image', 'single_video', 'carousel', 'mixed_carousel']; // 'none' or undefined
                    }
                    const isChecked = currentFilters.includes(option.id);
                    return (
                      <label key={option.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const newNets = [...networks];
                            const st = newNets[advancedSettingsIdx].publishingSettings || {};
                            let filters = [...(currentFilters as string[])];
                            if (e.target.checked) {
                              filters.push(option.id);
                            } else {
                              filters = filters.filter(f => f !== option.id);
                            }
                            st.contentFilter = filters;
                            newNets[advancedSettingsIdx].publishingSettings = st;
                            setNetworks(newNets);
                          }}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{option.label}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('dashboard', 'modals.filterDesc')}</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold block text-gray-700 dark:text-gray-300">{t('dashboard', 'modals.slideshowMode')}</label>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 cursor-pointer mb-2">
                    <input
                      type="checkbox"
                      checked={
                        !Array.isArray(networks[advancedSettingsIdx].publishingSettings?.slideshowMode) &&
                        networks[advancedSettingsIdx].publishingSettings?.slideshowMode !== 'never' &&
                        networks[advancedSettingsIdx].publishingSettings?.slideshowMode !== 'always'
                      }
                      onChange={(e) => {
                        const newNets = [...networks];
                        const st = newNets[advancedSettingsIdx].publishingSettings || {};
                        if (e.target.checked) {
                          st.slideshowMode = 'auto';
                        } else {
                          st.slideshowMode = []; // Disable auto, start with empty array
                        }
                        newNets[advancedSettingsIdx].publishingSettings = st;
                        setNetworks(newNets);
                      }}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{t('dashboard', 'modals.slideshowAuto')}</span>
                  </label>

                  {(() => {
                    let currentModes = networks[advancedSettingsIdx].publishingSettings?.slideshowMode;
                    const isAuto = !Array.isArray(currentModes) && currentModes !== 'never' && currentModes !== 'always';

                    if (isAuto) return null;

                    if (!Array.isArray(currentModes)) {
                      if (currentModes === 'always') currentModes = ['mixed_carousel', 'photo_carousel', 'single_image'];
                      else currentModes = []; // 'never'
                    }

                    return [
                      { id: 'mixed_carousel', label: t('dashboard', 'modals.slideshowMixedCarousel') },
                      { id: 'photo_carousel', label: t('dashboard', 'modals.slideshowPhotoCarousel') },
                      { id: 'single_image', label: t('dashboard', 'modals.slideshowSinglePhoto') }
                    ].map(option => (
                      <label key={option.id} className="flex items-center gap-2 cursor-pointer ml-4">
                        <input
                          type="checkbox"
                          checked={(currentModes as string[]).includes(option.id)}
                          onChange={(e) => {
                            const newNets = [...networks];
                            const st = newNets[advancedSettingsIdx].publishingSettings || {};
                            let modes = [...(currentModes as string[])];
                            if (e.target.checked) {
                              modes.push(option.id);
                            } else {
                              modes = modes.filter(m => m !== option.id);
                            }
                            st.slideshowMode = modes;
                            newNets[advancedSettingsIdx].publishingSettings = st;
                            setNetworks(newNets);
                          }}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{option.label}</span>
                      </label>
                    ));
                  })()}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('dashboard', 'modals.slideshowDesc')}</p>
              </div>

              <div className="space-y-2 border-t pt-4">
                <label className="text-sm font-semibold block text-gray-700 dark:text-gray-300">{t('dashboard', 'modals.pubType')}</label>
                <select
                  className="w-full border rounded-md p-2 text-sm focus:border-blue-500 outline-none"
                  value={networks[advancedSettingsIdx].publishingSettings?.publicationType || 1}
                  onChange={(e) => {
                    const newNets = [...networks];
                    const st = newNets[advancedSettingsIdx].publishingSettings || {};
                    st.publicationType = Number(e.target.value);
                    newNets[advancedSettingsIdx].publishingSettings = st;
                    setNetworks(newNets);
                  }}
                >
                  <option value="1">{t('dashboard', 'modals.pubTypeNormal')}</option>
                  <option value="4">{t('dashboard', 'modals.pubTypeShorts')}</option>
                </select>
              </div>

              {networks[advancedSettingsIdx].platform?.toLowerCase().includes('tiktok') && (
                <div className="space-y-3 border-t pt-4 bg-gray-50 dark:bg-zinc-800 p-4 rounded-lg">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('dashboard', 'modals.tiktokOptions')}</h3>

                  <div className="flex items-center justify-between">
                    <label className="text-sm text-gray-700 dark:text-gray-300">{t('dashboard', 'modals.tiktokPrivacy')}</label>
                    <select
                      className="border rounded px-2 py-1 text-sm bg-white dark:bg-zinc-900"
                      value={networks[advancedSettingsIdx].publishingSettings?.tiktokPrivacyStatus || 1}
                      onChange={(e) => {
                        const newNets = [...networks];
                        const st = newNets[advancedSettingsIdx].publishingSettings || {};
                        st.tiktokPrivacyStatus = Number(e.target.value);
                        newNets[advancedSettingsIdx].publishingSettings = st;
                        setNetworks(newNets);
                      }}
                    >
                      <option value="1">Public</option>
                      <option value="2">Friends</option>
                      <option value="3">Private</option>
                    </select>
                  </div>

                  {['comment', 'duet', 'stitch'].map(opt => (
                    <label key={opt} className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-300">
                      <span className="capitalize">Allow {opt}</span>
                      <input
                              type="checkbox"
                              className="rounded border-gray-300 dark:border-zinc-600 w-4 h-4 text-blue-600 focus:ring-blue-500"
                              checked={networks[advancedSettingsIdx].publishingSettings?.[`tiktok${opt.charAt(0).toUpperCase() + opt.slice(1)}` as keyof PublishingSettings] as boolean ?? true}
                              onChange={(e) => {
                                const newNets = [...networks];
                                const st = newNets[advancedSettingsIdx].publishingSettings || {};
                                (st as any)[`tiktok${opt.charAt(0).toUpperCase() + opt.slice(1)}`] = e.target.checked;
                                newNets[advancedSettingsIdx].publishingSettings = st;
                                setNetworks(newNets);
                              }}
                            />
                          </label>
                        ))}
                </div>
              )}

              {networks[advancedSettingsIdx].platform?.toLowerCase().includes('pinterest') && (
                <div className="space-y-2 border-t pt-4">
                  <label className="text-sm font-semibold block text-gray-700 dark:text-gray-300">{t('dashboard', 'modals.pinterestPinLink')}</label>
                  <input
                    type="url"
                    placeholder="https://test.com"
                    className="w-full border rounded-md p-2 text-sm focus:border-blue-500 outline-none"
                    value={networks[advancedSettingsIdx].publishingSettings?.pinterestLink || ''}
                    onChange={(e) => {
                      const newNets = [...networks];
                      const st = newNets[advancedSettingsIdx].publishingSettings || {};
                      st.pinterestLink = e.target.value;
                      newNets[advancedSettingsIdx].publishingSettings = st;
                      setNetworks(newNets);
                    }}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('dashboard', 'modals.pinterestPinLinkDesc')}</p>
                </div>
              )}
            </div>

            <div className="mt-6 pt-4 border-t flex justify-end">
              <button
                onClick={() => {
                  const net = networks[advancedSettingsIdx];
                  saveSocialNetwork(net._docId || net.accountId || net.name, net);
                  setAdvancedSettingsIdx(null);
                }}
                className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                {t('dashboard', 'modals.saveAndClose')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

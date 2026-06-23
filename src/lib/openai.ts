const API_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-5.4';
const THINKING_REASONING_EFFORT = 'medium';
const TITLE_MAX_LENGTH = 100;

type ChatMessage = {
  role: 'system' | 'user';
  content: string;
};

type OpenAiPayload = {
  model: string;
  messages: ChatMessage[];
  temperature: number;
  response_format: { type: 'json_object' };
  reasoning_effort?: string;
};

function resolveModelVariant(model?: string) {
  const isThinking = (model || '').includes('-thinking');
  return {
    isThinking,
    actualModel: isThinking ? (model || '').replace('-thinking', '') : model,
  };
}

export interface AdaptedContent {
  title: string;
  text: string;
}

export interface ShortenContentRequest {
  title: string;
  text: string;
  platformLabel: string;
  contentLimit?: string;
  titleLimit?: string;
  model: string;
  apiKey: string;
}

function sanitizeOpenAiError(text: string) {
  return text.replace(/sk-[A-Za-z0-9_*\-]+/g, 'sk-***');
}

function buildOpenAiPayload(model: string | undefined, messages: ChatMessage[]) {
  const { isThinking, actualModel } = resolveModelVariant(model);
  const payload: OpenAiPayload = {
    model: actualModel || DEFAULT_MODEL,
    messages,
    temperature: 1,
    response_format: { type: 'json_object' },
  };

  if (isThinking) {
    payload.reasoning_effort = THINKING_REASONING_EFFORT;
  }

  return { payload, isThinking };
}

async function requestOpenAiContent(apiKey: string, payload: OpenAiPayload): Promise<string> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI Error: ${res.status} ${sanitizeOpenAiError(errText)}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  if (!choice?.message?.content) {
    throw new Error('Empty response from OpenAI');
  }

  return choice.message.content;
}

function cleanTitle(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/^(title|\u0437\u0430\u0433\u043e\u043b\u043e\u0432\u043e\u043a)\s*[:\-]\s*/i, '')
    .trim();
}

function normalizeTitleKey(value: string) {
  return cleanTitle(value)
    .toLowerCase()
    .replace(/[.!?]+$/g, '')
    .trim();
}

function isGenericTitle(value: string) {
  const normalized = normalizeTitleKey(value);
  const genericTitles = [
    'post for social network',
    'post for social media',
    'social media post',
    'adapted post',
    'post text',
    'untitled',
    'new post',
    '\u043f\u043e\u0441\u0442 \u0434\u043b\u044f \u0441\u043e\u0446\u0441\u0435\u0442\u0438',
    '\u043f\u043e\u0441\u0442 \u0434\u043b\u044f \u0441\u043e\u0446\u0438\u0430\u043b\u044c\u043d\u043e\u0439 \u0441\u0435\u0442\u0438',
    '\u0430\u0434\u0430\u043f\u0442\u0438\u0440\u043e\u0432\u0430\u043d\u043d\u044b\u0439 \u043f\u043e\u0441\u0442',
    '\u0442\u0435\u043a\u0441\u0442 \u043f\u043e\u0441\u0442\u0430',
    '\u0437\u0430\u0433\u043e\u043b\u043e\u0432\u043e\u043a',
    '\u0431\u0435\u0437 \u0437\u0430\u0433\u043e\u043b\u043e\u0432\u043a\u0430',
  ];

  return !normalized || genericTitles.some((title) => normalized === title || normalized.startsWith(`${title}:`));
}

function trimTitle(value: string) {
  const title = cleanTitle(value);
  if (Array.from(title).length <= TITLE_MAX_LENGTH) return title;

  const chars = Array.from(title);
  let shortened = chars.slice(0, TITLE_MAX_LENGTH).join('').trimEnd();
  const boundary = Math.max(
    shortened.lastIndexOf(' '),
    shortened.lastIndexOf('.'),
    shortened.lastIndexOf(','),
    shortened.lastIndexOf(':'),
    shortened.lastIndexOf(';')
  );

  if (boundary > TITLE_MAX_LENGTH * 0.6) {
    shortened = shortened.slice(0, boundary).trimEnd();
  }

  return shortened;
}

function fallbackTitleFromText(text: string) {
  const compact = text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/#[^\s#]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!compact) {
    return /[\u0400-\u04FF]/.test(text) ? '\u041d\u043e\u0432\u044b\u0439 \u043f\u043e\u0441\u0442' : 'New post';
  }

  const firstSentence = compact.match(/^(.{20,160}?[.!?])\s/)?.[1] || compact;
  return trimTitle(firstSentence);
}

function pickUsableTitle(candidates: string[], fallbackSource: string) {
  for (const candidate of candidates) {
    const title = trimTitle(candidate);
    if (!isGenericTitle(title)) return title;
  }

  return fallbackTitleFromText(fallbackSource);
}

async function generateTitle(
  baseText: string,
  adaptedText: string,
  combinedPrompt: string,
  draftTitle: string,
  model: string,
  apiKey: string
) {
  const systemPrompt = [
    'Always return exactly one JSON object shaped as {"title":"..."}. No markdown, comments, prefixes, suffixes, or formatting outside JSON.',
    'Generate one meaningful, user-facing title in the same language as the adapted post.',
    'The title can be published visibly in the target social network. It is not an internal label.',
    'Respect the provided user instructions about title style, topic, language, keywords, and length, but still return a non-empty title.',
    'If the user instructions say a title should be absent, ignore that part because this product always needs a title field.',
    'Never use generic placeholders like "Post for social network", "Adapted post", "Post text", "Title", or similar service labels.',
    'Keep the title concise, preferably 4-12 words and under 100 characters.',
  ].join('\n');
  const userContent = [
    'Task instructions:',
    combinedPrompt || '(none)',
    '',
    'Original post text:',
    `"""${baseText}"""`,
    '',
    'Adapted post text:',
    `"""${adaptedText}"""`,
    '',
    'Draft title from the adaptation step:',
    draftTitle || '(empty)',
  ].join('\n');
  const { payload, isThinking } = buildOpenAiPayload(model, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ]);

  console.log(`[OpenAI Request] Generate Title using model: ${payload.model}`, isThinking ? `(with reasoning_effort: ${THINKING_REASONING_EFFORT})` : '');

  const raw = await requestOpenAiContent(apiKey, payload);
  const title = parseTitleOnly(raw);
  return pickUsableTitle([title, draftTitle], adaptedText || baseText);
}

export async function adaptText(baseText: string, prompt: string, mainPrompt: string, model: string, apiKey: string): Promise<AdaptedContent> {
  const systemPrompt = [
    'Always return exactly one JSON object shaped as {"title":"...","text":"..."}. No markdown, comments, prefixes, suffixes, or formatting outside JSON.',
    'Adapt the post text according to the user instructions.',
    'The "title" field may be a draft. The final title will be generated in a separate validation step.',
    'Never use generic placeholders like "Post for social network", "Adapted post", "Post text", or similar service labels.',
  ].join('\n');
  const combinedPrompt = mainPrompt ? `${mainPrompt}\n\n${prompt}` : prompt;
  const userContent = [
    'Task instructions:',
    combinedPrompt,
    '',
    'Original post text:',
    `"""${baseText}"""`,
  ].join('\n');
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ];
  const { payload, isThinking } = buildOpenAiPayload(model, messages);

  console.log(`[OpenAI Request] Adapt Text using model: ${payload.model}`, isThinking ? `(with reasoning_effort: ${THINKING_REASONING_EFFORT})` : '');

  const raw = await requestOpenAiContent(apiKey, payload);
  const adapted = parseTitleAndText(raw);
  const text = adapted.text || baseText;
  let title = pickUsableTitle([adapted.title], text);

  try {
    title = await generateTitle(baseText, text, combinedPrompt, adapted.title, model, apiKey);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to generate separate title:', sanitizeOpenAiError(message));
  }

  return { title, text };
}

export async function shortenContentToLimits(request: ShortenContentRequest): Promise<AdaptedContent> {
  const limits = [
    request.titleLimit ? `title: ${request.titleLimit}` : '',
    request.contentLimit ? `text: ${request.contentLimit}` : '',
  ].filter(Boolean).join('; ');

  const systemPrompt = 'Always return exactly one JSON object shaped as {"title":"...","text":"..."}. No markdown, comments, prefixes, or suffixes.';
  const userContent = [
    `Platform: ${request.platformLabel}`,
    `Hard limits: ${limits}`,
    '',
    'Shorten the title and/or text only as much as needed to fit the hard limits.',
    'Keep the original language, meaning, useful keywords, CTA, and existing links when they fit.',
    'Do not add new facts, new URLs, or new hashtags.',
    'If space is tight, remove repetition and reduce hashtags before removing the main idea.',
    '',
    `Current title:\n${request.title || ''}`,
    '',
    `Current text:\n${request.text || ''}`,
  ].join('\n');
  const { payload, isThinking } = buildOpenAiPayload(request.model, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ]);

  console.log(`[OpenAI Request] Shorten Text for ${request.platformLabel} using model: ${payload.model}`, isThinking ? `(with reasoning_effort: ${THINKING_REASONING_EFFORT})` : '');

  const raw = await requestOpenAiContent(request.apiKey, payload);
  return parseTitleAndText(raw);
}

function parseTitleOnly(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    return cleanTitle(parsed.title || '');
  } catch {
    return cleanTitle(raw);
  }
}

function parseTitleAndText(raw: string): AdaptedContent {
  try {
    const parsed = JSON.parse(raw);
    return {
      title: cleanTitle(parsed.title || ''),
      text: parsed.text || parsed.body || parsed.content || parsed.caption || '',
    };
  } catch {
    return {
      title: '',
      text: raw.trim(),
    };
  }
}

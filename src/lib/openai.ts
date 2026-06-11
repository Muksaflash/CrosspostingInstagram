
const API_URL = 'https://api.openai.com/v1/chat/completions';



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

export async function adaptText(baseText: string, prompt: string, mainPrompt: string, model: string, apiKey: string): Promise<AdaptedContent> {
  const systemPrompt = `Всегда отвечай СТРОГО одним JSON-объектом вида {"title": "...", "text": "..."}, без каких-либо комментариев, префиксов, суффиксов и форматирования.`;
  
  const combinedPrompt = mainPrompt ? `${mainPrompt}\n\n${prompt}` : prompt;
  const userContent = `Задача:\n${combinedPrompt}\n\nИсходный текст поста:\n"""${baseText}"""`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent }
  ];

  // Handle "thinking" model variant
  const isThinking = (model || '').includes('-thinking');
  const actualModel = isThinking ? model.replace('-thinking', '') : model;

  const payload: Record<string, any> = {
    model: actualModel || 'gpt-5.2', // Default to GPT-5.2
    messages: messages,
    temperature: 1, 
    response_format: { type: "json_object" } // Force JSON mode
  };

  // For "thinking" mode, add reasoning_effort for deeper analysis
  if (isThinking) {
    payload.reasoning_effort = 'high';
  }

  console.log(`[OpenAI Request] Adapt Text using model: ${payload.model}`, isThinking ? '(with reasoning_effort: high)' : '');

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
     const errText = await res.text();
     throw new Error(`OpenAI Error: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  if (!choice?.message?.content) {
    throw new Error('Empty response from OpenAI');
  }

  return parseTitleAndText(choice.message.content);
}

export async function shortenContentToLimits(request: ShortenContentRequest): Promise<AdaptedContent> {
  const limits = [
    request.titleLimit ? `title: ${request.titleLimit}` : "",
    request.contentLimit ? `text: ${request.contentLimit}` : "",
  ].filter(Boolean).join("; ");

  const systemPrompt = 'Always return exactly one JSON object shaped as {"title":"...","text":"..."}. No markdown, comments, prefixes, or suffixes.';
  const userContent = [
    `Platform: ${request.platformLabel}`,
    `Hard limits: ${limits}`,
    "",
    "Shorten the title and/or text only as much as needed to fit the hard limits.",
    "Keep the original language, meaning, useful keywords, CTA, and existing links when they fit.",
    "Do not add new facts, new URLs, or new hashtags.",
    "If space is tight, remove repetition and reduce hashtags before removing the main idea.",
    "",
    `Current title:\n${request.title || ""}`,
    "",
    `Current text:\n${request.text || ""}`,
  ].join("\n");

  const isThinking = (request.model || '').includes('-thinking');
  const actualModel = isThinking ? request.model.replace('-thinking', '') : request.model;
  const payload: Record<string, any> = {
    model: actualModel || 'gpt-5.2',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature: 1,
    response_format: { type: "json_object" },
  };

  if (isThinking) {
    payload.reasoning_effort = 'high';
  }

  console.log(`[OpenAI Request] Shorten Text for ${request.platformLabel} using model: ${payload.model}`, isThinking ? '(with reasoning_effort: high)' : '');

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'Authorization': `Bearer ${request.apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI Error: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  if (!choice?.message?.content) {
    throw new Error('Empty response from OpenAI');
  }

  return parseTitleAndText(choice.message.content);
}

function parseTitleAndText(raw: string): AdaptedContent {
  try {
    const parsed = JSON.parse(raw);
    return {
      title: parsed.title || '',
      text: parsed.text || parsed.body || ''
    };
  } catch (e) {
    // Fallback if not valid JSON (should happen less with json_object mode)
    return {
      title: '',
      text: raw.trim()
    };
  }
}

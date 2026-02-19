
const API_URL = 'https://api.openai.com/v1/chat/completions';

export function getOpenAiKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  return key;
}

export interface AdaptedContent {
  title: string;
  text: string;
}

export async function adaptText(baseText: string, prompt: string, model: string): Promise<AdaptedContent> {
  const apiKey = getOpenAiKey();
  
  const systemPrompt = `Всегда отвечай СТРОГО одним JSON-объектом вида {"title": "...", "text": "..."}, без каких-либо комментариев, префиксов, суффиксов и форматирования.`;
  
  const userContent = `Задача: ${prompt}\n\nИсходный текст поста:\n"""${baseText}"""`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent }
  ];

  const payload = {
    model: model || 'gpt-4o', // Default to 4o if not specified
    messages: messages,
    temperature: 1, 
    response_format: { type: "json_object" } // Force JSON mode if model supports it
  };

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

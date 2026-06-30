const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/*const parseJsonObject = (content) => {
  if (!content || typeof content !== 'string') {
    throw new Error('AI provider returned an empty response');
  }

  const trimmed = content.trim();

  try {
    return JSON.parse(trimmed);
  } catch (_) {
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');

    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    }

    throw new Error('AI provider did not return valid JSON');
  }
};*/
const parseJsonObject = (content) => {
    if (!content || typeof content !== "string") {
        throw new Error("AI provider returned an empty response");
    }

    let cleaned = content.trim();

    // Remove markdown code fences
    cleaned = cleaned
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

    try {
        return JSON.parse(cleaned);
    } catch (_) {
        const firstBrace = cleaned.indexOf("{");
        const lastBrace = cleaned.lastIndexOf("}");

        if (firstBrace >= 0 && lastBrace > firstBrace) {
            return JSON.parse(
                cleaned.slice(firstBrace, lastBrace + 1)
            );
        }

        throw new Error("AI provider did not return valid JSON");
    }
};

const createAiProvider = () => {
  const provider = (process.env.AI_PROVIDER || 'openai').toLowerCase();
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;

  if (!apiKey || !model) {
    return {
      isConfigured: false,
      async createJsonResponse() {
        throw new Error(
          'AI assistant is not configured. Add AI_PROVIDER, AI_API_KEY and AI_MODEL to backend/.env.'
        );
      }
    };
  }

  return {
    isConfigured: true,

    async createJsonResponse({ systemPrompt, messages }) {

      if (provider === 'gemini') {

        const prompt = [
          systemPrompt,
          '',
          ...messages.map((m) => `${m.role.toUpperCase()}:\n${m.content}`)
        ].join('\n\n');

        const response = await fetch(
          `${GEMINI_BASE_URL}/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              generationConfig: {
                temperature: 0.2
              },
              contents: [
                {
                  parts: [
                    {
                      text: prompt
                    }
                  ]
                }
              ]
            })
          }
        );

        const data = await response.json();

        if (!response.ok) {
          const message =
            data?.error?.message ||
            'Gemini API request failed';

          throw new Error(message);
        }

        const content =
          data?.candidates?.[0]?.content?.parts
            ?.map((p) => p.text)
            .join('') || '';

        return parseJsonObject(content);
      }

      // -----------------------
      // OpenAI
      // -----------------------

      const response = await fetch(
        `${OPENAI_BASE_URL}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            messages: [
              {
                role: 'system',
                content: systemPrompt
              },
              ...messages
            ]
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        const message =
          data?.error?.message ||
          'OpenAI request failed';

        throw new Error(message);
      }

      const content =
        data?.choices?.[0]?.message?.content;

      return parseJsonObject(content);
    }
  };
};

module.exports = {
  createAiProvider
};
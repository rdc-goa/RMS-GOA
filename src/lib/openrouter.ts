export async function callOpenRouter({
  prompt,
}: {
  prompt: string;
}) {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured.");
  }

  const models = [
    "deepseek/deepseek-chat-v3-0324:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "mistralai/mistral-7b-instruct:free",
  ];

  let lastError = "";

  for (const model of models) {
    try {
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "HTTP-Referer":
              process.env.NEXT_PUBLIC_BASE_URL ||
              "https://rndprojects.goa.paruluniversity.ac.in",
            "X-Title": "RMS-Goa",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "user",
                content: prompt,
              },
            ],
          }),
        }
      );

      if (!response.ok) {
        lastError = await response.text();
        continue;
      }

      const data = await response.json();

      return data?.choices?.[0]?.message?.content || "";
    } catch (err) {
      lastError = String(err);
    }
  }

  throw new Error(`All OpenRouter models failed: ${lastError}`);
}
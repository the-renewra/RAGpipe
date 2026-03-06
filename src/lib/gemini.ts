import { GoogleGenAI } from "@google/genai";

let ai: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (!ai) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    ai = new GoogleGenAI({ apiKey: key });
  }
  return ai;
}

export async function embedText(text: string): Promise<number[]> {
  const modelsToTry = [
    "text-embedding-004",
    "embedding-001",
    "gemini-3-flash-preview",
    "gemini-3.1-flash-preview",
    "gemini-2.5-flash"
  ];
  
  const client = getGeminiClient();
  let lastError: any;

  for (const model of modelsToTry) {
    try {
      const response = await client.models.embedContent({
        model: model,
        contents: text,
      });
      if (response.embeddings?.[0]?.values) {
        return response.embeddings[0].values;
      }
    } catch (error: any) {
      console.warn(`Model ${model} failed for embedding:`, error.message);
      lastError = error;
    }
  }

  console.error("All embedding models failed. Last error:", lastError);
  throw new Error("Failed to generate embeddings. Please check your API key.");
}

export async function generateContent(prompt: string, systemInstruction?: string): Promise<string> {
  try {
    const client = getGeminiClient();
    const response = await client.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: prompt,
      config: {
        systemInstruction,
      },
    });
    return response.text || "";
  } catch (error) {
    console.error("Error generating content:", error);
    throw new Error("LLM generation failed. Please try again later.");
  }
}

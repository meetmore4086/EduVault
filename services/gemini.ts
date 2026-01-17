
import { GoogleGenAI } from "@google/genai";
import { DocumentRecord } from "../types";

// Fixed: Initializing GoogleGenAI with process.env.API_KEY directly as per guidelines.
const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY as string });

export const analyzeDocument = async (doc: DocumentRecord): Promise<string> => {
  const ai = getAI();
  const model = 'gemini-3-flash-preview';

  const isImage = doc.type.startsWith('image/');
  const prompt = isImage 
    ? "Look at this image of my college notes. Please provide a clear, bulleted summary of the content and identify key concepts mentioned."
    : `I have a document named "${doc.name}". Assuming it's a study note or document, what are the likely key themes based on the filename? (Note: In a full app, we would extract text from PDF here).`;

  try {
    const parts: any[] = [{ text: prompt }];
    
    if (isImage) {
      // Remove data:image/png;base64, prefix
      const base64Data = doc.data.split(',')[1];
      parts.push({
        inlineData: {
          mimeType: doc.type,
          data: base64Data
        }
      });
    }

    const response = await ai.models.generateContent({
      model,
      contents: { parts }
    });

    // response.text is a property, returning the extracted text.
    return response.text || "No analysis generated.";
  } catch (error) {
    console.error("Gemini analysis error:", error);
    return "Error analyzing document. Please check your connection.";
  }
};

export const chatWithKnowledge = async (query: string, context: DocumentRecord[]): Promise<string> => {
  const ai = getAI();
  // Fixed: Property 'category' does not exist on type 'DocumentRecord'. Using 'type' instead.
  const contextDescription = context
    .map(d => `- ${d.name} (${d.type})`)
    .join('\n');

  const prompt = `You are a helpful study assistant. The user has the following documents in their vault:\n${contextDescription}\n\nUser Question: ${query}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt
    });
    // response.text is a property, returning the extracted text.
    return response.text || "I'm not sure how to answer that.";
  } catch (error) {
    return "AI is temporarily unavailable.";
  }
};

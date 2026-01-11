
import { GoogleGenAI } from "@google/genai";

const getAIClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export const analyzeBids = async (rfqTitle: string, bids: any[]) => {
  const ai = getAIClient();
  const prompt = `
    作为采购专家，请分析以下询价单的竞价情况：询价单标题为 "${rfqTitle}"。
    竞价数据如下：${JSON.stringify(bids)}
    
    请提供简洁的专业摘要，包括：
    1. 根据价格、交货日期和历史表现，评价哪个报价最具竞争力。
    2. 指出任何潜在风险或异常（如报价过低、交货期过长）。
    3. 给出明确的中标建议。
    请使用专业的中文字符编写，结构清晰。
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("AI 分析失败:", error);
    return "AI 分析暂时不可用，请手动审核报价。";
  }
};

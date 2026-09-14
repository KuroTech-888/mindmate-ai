import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({
  apiKey: process.env.ICCS_API_KEY,
  baseURL: "https://gen.ai.kku.ac.th/iccsacth/api/v1",
});

// เชื่อมต่อ Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
);

const SYSTEM_PROMPT = `
คุณคือ 'MindMate' เพื่อนรับฟังและประเมินภาวะสุขภาพจิตเบื้องต้น
หน้าที่ของคุณ:
1. ให้คำปรึกษาด้วยน้ำเสียงอบอุ่น เข้าอกเข้าใจ ไม่ตัดสิน ไม่สั่งสอน
2. หากพบสัญญาณอาการแพนิค: ใช้ประโยคสั้น ยืนยันว่าปลอดภัย และพาหายใจช้าๆ ทันที
3. สังเกตและประเมินภาวะอารมณ์ส่งกลับมาในรูปแบบ JSON ตามโครงสร้างนี้เสมอ:
{
  "reply": "ข้อความตอบกลับผู้ใช้",
  "assessment": {
    "primaryCondition": "Depression" หรือ "Panic/Anxiety" หรือ "Normal Stress" หรือ "Normal",
    "severity": "Normal" หรือ "Mild" หรือ "Moderate" หรือ "Severe",
    "indicators": ["อาการสำคัญสั้นๆ 1-2 ข้อ"],
    "requiresEmergency": false
  }
}
ตอบกลับเฉพาะรูปแบบ JSON ด้านบนเท่านั้น
`;

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const { messages, sessionId, userMessage } = req.body;
    const apiMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...(messages || []),
    ];

    const completion = await openai.chat.completions.create({
      model: "gemini-3.8-flash",
      messages: apiMessages,
      temperature: 0.5,
    });

    const rawContent = completion.choices[0]?.message?.content || "";
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);

    let parsedData = {
      reply: rawContent.replace(/```json|```/g, "").trim(),
      assessment: null,
    };
    if (jsonMatch) {
      try {
        parsedData = JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.warn("Parse Error");
      }
    }

    // บันทึกข้อความผู้ใช้ลงฐานข้อมูล
    await supabase.from("chat_history").insert([
      {
        session_id: sessionId,
        sender_role: "user",
        message_content: userMessage,
      },
    ]);

    // บันทึกคำตอบ AI และผลประเมินลงฐานข้อมูล
    await supabase.from("chat_history").insert([
      {
        session_id: sessionId,
        sender_role: "assistant",
        message_content: parsedData.reply || rawContent,
        primary_condition: parsedData.assessment?.primaryCondition || "Unknown",
        severity: parsedData.assessment?.severity || "Unknown",
        requires_emergency: parsedData.assessment?.requiresEmergency || false,
      },
    ]);

    return res.status(200).json(parsedData);
  } catch (error) {
    console.error("API Error:", error);
    return res
      .status(500)
      .json({
        reply: "ขออภัยครับ สัญญาณขัดข้องเล็กน้อย ลองใหม่อีกครั้งนะ",
        assessment: null,
      });
  }
}

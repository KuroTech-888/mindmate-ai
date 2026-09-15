import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

// 1. ตั้งค่าการเชื่อมต่อ AI API (KKU ICCS)
const openai = new OpenAI({
  apiKey: process.env.ICCS_API_KEY,
  // ใช้ URL ตามตัวอย่างโค้ด Python ของทางมหาวิทยาลัย
  baseURL: "https://gen.ai.kku.ac.th/iccsacth/api/v1",
});

// 2. ตั้งค่าการเชื่อมต่อ Supabase
const hasSupabaseConfig =
  process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY;
const supabase = hasSupabaseConfig
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
  : null;

const SYSTEM_PROMPT = `
คุณคือ 'MindMate' เพื่อนรับฟังและประเมินภาวะสุขภาพจิตเบื้องต้น
หน้าที่ของคุณ:
1. ให้คำปรึกษาด้วยน้ำเสียงอบอุ่น เข้าอกเข้าใจ ไม่ตัดสิน ไม่สั่งสอน
2. หากพบสัญญาณอาการแพนิค (ใจสั่น แน่นหน้าอก หายใจไม่อิ่ม) หรือภาวะอยากทำร้ายตนเอง: ใช้ประโยคสั้น ยืนยันว่าปลอดภัย และแนะนำช่องทางช่วยเหลือทันที
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
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { messages, sessionId, userMessage } = req.body;
    const apiMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...(messages || []),
    ];

    // 1. เรียกใช้งาน AI เปลี่ยนเป็น Claude Sonnet 4.6
    const completion = await openai.chat.completions.create({
      model: "claude-sonnet-4.6",
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
        console.warn("JSON Parse Error, using raw response");
      }
    }

    // 2. บันทึกข้อมูลลง Supabase
    if (supabase) {
      try {
        await supabase.from("chat_history").insert([
          {
            session_id: sessionId || "anonymous",
            sender_role: "user",
            message_content: userMessage || "",
          },
          {
            session_id: sessionId || "anonymous",
            sender_role: "assistant",
            message_content: parsedData.reply || rawContent,
            primary_condition:
              parsedData.assessment?.primaryCondition || "Normal",
            severity: parsedData.assessment?.severity || "Normal",
            requires_emergency:
              parsedData.assessment?.requiresEmergency || false,
          },
        ]);
      } catch (dbError) {
        console.error("Supabase Save Error (Bypassed):", dbError);
      }
    }

    // 3. ส่งผลลัพธ์กลับไปยังหน้าเว็บ
    return res.status(200).json(parsedData);
  } catch (error) {
    console.error("Core AI Error:", error);
    // แสดงข้อความ Error ดักจับให้เห็นหน้าเว็บ
    return res.status(500).json({
      reply: `[System Error Debug]: ${error.message}`,
      assessment: null,
    });
  }
}

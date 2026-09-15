import { createClient } from "@supabase/supabase-js";

// ตั้งค่า Supabase (ใช้ Environment Variables บน Vercel หรือระบุค่าตรงๆ ถ้าทดสอบ)
const supabase = createClient(
  process.env.SUPABASE_URL || "https://tsiljjvhzwycazttprem.supabase.co",
  process.env.SUPABASE_ANON_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzaWxqanZoend5Y2F6dHRwcmVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzOTU1MTAsImV4cCI6MjEwNDk3MTUxMH0.qiisQD33d_q9GAWc53CWhRfDkRgvt07DSp5IikwuESA",
);

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
    return res.status(405).json({ error: "Method not allowed" });
  }

  // รองรับทั้งแบบส่ง messages มาเป็นอาเรย์ หรือส่ง userMessage มาเดี่ยวๆ
  const { messages, userMessage, sessionId } = req.body;
  const currentInput =
    userMessage ||
    (messages && messages[messages.length - 1]?.content) ||
    "สวัสดี";

  try {
    // ใช้ fetch ตรงแบบเดียวกับ device-duplex เพื่อความเสถียรบน Vercel
    const response = await fetch(
      "https://gen.ai.kku.ac.th/iccsacth/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.ICCS_API_KEY || "sk_lC6DpEEqWK8BEbbjfMY4fhnw3IcwN4hrlR7M31g1xiPP6kdcLfrJv4hveT6hYHmu"}`,
        },
        body: JSON.stringify({
          model: "gemini-3.1-pro-preview", // ใช้โมเดลตัวเดียวกับ device-duplex ที่ใช้งานได้ชัวร์
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...(messages || [{ role: "user", content: currentInput }]),
          ],
          stream: false,
        }),
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`KKU API Error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const rawContent = data.choices[0]?.message?.content || "{}";

    // แกะ JSON ที่ AI ตอบกลับมา
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    let parsedData = {
      reply: rawContent.replace(/```json|```/g, "").trim(),
      assessment: null,
    };

    if (jsonMatch) {
      try {
        parsedData = JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.warn("JSON Parse Error, using raw text");
      }
    }

    // บันทึกประวัติลง Supabase (ไม่ให้บล็อกการส่งคำตอบถ้าฐานข้อมูลมีปัญหา)
    try {
      await supabase.from("chat_history").insert([
        {
          session_id: sessionId || "anonymous",
          sender_role: "user",
          message_content: currentInput,
        },
        {
          session_id: sessionId || "anonymous",
          sender_role: "assistant",
          message_content: parsedData.reply || rawContent,
          primary_condition:
            parsedData.assessment?.primaryCondition || "Normal",
          severity: parsedData.assessment?.severity || "Normal",
          requires_emergency: parsedData.assessment?.requiresEmergency || false,
        },
      ]);
    } catch (dbError) {
      console.error("Supabase Error:", dbError);
    }

    // ส่งผลลัพธ์กลับไปให้หน้าเว็บ MindMate
    return res.status(200).json(parsedData);
  } catch (error) {
    console.error("API Handler Error:", error);
    return res.status(500).json({
      reply: "ขออภัยครับ เหมือนสัญญาณการเชื่อมต่อจะมีปัญหาเล็กน้อย",
      error: error.message,
    });
  }
}

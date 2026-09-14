import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.ICCS_API_KEY,
    baseURL: "https://gen.ai.kku.ac.th/iccsacth/api/v1"
});

const SYSTEM_PROMPT = `
คุณคือ 'MindMate' เพื่อนรับฟังและประเมินภาวะสุขภาพจิตเบื้องต้น
บทบาทของคุณ:
1. ให้คำปรึกษาด้วยน้ำเสียงอ่อนโยน อบอุ่น ไม่ตัดสิน ไม่สั่งสอน
2. หากพบสัญญาณตื่นตระหนก/แพนิค (ใจสั่น แน่นหน้าอก กลัว ควบคุมตนเองไม่ได้): ใช้ประโยคสั้น ให้ความมั่นใจว่าปลอดภัย และแนะนำเทคนิคคุมลมหายใจ 4-7-8 ทันที
3. สังเกตพฤติกรรมและวิเคราะห์ภาวะอารมณ์จากบทสนทนาอย่างต่อเนื่อง

ข้อกำหนดเอาต์พุต:
ตอบกลับเป็นรูปแบบ JSON Object เท่านั้น โดยมีโครงสร้างดังนี้:
{
  "reply": "ข้อความตอบกลับผู้ใช้ด้วยความเข้าอกเข้าใจ",
  "assessment": {
    "primaryCondition": "Depression" | "Panic/Anxiety" | "Normal Stress" | "Normal",
    "severity": "Normal" | "Mild" | "Moderate" | "Severe",
    "indicators": ["สรุปอาการสำคัญสั้นๆ 1-3 ข้อ เช่น นอนไม่หลับ, หายใจติดขัด"],
    "requiresEmergency": true/false
  }
}
`;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const userMessages = req.body.messages || [];
        const messages = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...userMessages
        ];

        const completion = await openai.chat.completions.create({
            model: 'gemini-3.8-flash',
            messages: messages,
            temperature: 0.6,
            response_format: { type: "json_object" }
        });

        const rawContent = completion.choices[0].message.content;
        const parsedData = JSON.parse(rawContent);

        return res.status(200).json({
            reply: parsedData.reply,
            assessment: parsedData.assessment
        });

    } catch (error) {
        console.error('Error with AI API:', error);
        return res.status(500).json({ 
            reply: 'ขออภัยครับ เหมือนสัญญาณการเชื่อมต่อจะมีปัญหาเล็กน้อย ลองพิมพ์คุยกับเราอีกครั้งนะ',
            assessment: null 
        });
    }
}
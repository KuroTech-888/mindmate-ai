const { OpenAI } = require('openai');

export default async function handler(req, res) {
    // รับเฉพาะ request แบบ POST เท่านั้น
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // ดึงคีย์จากระบบของ Vercel (ซ่อนคีย์ได้อย่างปลอดภัย)
    const apiKey = process.env.ICCS_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'Server configuration error: Missing API Key' });
    }

    const openai = new OpenAI({
        apiKey: apiKey,
        baseURL: 'https://gen.ai.kku.ac.th/iccsacth/api/v1' 
    });

    const SYSTEM_PROMPT = `
คุณคือ 'MindMate' แชทบอทเพื่อนรับฟังและให้กำลังใจเชิงจิตวิทยาเบื้องต้น
หน้าที่ของคุณ:
1. รับฟังอย่างเข้าอกเข้าใจ (Empathy) ไม่ตัดสิน และใช้น้ำเสียงที่อบอุ่น เป็นกันเอง
2. วิเคราะห์แนวโน้มอารมณ์จากบทสนทนา (ความเครียด, วิตกกังวล, อาการแพนิค หรือสัญญาณซึมเศร้า)
3. คอยรับฟังปัญหาและค่อยๆ แนะนำทางออกเชิงบวกเบื้องต้น
4. ห้ามวินิจฉัยโรคเด็ดขาด หากพบคำพูดที่สื่อถึงการทำร้ายตัวเอง ให้อ่อนโยนลง แสดงความห่วงใย และแนะนำให้ติดต่อสายด่วนสุขภาพจิต 1323 ทันที
    `;

    try {
        const userMessages = req.body.messages || [];
        const messages = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...userMessages
        ];

        // เรียกใช้งานโมเดล AI ของนักศึกษา
        const completion = await openai.chat.completions.create({
            model: 'gemini-3.8-flash', // สามารถเปลี่ยนเป็น gemini-3.8-flash ได้
            messages: messages,
            temperature: 0.7,
        });

        const reply = completion.choices[0].message.content;
        res.status(200).json({ reply: reply });

    } catch (error) {
        console.error('Error with AI API:', error);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเชื่อมต่อกับระบบ' });
    }
}
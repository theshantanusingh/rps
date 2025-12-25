require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function listModels() {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // dummy
        // Actually the SDK doesn't expose listModels directly on the instance, 
        // we need to check documentation or use a specific method if available or just raw fetch.
        // Wait, the error message says "Call ListModels".
        // I can try to make a raw request or assume the key is for a specific restricted set.

        // Let's try 'gemini-pro' just to see if it works.
        const pro = genAI.getGenerativeModel({ model: "gemini-pro" });
        const result = await pro.generateContent("Hello");
        console.log("gemini-pro works:", result.response.text());
    } catch (e) {
        console.error("gemini-pro failed:", e.message);
    }

    try {
        const flash = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await flash.generateContent("Hello");
        console.log("gemini-1.5-flash works:", result.response.text());
    } catch (e) {
        console.error("gemini-1.5-flash failed:", e.message);
    }
}

listModels();

require("dotenv").config();

async function testGemini() {

    const { GoogleGenAI } = await import("@google/genai");

    const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY
    });

    const schema = `
Database: products

Table: products
Columns:
- id INTEGER
- name TEXT
- price REAL
`;

    const question = "Show me all products cheaper than 5000";

    const prompt = `
You are an SQL assistant.

Here is the database schema:

${schema}

User question:
${question}

Generate the SQL query needed to answer the question.

Rules:
- Return ONLY the SQL query.
- Do not use markdown.
- Do not explain anything.
`;

    const response = await ai.models.generateContent({
        model: "gemini-3.5-flash-lite",
        contents: prompt
    });

    console.log("Generated SQL:");
    console.log(response.text);
}

testGemini();
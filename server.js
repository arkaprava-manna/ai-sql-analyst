require("dotenv").config();
const express = require("express");
const db = require("./database");

const app = express();

function isSafeSQL(sql) {
    const query = sql.trim().toLowerCase();
    if (!query.startsWith("select")) {
        return false;
    }
    const forbiddenWords = [
        "drop", "delete", "update", "insert", 
        "alter", "create", "replace"
    ];
    for (const word of forbiddenWords) {
        if (query.includes(word)) {
            return false;
        }
    }
    return true;
}

const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.static("public"));

// Test API
app.get("/api/products", (req, res) => {
    const sql = "SELECT * FROM products";
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error(err.message);
            return res.status(500).json({ error: "Database error" });
        }
        res.json(rows);
    });
});

// Ask API
app.post("/api/ask", async (req, res) => {
    const question = req.body.question?.trim();
    if (!question) {
        return res.status(400).json({ error: "Question cannot be empty" });
    }
    console.log("User asked:", question);

    try {
        // Import Gemini
        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({
            apiKey: process.env.GEMINI_API_KEY
        });

        // Database schema
        const schema = `
Database: ecommerce

Table: products
- id INTEGER PRIMARY KEY
- name TEXT
- category TEXT
- brand TEXT
- price REAL (in INR)
- rating REAL (out of 5.0)
- ram_gb INTEGER
- storage_gb INTEGER
- delivery_days INTEGER
`;

        // Prompt for Gemini to generate SQL
        const prompt = `
You are an SQL assistant.
Your job is to convert the user's natural language question into a SQLite SQL query.

Database schema:
${schema}

User question:
${question}

Rules:
- Return ONLY the SQL query.
- Do not use markdown.
- Do not explain anything.
- Only generate SELECT queries.
- Do not generate INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, or other modification queries.
- IMPORTANT: Use case-insensitive matching for text columns (e.g., use LOWER(column_name) = 'value' or LIKE '%value%').
`;

        // 1. Ask Gemini for SQL
        const response = await ai.models.generateContent({
            model: "gemini-3.5-flash-lite",
            contents: prompt
        });

        let sql = response.text.trim();
        console.log("Generated SQL:", sql);

        // Remove markdown code fences if Gemini adds them
        sql = sql
            .replace(/^```sql\s*/i, "")
            .replace(/^```\s*/i, "")
            .replace(/\s*```$/i, "")
            .trim();

        // Validate SQL
        if (!isSafeSQL(sql)) {
            return res.status(400).json({
                error: "Generated SQL was rejected for safety reasons."
            });
        }

        console.log("Executing SQL:", sql);

        // 2. Execute SQL
        db.all(sql, [], async (err, rows) => { // <-- Note the 'async' added here
            if (err) {
                console.error("SQL error:", err.message);
                return res.status(500).json({ error: "SQL execution failed." });
            }

            try {
                // 3. UPGRADED: Ask Gemini for an explanation AND chart configuration
                const analysisPrompt = `
                The user asked: "${question}"
                The database returned this SQL result: ${JSON.stringify(rows)}
                
                Analyze this data and return ONLY a valid JSON object with exactly these keys:
                - "explanation": A 1-2 sentence plain-English explanation of the result.
                - "chartType": String. Either "bar", "pie", or "none" (use "none" if the data is just a single number or text that doesn't make sense as a chart).
                - "chartLabels": Array of strings for the X-axis (e.g., ["Laptop", "Monitor"]). Empty array if no chart.
                - "chartValues": Array of numbers for the Y-axis (e.g., [50000, 15000]). Empty array if no chart.
                
                Do not include any markdown formatting, backticks, or code blocks. Return ONLY the raw JSON object.
                `;

                const analysisResponse = await ai.models.generateContent({
                    model: "gemini-3.5-flash-lite",
                    contents: analysisPrompt
                });

                let analysisText = analysisResponse.text.trim();
                // Clean up any stray markdown just in case
                analysisText = analysisText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
                
                const analysisData = JSON.parse(analysisText);

                // 4. Send everything to frontend
                res.json({
                    type: "table",
                    sql: sql,
                    answer: rows,
                    explanation: analysisData.explanation,
                    chartType: analysisData.chartType,
                    chartLabels: analysisData.chartLabels,
                    chartValues: analysisData.chartValues
                });

                

            } catch (analysisError) {
                console.error("Analysis Error:", analysisError);
                // Fallback response if the explanation fails
                res.json({
                    type: "table",
                    sql: sql,
                    answer: rows,
                    explanation: "Here is the data we found."
                });
            }
        });

    } catch (error) {
        console.error("Gemini error:", error);
        res.status(500).json({ error: "AI processing failed." });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
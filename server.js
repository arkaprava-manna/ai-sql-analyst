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
        "drop",
        "delete",
        "update",
        "insert",
        "alter",
        "create",
        "replace"
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

            return res.status(500).json({
                error: "Database error"
            });
        }

        res.json(rows);

    });

});

// Ask API
app.post("/api/ask", async (req, res) => {

    const question = req.body.question?.trim();

    if (!question) {
        return res.status(400).json({
            error: "Question cannot be empty"
        });
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
Database: products

Table: products

Columns:
- id INTEGER PRIMARY KEY
- name TEXT
- price REAL
`;

        // Prompt for Gemini
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
`;

        // Ask Gemini
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

        // Execute SQL
        db.all(sql, [], (err, rows) => {

            if (err) {

                console.error("SQL error:", err.message);

                return res.status(500).json({
                    error: "SQL execution failed."
                });

            }

            res.json({
                type: "table",
                sql: sql,
                answer: rows
            });

        });

    } catch (error) {

        console.error("Gemini error:", error);

        res.status(500).json({
            error: "AI processing failed."
        });

    }

});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
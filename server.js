require("dotenv").config();
const express = require("express");
const db = require("./database");
const multer = require("multer");
const csv = require("csv-parser");
const fs = require("fs");

const app = express();
const PORT = 3000;

const upload = multer({ dest: "uploads/" });
let customTableSchema = "";

function isSafeSQL(sql) {
    const query = sql.trim().toLowerCase();
    if (!query.startsWith("select")) return false;
    const forbiddenWords = ["drop", "delete", "update", "insert", "alter", "create", "replace"];
    for (const word of forbiddenWords) {
        if (query.includes(word)) return false;
    }
    return true;
}

app.use(express.json());
app.use(express.static("public"));

// ==========================================
// CSV UPLOAD ROUTE
// ==========================================
app.post("/api/upload", upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const results = [];
    const headers = [];

    fs.createReadStream(req.file.path)
        .pipe(csv({
            // FIX 1: Strip hidden BOM characters that break SQLite column names
            mapHeaders: ({ header }) => header.trim().replace(/^\uFEFF/, '') 
        }))
        .on("headers", (headerList) => {
            headers.push(...headerList);
        })
        .on("data", (data) => results.push(data))
        .on("end", () => {
            if (headers.length === 0) return res.status(400).json({ error: "Empty CSV file" });

            db.run(`DROP TABLE IF EXISTS custom_data`, () => {
                const columnsDef = headers.map(h => `"${h}" TEXT`).join(", ");
                db.run(`CREATE TABLE custom_data (id INTEGER PRIMARY KEY AUTOINCREMENT, ${columnsDef})`, (err) => {
                    if (err) return res.status(500).json({ error: "Failed to create dynamic table" });

                    const placeholders = headers.map(() => "?").join(", ");
                    const insertStmt = db.prepare(`INSERT INTO custom_data (${headers.map(h => `"${h}"`).join(", ")}) VALUES (${placeholders})`);

                    results.forEach(row => {
                        const values = headers.map(h => row[h]);
                        insertStmt.run(values);
                    });
                    insertStmt.finalize();

                    customTableSchema = `\nTable: custom_data\nColumns:\n- id INTEGER PRIMARY KEY\n` + headers.map(h => `- ${h} TEXT`).join("\n");

                    fs.unlinkSync(req.file.path);
                    res.json({ message: "File processed and database updated successfully!" });
                });
            });
        });
});

// ==========================================
// ASK ROUTE
// ==========================================
app.post("/api/ask", async (req, res) => {
    const question = req.body.question?.trim();
    if (!question) return res.status(400).json({ error: "Question cannot be empty" });

    console.log("User asked:", question);

    try {
        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

        const schema = `
Database: ecommerce
Table: products
- id INTEGER PRIMARY KEY
- name TEXT
- category TEXT
- brand TEXT
- price REAL
- rating REAL
- ram_gb INTEGER
- storage_gb INTEGER
- delivery_days INTEGER
${customTableSchema}
`;

        // FIX 2: Explicitly tell Gemini to use the custom_data table for uploaded files
        const prompt = `
You are an SQL assistant.

Database schema:
${schema}

CRITICAL INSTRUCTION: If the user asks a question about their uploaded file, the data is located inside the 'custom_data' table. You MUST query the 'custom_data' table.

User question:
${question}

Rules:
- Return ONLY the SQL query.
- Do not use markdown.
- Do not explain anything.
- Only generate SELECT queries.
- Do not generate INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, or other modification queries.
- IMPORTANT: Use case-insensitive matching for text columns (e.g., use LOWER(column_name) = 'value').
`;

        const response = await ai.models.generateContent({
            model: "gemini-3.5-flash-lite",
            contents: prompt
        });

        let sql = response.text.trim();
        sql = sql.replace(/^```sql\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

        if (!isSafeSQL(sql)) {
            return res.status(400).json({ error: "Generated SQL was rejected for safety reasons." });
        }

        

        console.log("Executing SQL:", sql);

        // ==========================================
        // NEW: SELF-HEALING EXECUTION LOOP
        // ==========================================
        const executeSQL = (currentSql, attempt = 1) => {
            db.all(currentSql, [], async (err, rows) => {
                
                // 1. IF THERE IS AN ERROR
                if (err) {
                    console.error(`[Attempt ${attempt}] SQL error:`, err.message);
                    
                    // If it is the first attempt, try to heal it!
                    if (attempt === 1) {
                        console.log("Initiating AI Self-Healing...");
                        try {
                            const healingPrompt = `
                            You generated a SQLite query that failed to execute.
                            
                            User's Goal: "${question}"
                            
                            Failed Query:
                            ${currentSql}
                            
                            SQLite Error Message:
                            ${err.message}
                            
                            Database schema:
                            ${schema}
                            
                            Fix the SQL query so it works correctly.
                            - Return ONLY the corrected SQL query.
                            - Do not use markdown or backticks.
                            - Only generate SELECT queries.
                            `;
                            
                            const healResponse = await ai.models.generateContent({
                                model: "gemini-3.5-flash-lite",
                                contents: healingPrompt
                            });

                            let fixedSql = healResponse.text.trim();
                            fixedSql = fixedSql.replace(/^```sql\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

                            if (!isSafeSQL(fixedSql)) {
                                return res.status(400).json({ error: "Healed SQL was rejected for safety reasons." });
                            }

                            console.log("Executing Healed SQL:", fixedSql);
                            // Retry the execution with the fixed SQL, marking it as attempt #2
                            return executeSQL(fixedSql, 2);
                            
                        } catch (healError) {
                            console.error("Self-healing failed:", healError);
                            return res.json({ type: "error", sql: currentSql, answer: `Database Error: ${err.message}` });
                        }
                    }
                    
                    // If we already tried healing and it STILL failed, return the error to the user
                    return res.json({ 
                        type: "error", 
                        sql: currentSql, 
                        answer: `SQLite Database Error (After Healing Attempt): ${err.message}` 
                    });
                }

                // 2. IF EXECUTION IS SUCCESSFUL
                try {
                    const analysisPrompt = `
                    The user asked: "${question}"
                    The database returned this SQL result: ${JSON.stringify(rows)}
                    
                    Analyze this data and return ONLY a valid JSON object with exactly these keys:
                    - "explanation": A 1-2 sentence plain-English explanation of the result.
                    - "chartType": String. Either "bar", "pie", or "none".
                    - "chartLabels": Array of strings for the X-axis. Empty array if no chart.
                    - "chartValues": Array of numbers for the Y-axis. Empty array if no chart.
                    
                    Do not include any markdown formatting. Return ONLY the raw JSON object.
                    `;

                    const analysisResponse = await ai.models.generateContent({
                        model: "gemini-3.5-flash-lite",
                        contents: analysisPrompt
                    });

                    let analysisText = analysisResponse.text.trim();
                    analysisText = analysisText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
                    const analysisData = JSON.parse(analysisText);

                    res.json({
                        type: "table",
                        sql: currentSql, // Send back the working SQL (whether it was the 1st or 2nd attempt)
                        answer: rows,
                        explanation: analysisData.explanation,
                        chartType: analysisData.chartType,
                        chartLabels: analysisData.chartLabels,
                        chartValues: analysisData.chartValues
                    });

                } catch (analysisError) {
                    console.error("Analysis Error:", analysisError);
                    res.json({
                        type: "table",
                        sql: currentSql,
                        answer: rows,
                        explanation: "Here is the data we found."
                    });
                }
            });
        };

        // Start the first execution attempt
        executeSQL(sql, 1);

    } catch (error) {
        console.error("Gemini error:", error);
        res.status(500).json({ error: "AI processing failed." });
    }
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
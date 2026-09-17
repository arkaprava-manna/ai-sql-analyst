const express = require("express");
const db = require("./database");

const app = express();

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
app.post("/api/ask", (req, res) => {

    const question = req.body.question?.trim().toLowerCase();

    if (!question) {
        return res.status(400).json({
            error: "Question cannot be empty"
        });
    }

    console.log("User asked:", question);

    // 1. Count products
    if (
        question.includes("how many products") ||
        question.includes("number of products")
    ) {

        const sql = "SELECT COUNT(*) AS total FROM products";

        db.get(sql, [], (err, row) => {

            if (err) {
                console.error(err.message);

                return res.status(500).json({
                    error: "Database error"
                });
            }

            res.json({
                type: "text",
                answer: `There are ${row.total} products in the database.`
            });

        });

    }

    // 2. Show all products
    else if (
        question.includes("show all products") ||
        question.includes("list all products") ||
        question.includes("display all products")
    ) {

        const sql = "SELECT * FROM products";

        db.all(sql, [], (err, rows) => {

            if (err) {
                console.error(err.message);

                return res.status(500).json({
                    error: "Database error"
                });
            }

            res.json({
                type: "table",
                answer: rows
            });

        });

    }

    // 3. Show products cheaper than a dynamic price
    else if (question.includes("cheaper than")) {

        const priceMatch = question.match(/cheaper than\s+(\d+(?:\.\d+)?)/);

        if (!priceMatch) {
            return res.json({
                type: "text",
                answer: "Please specify a valid price."
            });
        }

        const price = Number(priceMatch[1]);

        const sql = "SELECT * FROM products WHERE price < ?";

        db.all(sql, [price], (err, rows) => {

            if (err) {
                console.error(err.message);

                return res.status(500).json({
                    error: "Database error"
                });
            }

            res.json({
                type: "table",
                answer: rows
            });

        });

    }

    // 4. Unknown question
    else {

        res.json({
            type: "text",
            answer: "I don't understand this question yet."
        });

    }

});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
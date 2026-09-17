const questionInput = document.getElementById("question");

const analyzeButton = document.getElementById("analyzeBtn");

const result = document.getElementById("result");


// Allow pressing Enter to submit
questionInput.addEventListener("keydown", (event) => {

    if (event.key === "Enter") {
        analyzeButton.click();
    }

});


// Analyze button
analyzeButton.addEventListener("click", async () => {

    const question = questionInput.value.trim();

    if (!question) {
        result.textContent = "Please enter a question.";
        return;
    }

    result.textContent = "Analyzing...";

    try {

        const response = await fetch("/api/ask", {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                question: question
            })

        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Something went wrong");
        }

        // Display table results
        if (data.type === "table") {

            if (data.answer.length === 0) {

                result.textContent = "No products found.";

                return;
            }

            const table = document.createElement("table");

            table.innerHTML = `
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Name</th>
                        <th>Price</th>
                    </tr>
                </thead>
                <tbody></tbody>
            `;

            const tbody = table.querySelector("tbody");

            data.answer.forEach((product) => {

                const row = document.createElement("tr");

                const idCell = document.createElement("td");
                idCell.textContent = product.id;

                const nameCell = document.createElement("td");
                nameCell.textContent = product.name;

                const priceCell = document.createElement("td");
                priceCell.textContent = `₹${product.price}`;

                row.appendChild(idCell);
                row.appendChild(nameCell);
                row.appendChild(priceCell);

                tbody.appendChild(row);

            });

            result.replaceChildren(table);

        }

        // Display text results
        else {

            result.textContent = data.answer;

        }

    } catch (error) {

        console.error(error);

        result.textContent = "Error: " + error.message;

    }

});
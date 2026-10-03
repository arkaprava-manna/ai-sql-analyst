const questionInput = document.getElementById("question");

const analyzeButton = document.getElementById("analyzeBtn");

const result = document.getElementById("result");

const sqlDisplay = document.getElementById("sql");

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
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        question: question,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Something went wrong");
    }

    if (data.sql) {
      sqlDisplay.textContent = data.sql;
    } else {
      sqlDisplay.textContent = "No SQL query generated.";
    }

    // Display table results
    if (data.type === "table") {
      if (data.answer.length === 0) {
        result.textContent = "No results found.";
        return;
      }

      const table = document.createElement("table");

      // Get column names from the first result
      const columns = Object.keys(data.answer[0]);

      // Create table header
      const thead = document.createElement("thead");
      const headerRow = document.createElement("tr");

      columns.forEach((column) => {
        const th = document.createElement("th");

        th.textContent = column;

        headerRow.appendChild(th);
      });

      thead.appendChild(headerRow);
      table.appendChild(thead);

      // Create table body
      const tbody = document.createElement("tbody");

      data.answer.forEach((row) => {
        const tr = document.createElement("tr");

        columns.forEach((column) => {
          const td = document.createElement("td");

          td.textContent = row[column];

          tr.appendChild(td);
        });

        tbody.appendChild(tr);
      });

      table.appendChild(tbody);

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

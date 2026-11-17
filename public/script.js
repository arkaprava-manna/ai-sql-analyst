const questionInput = document.getElementById("question");
const analyzeButton = document.getElementById("analyzeBtn");
const result = document.getElementById("result");
const sqlDisplay = document.getElementById("sql");
const historyList = document.getElementById("historyList");
const newQueryBtn = document.getElementById("newQueryBtn");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");
const themeToggleBtn = document.getElementById("themeToggleBtn");
const toggleIcon = document.getElementById("toggleIcon");
const toggleText = document.getElementById("toggleText");

let currentChart = null;

const uploadIconBtn = document.getElementById("uploadIconBtn");
const csvFileInput = document.getElementById("csvFileInput");
const uploadStatus = document.getElementById("uploadStatus");

// Trigger the hidden file input when the + button is clicked
uploadIconBtn.addEventListener("click", () => {
    csvFileInput.click();
});

// Show the selected file name when the user picks a file
// Auto-upload the file to the backend when selected
csvFileInput.addEventListener("change", async () => {
    if (csvFileInput.files.length > 0) {
        const file = csvFileInput.files[0];
        
        uploadStatus.textContent = `⏳ Uploading and analyzing ${file.name}...`;
        uploadStatus.style.color = "var(--text-secondary)";

        // Package the file for sending
        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await fetch("/api/upload", {
                method: "POST",
                body: formData
            });

            const data = await res.json();
            
            if (res.ok) {
                uploadStatus.textContent = `✅ Success! ${file.name} is ready to query. Try asking a question about it!`;
                uploadStatus.style.color = "#10b981"; // Success green
            } else {
                throw new Error(data.error);
            }
        } catch (err) {
            uploadStatus.textContent = `❌ Error: ${err.message}`;
            uploadStatus.style.color = "#ef4444"; // Error red
        }
    }
});

// ==========================================
// 1. THEME TOGGLE LOGIC (Capsule Button)
// ==========================================
if (localStorage.getItem("theme") === "dark") {
    document.body.classList.add("dark-mode");
    toggleIcon.textContent = "☀️";
    toggleText.textContent = "Light";
}

themeToggleBtn.addEventListener("click", () => {
    document.body.classList.toggle("dark-mode");
    
    if (document.body.classList.contains("dark-mode")) {
        localStorage.setItem("theme", "dark");
        toggleIcon.textContent = "☀️";
        toggleText.textContent = "Light";
    } else {
        localStorage.setItem("theme", "light");
        toggleIcon.textContent = "🌙";
        toggleText.textContent = "Dark";
    }
});

// ==========================================
// 2. HISTORY LOGIC (LocalStorage)
// ==========================================
let queryHistory = JSON.parse(localStorage.getItem("sqlHistory")) || [];

function renderHistory() {
    historyList.innerHTML = "";
    queryHistory.forEach((item, index) => {
        const li = document.createElement("li");
        li.className = "history-item";
        li.textContent = item.question;
        li.onclick = () => loadHistoryItem(index);
        historyList.appendChild(li);
    });
}
renderHistory();

function loadHistoryItem(index) {
    const data = queryHistory[index];
    questionInput.value = data.question;
    document.getElementById("chartCanvas").style.display = "none";
    renderUI(data);
}

newQueryBtn.addEventListener("click", () => {
    questionInput.value = "";
    sqlDisplay.textContent = "SQL query will appear here.";
    result.innerHTML = "Your answer will appear here.";
    if (currentChart) {
        currentChart.destroy();
        currentChart = null;
    }
    document.getElementById("chartCanvas").style.display = "none";
});

clearHistoryBtn.addEventListener("click", () => {
    queryHistory = [];
    localStorage.removeItem("sqlHistory");
    renderHistory();
});

// ==========================================
// 3. UI RENDERING LOGIC
// ==========================================
function renderUI(data) {
    if (data.sql) {
        sqlDisplay.textContent = data.sql;
    } else {
        sqlDisplay.textContent = "No SQL query generated.";
    }

    if (data.type === "table") {
        result.innerHTML = "";

        if (data.explanation) {
            const explanationText = document.createElement("p");
            explanationText.style.fontWeight = "600";
            explanationText.style.marginBottom = "15px";
            explanationText.style.color = "var(--text-primary)";
            explanationText.textContent = data.explanation;
            result.appendChild(explanationText);
        }

        if (!data.answer || data.answer.length === 0) {
            const noResults = document.createElement("p");
            noResults.textContent = "No results found.";
            result.appendChild(noResults);
            
            if (currentChart) currentChart.destroy();
            document.getElementById("chartCanvas").style.display = "none";
            return;
        }

        const table = document.createElement("table");
        const columns = Object.keys(data.answer[0]);
        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");

        columns.forEach((column) => {
            const th = document.createElement("th");
            th.textContent = column;
            headerRow.appendChild(th);
        });

        thead.appendChild(headerRow);
        table.appendChild(thead);

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
        result.appendChild(table);

        if (currentChart) currentChart.destroy();

        const canvas = document.getElementById("chartCanvas");
        if (data.chartType && data.chartType !== "none" && data.chartLabels && data.chartValues) {
            canvas.style.display = "block";
            const ctx = canvas.getContext("2d");
            
            const isDark = document.body.classList.contains("dark-mode");
            const backgroundColor = data.chartType === 'pie' 
                ? ['#6366f1', '#38bdf8', '#fbbf24', '#f43f5e', '#a855f7', '#34d399'] 
                : 'rgba(99, 102, 241, 0.6)';
            const borderColor = data.chartType === 'pie'
                ? (isDark ? '#111827' : '#ffffff')
                : '#6366f1';

            currentChart = new Chart(ctx, {
                type: data.chartType,
                data: {
                    labels: data.chartLabels,
                    datasets: [{
                        label: 'Data',
                        data: data.chartValues,
                        backgroundColor: backgroundColor,
                        borderColor: borderColor,
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { display: data.chartType === 'pie', labels: { color: isDark ? '#9ca3af' : '#4b5563' } } },
                    scales: {
                        y: { 
                            display: data.chartType !== 'pie', 
                            beginAtZero: true,
                            grid: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
                            ticks: { color: isDark ? '#9ca3af' : '#6b7280' }
                        },
                        x: { 
                            display: data.chartType !== 'pie',
                            grid: { display: false },
                            ticks: { color: isDark ? '#9ca3af' : '#6b7280' }
                        }
                    }
                }
            });
        } else {
            canvas.style.display = "none";
        }
    } else {
        result.textContent = data.answer;
    }
}

// ==========================================
// 4. API CALL LOGIC
// ==========================================
questionInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") analyzeButton.click();
});

analyzeButton.addEventListener("click", async () => {
    const question = questionInput.value.trim();

    if (!question) {
        result.textContent = "Please enter a question.";
        return;
    }

    result.textContent = "Analyzing data...";
    document.getElementById("chartCanvas").style.display = "none";

    try {
        const response = await fetch("/api/ask", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question: question }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Something went wrong");
        }

        data.question = question; 
        renderUI(data);

        queryHistory = queryHistory.filter(item => item.question.toLowerCase() !== question.toLowerCase());
        queryHistory.unshift(data);
        if (queryHistory.length > 15) queryHistory.pop(); 
        
        localStorage.setItem("sqlHistory", JSON.stringify(queryHistory));
        renderHistory();

    } catch (error) {
        console.error(error);
        result.textContent = "Error: " + error.message;
    }
});
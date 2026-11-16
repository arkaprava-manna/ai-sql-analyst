const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("ecommerce.db", (err) => {
    if (err) {
        console.error("Database connection failed:", err.message);
    } else {
        console.log("Smart E-commerce Database connected successfully!");
    }
});

db.serialize(() => {
    // Drop the old table if it exists so we can rebuild it with new columns
    db.run(`DROP TABLE IF EXISTS products`);

    // Create the new spec-heavy products table
    db.run(`
        CREATE TABLE products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            brand TEXT NOT NULL,
            price REAL NOT NULL,
            rating REAL,
            ram_gb INTEGER,
            storage_gb INTEGER,
            delivery_days INTEGER
        )
    `);

    // Populate with realistic data
    console.log("Populating database with smart catalog data...");
    
    const products = [
        ['MacBook Air M2', 'Laptop', 'Apple', 95000, 4.8, 8, 256, 2],
        ['MacBook Pro M3', 'Laptop', 'Apple', 145000, 4.9, 16, 512, 3],
        ['Dell Inspiron 15', 'Laptop', 'Dell', 45000, 4.1, 8, 512, 1],
        ['Dell XPS 13', 'Laptop', 'Dell', 110000, 4.6, 16, 512, 4],
        ['HP Pavilion', 'Laptop', 'HP', 55000, 4.2, 16, 512, 1],
        ['HP Envy x360', 'Laptop', 'HP', 75000, 4.5, 16, 1024, 2],
        ['Lenovo ThinkPad', 'Laptop', 'Lenovo', 85000, 4.7, 16, 512, 2],
        ['Lenovo IdeaPad', 'Laptop', 'Lenovo', 35000, 3.9, 8, 256, 5],
        ['iPhone 15', 'Smartphone', 'Apple', 75000, 4.7, 6, 128, 1],
        ['Samsung Galaxy S24', 'Smartphone', 'Samsung', 80000, 4.6, 8, 256, 2],
        ['OnePlus 12R', 'Smartphone', 'OnePlus', 40000, 4.4, 8, 128, 1],
        ['Pixel 8a', 'Smartphone', 'Google', 45000, 4.3, 8, 128, 3]
    ];

    const stmt = db.prepare(`
        INSERT INTO products (name, category, brand, price, rating, ram_gb, storage_gb, delivery_days) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    products.forEach(p => stmt.run(p));
    stmt.finalize();
});

module.exports = db;
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const db = new sqlite3.Database('clients.db', (err) => {
    if (err) {
        console.error('Ошибка подключения к базе данных:', err.message);
        process.exit(1);
    }
    console.log('Подключено к базе данных SQLite');
});

// Инициализация базы данных
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS clients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE,
            name TEXT,
            product TEXT,
            price REAL,
            profit REAL,
            visits INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            qr_image TEXT
        )
    `);
    // Создаем индекс для ускорения поиска по коду клиента
    db.run('CREATE INDEX IF NOT EXISTS idx_clients_code ON clients(code)');
    db.run('CREATE INDEX IF NOT EXISTS idx_clients_product ON clients(product)');
});

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'html');

// Генерация уникального кода клиента
function generateClientCode() {
    return uuidv4().substring(0, 8).toUpperCase();
}

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Маршрут для добавления клиента
app.post('/add-client', async (req, res) => {
    const { name, product, price } = req.body;
    
    if (!name || !product || !price) {
        console.error('Попытка добавления клиента без имени');
        return res.status(400).json({ error: 'Имя клиента обязательно' });
    }

    const code = generateClientCode();
    const qrImage = await QRCode.toDataURL(code);

    const profit = price * 0.1; // 10% от стоимости
    
    db.run(
        'INSERT INTO clients (code, name, product, price, profit, qr_image) VALUES (?, ?, ?, ?, ?, ?)',
        [code, name, product, price, profit, qrImage],
        function(err) {
            if (err) {
                console.error('Ошибка при добавлении клиента:', err);
                return res.status(500).json({ error: 'Ошибка базы данных' });
            }
            console.log(`Добавлен новый клиент: ${name} (${code})`);
            res.json({ code, qrImage });
        }
    );
});

// Маршрут для проверки клиента
app.get('/check-client/:code', (req, res) => {
    const { code } = req.params;

    db.get(
        'SELECT name, product, price, profit, visits FROM clients WHERE code = ?',
        [code],
        (err, row) => {
            if (err || !row) {
                console.error('Клиент не найден:', code);
                return res.json({ error: 'Клиент не найден' });
            }

            // Увеличиваем счетчик посещений
            db.run(
                'UPDATE clients SET visits = visits + 1 WHERE code = ?',
                [code],
                (err) => {
                    if (err) {
                        console.error('Ошибка при обновлении счетчика посещений:', err);
                    }
                }
            );

            console.log(`Проверен клиент: ${row.name} (${code}), посещений: ${row.visits + 1}`);
            res.json({
                name: row.name,
                product: row.product,
                price: row.price,
                profit: row.profit,
                visits: row.visits + 1
            });
        }
    );
});

// Маршрут для получения списка клиентов
app.get('/clients', (req, res) => {
    db.all('SELECT id, code, name, product, price, profit, visits, created_at FROM clients ORDER BY created_at DESC', 
        (err, rows) => {
            if (err) {
                console.error('Ошибка при получении списка клиентов:', err);
                return res.status(500).json({ error: 'Ошибка базы данных' });
            }
            console.log('Запрошен список клиентов, найдено:', rows.length);
            res.json(rows);
        }
    );
});

// Старт сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});

// Закрытие соединения с БД при завершении
process.on('SIGINT', () => {
    db.close();
    process.exit();
});

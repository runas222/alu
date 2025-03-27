const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const db = new sqlite3.Database('clients.db');

// Инициализация базы данных
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS clients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE,
            name TEXT,
            visits INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            qr_image TEXT
        )
    `);
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
    const { name } = req.body;
    
    if (!name) {
        return res.status(400).json({ error: 'Имя клиента обязательно' });
    }

    const code = generateClientCode();
    const qrImage = await QRCode.toDataURL(code);

    db.run(
        'INSERT INTO clients (code, name, qr_image) VALUES (?, ?, ?)',
        [code, name, qrImage],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Ошибка базы данных' });
            }
            res.json({ code, qrImage });
        }
    );
});

// Маршрут для проверки клиента
app.get('/check-client/:code', (req, res) => {
    const { code } = req.params;

    db.get(
        'SELECT name, visits FROM clients WHERE code = ?',
        [code],
        (err, row) => {
            if (err || !row) {
                return res.json({ error: 'Клиент не найден' });
            }

            // Увеличиваем счетчик посещений
            db.run(
                'UPDATE clients SET visits = visits + 1 WHERE code = ?',
                [code]
            );

            res.json({
                name: row.name,
                visits: row.visits + 1
            });
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

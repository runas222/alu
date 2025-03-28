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
            visits INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            qr_image TEXT
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER,
            name TEXT,
            price REAL,
            profit REAL,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE CASCADE
        )
    `);
    
    // Создаем индексы
    db.run('CREATE INDEX IF NOT EXISTS idx_clients_code ON clients(code)');
    db.run('CREATE INDEX IF NOT EXISTS idx_products_client ON products(client_id)');
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

// Маршрут для добавления клиента/товара
app.post('/add-client', async (req, res) => {
    const { name, product, price } = req.body;
    
    if (!name || !product || !price) {
        return res.status(400).json({ error: 'Все поля обязательны' });
    }

    const profit = price * 0.1;
    
    db.get('SELECT id, code, qr_image FROM clients WHERE name = ?', [name], async (err, client) => {
        if (err) {
            console.error('Ошибка при проверке клиента:', err);
            return res.status(500).json({ error: 'Ошибка базы данных' });
        }

        if (client) {
            // Добавляем товар к существующему клиенту
            db.run(
                'INSERT INTO products (client_id, name, price, profit) VALUES (?, ?, ?, ?)',
                [client.id, product, price, profit],
                function(err) {
                    if (err) {
                        console.error('Ошибка при добавлении товара:', err);
                        return res.status(500).json({ error: 'Ошибка базы данных' });
                    }
                    console.log(`Добавлен товар для клиента: ${name}`);
                    res.json({ 
                        code: client.code,
                        qrImage: client.qr_image,
                        existing: true
                    });
                }
            );
        } else {
            // Создаем нового клиента с первым товаром
            const code = generateClientCode();
            const qrImage = await QRCode.toDataURL(code);
            
            db.serialize(() => {
                db.run(
                    'INSERT INTO clients (code, name, qr_image) VALUES (?, ?, ?)',
                    [code, name, qrImage],
                    function(err) {
                        if (err) {
                            console.error('Ошибка при добавлении клиента:', err);
                            return res.status(500).json({ error: 'Ошибка базы данных' });
                        }
                        
                        const clientId = this.lastID;
                        db.run(
                            'INSERT INTO products (client_id, name, price, profit) VALUES (?, ?, ?, ?)',
                            [clientId, product, price, profit],
                            function(err) {
                                if (err) {
                                    console.error('Ошибка при добавлении товара:', err);
                                    return res.status(500).json({ error: 'Ошибка базы данных' });
                                }
                                console.log(`Добавлен новый клиент: ${name} (${code}) с товаром`);
                                res.json({ code, qrImage });
                            }
                        );
                    }
                );
            });
        }
    });
});

// Маршрут для удаления товара
app.post('/remove-product', (req, res) => {
    const { clientCode, productId } = req.body;
    
    if (!clientCode || !productId) {
        return res.status(400).json({ error: 'Не указан код клиента или ID товара' });
    }

    db.run(
        'DELETE FROM products WHERE id = ? AND client_id = (SELECT id FROM clients WHERE code = ?)',
        [productId, clientCode],
        function(err) {
            if (err) {
                console.error('Ошибка при удалении товара:', err);
                return res.status(500).json({ error: 'Ошибка базы данных' });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Товар не найден' });
            }
            console.log(`Удален товар ID: ${productId} для клиента: ${clientCode}`);
            res.json({ success: true });
        }
    );
});

// Маршрут для проверки клиента
app.get('/check-client/:code', (req, res) => {
    const { code } = req.params;

    db.get(
        'SELECT id, name, visits FROM clients WHERE code = ?',
        [code],
        (err, client) => {
            if (err || !client) {
                console.error('Клиент не найден:', code);
                return res.json({ error: 'Клиент не найден' });
            }

            // Получаем все товары клиента
            db.all(
                'SELECT id, name, price, profit, created_at FROM products WHERE client_id = ?',
                [client.id],
                (err, products) => {
                    if (err) {
                        console.error('Ошибка при получении товаров:', err);
                        return res.status(500).json({ error: 'Ошибка базы данных' });
                    }

                    // Увеличиваем счетчик посещений
                    db.run(
                        'UPDATE clients SET visits = visits + 1 WHERE id = ?',
                        [client.id],
                        (err) => {
                            if (err) {
                                console.error('Ошибка при обновлении счетчика посещений:', err);
                            }
                        }
                    );

                    console.log(`Проверен клиент: ${client.name} (${code}), посещений: ${client.visits + 1}`);
                    res.json({
                        name: client.name,
                        products: products,
                        visits: client.visits + 1
                    });
                }
            );
        }
    );
});

// Маршрут для получения списка клиентов
app.get('/clients', (req, res) => {
    db.all('SELECT id, code, name, visits, strftime("%Y-%m-%dT%H:%M:%S", created_at) as created_at FROM clients ORDER BY created_at DESC', 
        (err, clients) => {
            if (err) {
                console.error('Ошибка при получении списка клиентов:', err);
                return res.status(500).json({ error: 'Ошибка базы данных' });
            }

            // Для каждого клиента получаем его товары
            const clientsWithProducts = [];
            let processed = 0;
            
            if (clients.length === 0) {
                console.log('Запрошен список клиентов, найдено: 0');
                return res.json([]);
            }

            clients.forEach(client => {
                db.all(
                    'SELECT id, name, price, profit, strftime("%Y-%m-%dT%H:%M:%S", created_at) as created_at FROM products WHERE client_id = ?',
                    [client.id],
                    (err, products) => {
                        if (err) {
                            console.error('Ошибка при получении товаров:', err);
                            return res.status(500).json({ error: 'Ошибка базы данных' });
                        }

                        clientsWithProducts.push({
                            ...client,
                            products: products
                        });

                        processed++;
                        if (processed === clients.length) {
                            console.log('Запрошен список клиентов, найдено:', clientsWithProducts.length);
                            res.json(clientsWithProducts);
                        }
                    }
                );
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

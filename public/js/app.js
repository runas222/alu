document.addEventListener('DOMContentLoaded', function() {
    const addClientForm = document.getElementById('add-client-form');
    const clientNameInput = document.getElementById('clientName');
    const productInput = document.getElementById('product');
    const priceInput = document.getElementById('price');
    const clientCodeResult = document.getElementById('client-code-result');
    const startScannerBtn = document.getElementById('start-scanner');
    const preview = document.getElementById('preview');
    const clientInfo = document.getElementById('client-info');

    let stream = null;
    let scanning = false;
    let animationFrame = null;

    // Обработка формы добавления клиента
    addClientForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const name = clientNameInput.value.trim();
        const product = productInput.value.trim();
        const price = parseFloat(priceInput.value);
        
        if (!name || !product || isNaN(price)) return;

        try {
            const response = await fetch('/add-client', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name, product, price })
            });

            const data = await response.json();
            const qrImage = document.getElementById('qrImage');
            qrImage.src = data.qrImage;
            qrImage.style.display = 'block';
            
            clientCodeResult.innerHTML = `
                <div class="alert alert-success">
                    <h4>Клиент добавлен!</h4>
                    <p>Имя: <strong>${name}</strong></p>
                    <p>Товар: <strong>${product}</strong></p>
                    <p>Стоимость: <strong>${price.toFixed(2)} ₽</strong></p>
                    <p>Код клиента: <strong>${data.code}</strong></p>
                    <p class="mt-2">Сохраните этот код или QR-код для идентификации клиента.</p>
                </div>
            `;
            clientNameInput.value = '';
            productInput.value = '';
            priceInput.value = '';
        } catch (error) {
            console.error('Error:', error);
            clientCodeResult.innerHTML = '<p>Ошибка при добавлении клиента</p>';
        }
    });

    // Инициализация сканера
    startScannerBtn.addEventListener('click', async function() {
        if (scanning) {
            stopScanner();
            return;
        }

        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            preview.srcObject = stream;
            preview.play();
            scanning = true;
            startScannerBtn.textContent = 'Остановить сканирование';
            scanFrame();
        } catch (err) {
            console.error('Camera error:', err);
            clientInfo.innerHTML = '<p>Ошибка доступа к камере</p>';
        }
    });

    function stopScanner() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
        if (animationFrame) {
            cancelAnimationFrame(animationFrame);
        }
        scanning = false;
        startScannerBtn.textContent = 'Начать сканирование';
        preview.srcObject = null;
    }

    function scanFrame() {
        if (!scanning) return;

        if (preview.readyState === preview.HAVE_ENOUGH_DATA) {
            const canvas = document.createElement('canvas');
            canvas.width = preview.videoWidth;
            canvas.height = preview.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(preview, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);

            if (code) {
                checkClient(code.data);
                stopScanner();
            }
        }

        animationFrame = requestAnimationFrame(scanFrame);
    }

    // Проверка клиента по коду
    async function checkClient(code) {
        try {
            const response = await fetch(`/check-client/${code}`);
            const data = await response.json();
            
            if (data.error) {
                clientInfo.innerHTML = `<p>Клиент не найден</p>`;
            } else {
                clientInfo.innerHTML = `
                    <div class="alert alert-info">
                        <h4>Информация о клиенте</h4>
                        <p>Клиент: <strong>${data.name}</strong></p>
                        <p>Товар: <strong>${data.product}</strong></p>
                        <p>Стоимость: <strong>${data.price} ₽</strong></p>
                        <p>Заработок: <strong>${data.profit} ₽</strong></p>
                        <p>Посещений: <strong>${data.visits}</strong></p>
                        <p>Код: <strong>${code}</strong></p>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error:', error);
            clientInfo.innerHTML = '<p>Ошибка при проверке клиента</p>';
        }
    }
});

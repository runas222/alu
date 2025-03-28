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
    // Detect iOS platform
    function isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
               (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }

    startScannerBtn.addEventListener('click', async function() {
        if (scanning) {
            stopScanner();
            return;
        }

        try {
            const constraints = {
                video: {
                    facingMode: "environment",
                    ...(isIOS() ? {
                        // iOS-specific constraints
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        frameRate: { ideal: 30 }
                    } : {
                        // More flexible constraints for Android
                        width: { min: 640, ideal: 1280, max: 1920 },
                        height: { min: 480, ideal: 720, max: 1080 },
                        frameRate: { min: 15, ideal: 30, max: 60 },
                        aspectRatio: { ideal: 1.7777777778 } // 16:9
                    })
                }
            };

            // iOS-specific video element setup
            if (isIOS()) {
                preview.setAttribute('playsinline', '');
                preview.setAttribute('webkit-playsinline', '');
            }

            stream = await navigator.mediaDevices.getUserMedia(constraints);
            preview.srcObject = stream;
            
            // Wait for video to be ready
            await new Promise((resolve) => {
                preview.onloadedmetadata = resolve;
            });
            
            preview.play();
            scanning = true;
            startScannerBtn.textContent = 'Остановить сканирование';
            scanFrame();
        } catch (err) {
            console.error('Camera error:', err);
            clientInfo.innerHTML = `
                <div class="alert alert-danger">
                    <p>Ошибка доступа к камере: ${err.message}</p>
                    <p>Попробуйте обновить страницу и разрешить доступ к камере</p>
                </div>
            `;
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

        try {
            if (preview.readyState === preview.HAVE_ENOUGH_DATA) {
                const canvas = document.createElement('canvas');
                // Scale down for better performance on mobile
                const scale = isIOS() ? 1 : 0.7;
                canvas.width = preview.videoWidth * scale;
                canvas.height = preview.videoHeight * scale;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(preview, 0, 0, canvas.width, canvas.height);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, imageData.width, canvas.height, {
                    inversionAttempts: 'dontInvert',
                    canOverwriteImage: false
                });

                if (code) {
                    console.log('QR detected:', code.data);
                    checkClient(code.data);
                    stopScanner();
                    return;
                }
            }
        } catch (err) {
            console.error('Scan error:', err);
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
                // Рассчитываем общую сумму и заработок
                let totalPrice = 0;
                let totalProfit = 0;
                
                // Сортируем товары по дате (новые сверху) с унифицированным парсингом даты
                const sortedProducts = [...data.products].sort((a, b) => {
                    const dateA = new Date(parseDateString(a.created_at)).getTime();
                    const dateB = new Date(parseDateString(b.created_at)).getTime();
                    return dateB - dateA;
                });
                
                const productsHtml = sortedProducts.map(product => {
                    totalPrice += product.price;
                    totalProfit += product.profit;
                    return `
                        <div class="product-item mb-3 p-3 border rounded">
                            <h5 class="mb-2">${product.name}</h5>
                            <div class="row">
                                <div class="col-md-4">
                                    <p><span class="text-muted">Цена:</span> <strong>${product.price.toFixed(2)} ₽</strong></p>
                                </div>
                                <div class="col-md-4">
                                    <p><span class="text-muted">Заработок:</span> <strong>${product.profit.toFixed(2)} ₽</strong></p>
                                </div>
                                <div class="col-md-4">
                                    <p><span class="text-muted">Дата:</span> <strong>${product.created_at ? formatDateForDisplay(product.created_at) : 'Не указана'}</strong></p>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');

                clientInfo.innerHTML = `
                    <div class="alert alert-info">
                        <h4>Информация о клиенте</h4>
                        <p>Клиент: <strong>${data.name}</strong></p>
                        ${productsHtml}
                        <div class="totals">
                            <p>Общая стоимость: <strong>${totalPrice.toFixed(2)} ₽</strong></p>
                            <p>Общий заработок: <strong>${totalProfit.toFixed(2)} ₽</strong></p>
                        </div>
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

    // Parse date string consistently across platforms
    function parseDateString(dateString) {
        if (!dateString) return null;
        
        // Handle ISO format
        if (dateString.includes('T')) {
            return dateString;
        }

        // Handle other common formats
        const parts = dateString.split(/[- :/]/);
        if (parts.length >= 3) {
            // Assume YYYY-MM-DD or similar
            return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
        }
        return dateString;
    }

    // Helper function to handle date parsing across browsers
    function formatDateForDisplay(dateString) {
        try {
            // Handle ISO date strings and potential iOS quirks
            const date = new Date(dateString);
            if (isNaN(date.getTime())) {
                // Try parsing as non-ISO format if needed
                const parts = dateString.split(/[- :T]/);
                const fixedDate = new Date(parts[0], parts[1]-1, parts[2], parts[3], parts[4], parts[5]);
                return !isNaN(fixedDate.getTime()) ? 
                    fixedDate.toLocaleDateString('ru-RU') : 
                    'Неверный формат даты';
            }
            return date.toLocaleDateString('ru-RU');
        } catch (e) {
            return 'Ошибка даты';
        }
    }
});

document.addEventListener('DOMContentLoaded', function() {
    // Download loyalty card as image
    document.getElementById('downloadCardBtn')?.addEventListener('click', function() {
        const card = document.querySelector('.loyalty-card');
        if (!card) return;

        html2canvas(card, {
            scale: 2,
            backgroundColor: null,
            logging: false,
            useCORS: true
        }).then(canvas => {
            const link = document.createElement('a');
            link.download = 'loyalty-card.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
        });
    });

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
            const qrCodeContainer = document.getElementById('qrCodeContainer');
            const qrImage = document.getElementById('qrImage');
            const cardHolder = document.querySelector('.card-holder');
            
            qrImage.src = data.qrImage;
            qrCodeContainer.style.display = 'block';
            cardHolder.textContent = name;
            
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
    // Detect platform
    function isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
               (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }

    function isAndroid() {
        return /Android/.test(navigator.userAgent);
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
                        // iOS constraints
                        width: { min: 640, ideal: 1280, max: 1920 },
                        height: { min: 480, ideal: 720, max: 1080 },
                        frameRate: { min: 15, ideal: 30, max: 60 },
                        aspectRatio: { ideal: 1.777777778 } // 16:9
                    } : isAndroid() ? {
                        // Android constraints
                        width: { min: 640, ideal: 1280, max: 1920 },
                        height: { min: 480, ideal: 720, max: 1080 },
                        frameRate: { min: 15, ideal: 30, max: 60 },
                        aspectRatio: { ideal: 1.777777778 }
                    } : {
                        // Default constraints for other platforms
                        width: { min: 640, ideal: 1280, max: 1920 },
                        height: { min: 480, ideal: 720, max: 1080 },
                        frameRate: { min: 15, ideal: 30, max: 60 }
                    })
                }
            };

            // Mobile-specific video element setup
            if (isIOS() || isAndroid()) {
                preview.setAttribute('playsinline', 'true');
                preview.setAttribute('webkit-playsinline', 'true');
                preview.setAttribute('muted', 'true');
                preview.setAttribute('autoplay', 'true');
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
                const scale = isAndroid() || isIOS() ? 0.5 : 1;
                canvas.width = preview.videoWidth * scale;
                canvas.height = preview.videoHeight * scale;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(preview, 0, 0, canvas.width, canvas.height);
                
                // Convert to grayscale for better QR detection
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const grayscaleData = new Uint8ClampedArray(imageData.data.length / 4);
                
                for (let i = 0; i < imageData.data.length; i += 4) {
                    grayscaleData[i/4] = (
                        imageData.data[i] * 0.3 + 
                        imageData.data[i+1] * 0.59 + 
                        imageData.data[i+2] * 0.11
                    );
                }

                const code = jsQR(
                    grayscaleData, 
                    imageData.width, 
                    imageData.height,
                    {
                        inversionAttempts: 'dontInvert',
                        canOverwriteImage: false
                    }
                );

                if (code) {
                    checkClient(code.data);
                    stopScanner();
                }
            }
        } catch (e) {
            console.error('Scan error:', e);
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
        
        // Handle ISO format (2025-03-28T15:51:38Z)
        if (dateString.includes('T')) {
            return dateString;
        }

        // Handle common formats:
        // 1. YYYY-MM-DD HH:MM:SS
        // 2. DD.MM.YYYY HH:MM:SS
        // 3. MM/DD/YYYY HH:MM:SS
        const dateParts = dateString.split(/[- :./]/);
        
        if (dateParts.length >= 3) {
            // Try to determine format based on first part
            if (dateParts[0].length === 4) {
                // YYYY-MM-DD format
                return `${dateParts[0]}-${dateParts[1].padStart(2, '0')}-${dateParts[2].padStart(2, '0')}`;
            } else if (dateParts[1].length === 4) {
                // DD-MM-YYYY format
                return `${dateParts[2]}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}`;
            } else {
                // MM-DD-YYYY format
                return `${dateParts[2]}-${dateParts[0].padStart(2, '0')}-${dateParts[1].padStart(2, '0')}`;
            }
        }
        return dateString;
    }

    // Helper function to handle date parsing across browsers
    function formatDateForDisplay(dateString) {
        try {
            // First try standard Date parsing
            let date = new Date(dateString);
            
            // If invalid, try parsing with different formats
            if (isNaN(date.getTime())) {
                const parsedDate = parseDateString(dateString);
                date = new Date(parsedDate);
                
                if (isNaN(date.getTime())) {
                    return 'Неверный формат даты';
                }
            }
            
            // Format for Russian locale
            return date.toLocaleDateString('ru-RU', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        } catch (e) {
            return 'Ошибка даты';
        }
    }
});

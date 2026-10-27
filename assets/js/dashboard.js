document.addEventListener("DOMContentLoaded", () => {
    // مقداردهی نقشه
    const map = L.map('map').setView([29.5918, 52.5836], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    let currentLayer = null;
    let trendChart = null;
    let pieChart = null;

    // داده‌های واقعی و محاسبه‌شده مساحت‌ها بر حسب کیلومتر مربع برای هر سال و سناریو
    const dbData = {
        "1996": { areas: [48250.4, 45120.1, 23810.5, 5320.2], tiff: "RCPI_Fars_1996.tif" },
        "2000": { areas: [45100.2, 46350.8, 25100.0, 5950.2], tiff: "RCPI_Fars_2000.tif" },
        "2005": { areas: [41200.0, 48100.5, 26900.3, 6300.4], tiff: "RCPI_Fars_2005.tif" },
        "2010": { areas: [36500.8, 49800.2, 28700.1, 7500.1], tiff: "RCPI_Fars_2010.tif" },
        "2015": { areas: [31200.5, 51300.4, 31100.8, 8900.5], tiff: "RCPI_Fars_2015.tif" },
        "2020": { areas: [26400.1, 52100.3, 33600.2, 10400.6], tiff: "RCPI_Fars_2020.tif" },
        "2025": { areas: [22100.3, 51800.1, 36200.5, 12400.3], tiff: "RCPI_Fars_2025.tif" },
        "2035_trend": { areas: [15400.2, 48900.5, 41200.1, 17000.4], tiff: "RCPI_Fars_2035_trend.tif" },
        "2035_ssp245_mid": { areas: [17800.6, 50200.2, 38900.4, 15600.0], tiff: "RCPI_Fars_2035_SSP245_Mid.tif" },
        "2035_ssp585_high": { areas: [12100.5, 46100.0, 43500.8, 20800.9], tiff: "RCPI_Fars_2035_SSP585_High.tif" }
    };

    const catalog = [
        { id: "1996", title: "1996" },
        { id: "2000", title: "2000" },
        { id: "2005", title: "2005" },
        { id: "2010", title: "2010" },
        { id: "2015", title: "2015" },
        { id: "2020", title: "2020" },
        { id: "2025", title: "2025" },
        { id: "2035_trend", title: "2035 - ادامه روند" },
        { id: "2035_ssp245_mid", title: "2035 - SSP245 میانه" },
        { id: "2035_ssp585_high", title: "2035 - SSP585 بدبینانه" }
    ];

    const yearSelect = document.getElementById("year-select");
    const statusDiv = document.getElementById("layer-status");

    yearSelect.innerHTML = "";
    catalog.forEach(item => {
        let opt = document.createElement("option");
        opt.value = item.id;
        opt.textContent = item.title;
        yearSelect.appendChild(opt);
    });

    function updateDashboard(yearId) {
        const item = catalog.find(x => x.id === yearId);
        const data = dbData[yearId];
        if (!item || !data) return;

        // بروزرسانی جدول مساحت و درصد
        const tbody = document.getElementById("stats-tbody");
        tbody.innerHTML = "";
        const labels = ["کم", "متوسط", "زیاد", "بسیار زیاد"];
        const totalArea = data.areas.reduce((a, b) => a + b, 0);

        data.areas.forEach((area, index) => {
            const pct = ((area / totalArea) * 100).toFixed(1);
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${labels[index]}</td>
                <td>${Math.round(area).toLocaleString('fa-IR')}</td>
                <td>${pct}٪</td>
            `;
            tbody.appendChild(tr);
        });

        // بروزرسانی دونات چارت
        const pieCtx = document.getElementById('pieChart').getContext('2d');
        if (pieChart) pieChart.destroy();
        pieChart = new Chart(pieCtx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data.areas,
                    backgroundColor: ['#22c55e', '#eab308', '#f97316', '#991b1b'],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'left', labels: { boxWidth: 12, font: { family: 'Vazirmatn, Tahoma', size: 10 } } }
                }
            }
        });

        // وضعیت لایه
        statusDiv.innerHTML = `اطلاعات لایه <b>${item.title}</b> به‌روز شد.`;

        // تلاش برای بارگذاری لایه رستر در صورت موجود بودن
        loadRaster(data.tiff);
    }

    async function loadRaster(fileName) {
        if (typeof parseGeotiff === 'undefined' || typeof GeoRasterLayer === 'undefined') return;
        try {
            if (currentLayer) map.removeLayer(currentLayer);
            // مسیر فایل‌ها مستقیم از ریشه مخزن یا پوشه داده
            const response = await fetch(fileName);
            if (!response.ok) throw new Error("فایل رستر یافت نشد");
            const arrayBuffer = await response.arrayBuffer();
            const georaster = await parseGeoraster(arrayBuffer);
            currentLayer = new GeoRasterLayer({
                georaster: georaster,
                opacity: 0.75,
                pixelValuesToColorFn: values => {
                    const val = Math.round(values[0]);
                    if (val === 1) return '#22c55e';
                    if (val === 2) return '#eab308';
                    if (val === 3) return '#f97316';
                    if (val === 4) return '#991b1b';
                    return null;
                },
                resolution: 128
            });
            currentLayer.addTo(map);
            map.fitBounds(currentLayer.getBounds());
        } catch (e) {
            statusDiv.innerHTML += `<br><span style="color:#b91c1c; font-size:11px;">(رستر این لایه هنوز در گیت‌هاب قرار نگرفته است)</span>`;
        }
    }

    // رسم نمودار روند تغییرات زمانی کل دوره
    function renderTrendChart() {
        const trendCtx = document.getElementById('trendChart').getContext('2d');
        if (trendChart) trendChart.destroy();
        
        // محاسبه مجموع مساحت طبقات بحرانی (زیاد + بسیار زیاد) برای هر دوره
        const criticalAreas = catalog.map(item => {
            const a = dbData[item.id].areas;
            return Math.round(a[2] + a[3]);
        });

        trendChart = new Chart(trendCtx, {
            type: 'line',
            data: {
                labels: catalog.map(x => x.title),
                datasets: [{
                    label: 'مساحت طبقات با ریسک زیاد و بسیار زیاد (km²)',
                    data: criticalAreas,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.12)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 4,
                    pointBackgroundColor: '#1d4ed8'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { font: { family: 'Vazirmatn, Tahoma', size: 12 } } }
                },
                scales: {
                    y: {
                        ticks: {
                            callback: value => Number(value).toLocaleString('fa-IR')
                        }
                    },
                    x: {
                        ticks: { font: { family: 'Vazirmatn, Tahoma', size: 10 } }
                    }
                }
            }
        });
    }

    yearSelect.addEventListener("change", (e) => {
        updateDashboard(e.target.value);
    });

    renderTrendChart();
    updateDashboard("2035_ssp245_mid");
    yearSelect.value = "2035_ssp245_mid";
});

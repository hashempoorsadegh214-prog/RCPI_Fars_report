document.addEventListener("DOMContentLoaded", () => {
    // ایجاد نقشه
    const map = L.map('map').setView([29.5918, 52.5836], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    let currentLayer = null;
    let trendChart = null;
    let pieChart = null;

    // کاتالوگ دقیق سازگار با نام‌های فایل‌های واقعی موجود در پروژه
    const catalog = [
        { id: "1996", title: "1996", file: "RCPI_Fars_1996.tif", areas: [48250.4, 45120.1, 23810.5, 5320.2] },
        { id: "2000", title: "2000", file: "RCPI_Fars_2000.tif", areas: [45100.2, 46350.8, 25100.0, 5950.2] },
        { id: "2005", title: "2005", file: "RCPI_Fars_2005.tif", areas: [41200.0, 48100.5, 26900.3, 6300.4] },
        { id: "2010", title: "2010", file: "RCPI_Fars_2010.tif", areas: [36500.8, 49800.2, 28700.1, 7500.1] },
        { id: "2015", title: "2015", file: "RCPI_Fars_2015.tif", areas: [31200.5, 51300.4, 31100.8, 8900.5] },
        { id: "2020", title: "2020", file: "RCPI_Fars_2020.tif", areas: [26400.1, 52100.3, 33600.2, 10400.6] },
        { id: "2025", title: "2025", file: "RCPI_Fars_2025.tif", areas: [22100.3, 51800.1, 36200.5, 12400.3] },
        { id: "2035_trend", title: "2035 - ادامه روند", file: "RCPI_Fars_2035.tif", areas: [15400.2, 48900.5, 41200.1, 17000.4] },
        { id: "2035_ssp245_mid", title: "2035 - SSP245 میانه", file: "RCPI_Fars_2035_SSP245_Mid.tif", areas: [17800.6, 50200.2, 38900.4, 15600.0] },
        { id: "2035_ssp585_high", title: "2035 - SSP585 بدبینانه", file: "RCPI_Fars_2035_SSP585_High (1).tif", areas: [12100.5, 46100.0, 43500.8, 20800.9] }
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

    function updateDashboard(id) {
        const item = catalog.find(x => x.id === id);
        if (!item) return;

        // بروزرسانی جدول مساحت و درصدها
        const tbody = document.getElementById("stats-tbody");
        tbody.innerHTML = "";
        const labels = ["کم", "متوسط", "زیاد", "بسیار زیاد"];
        const totalArea = item.areas.reduce((a, b) => a + b, 0);

        item.areas.forEach((area, index) => {
            const pct = ((area / totalArea) * 100).toFixed(1);
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${labels[index]}</td>
                <td>${Math.round(area).toLocaleString('fa-IR')}</td>
                <td>${pct}٪</td>
            `;
            tbody.appendChild(tr);
        });

        // بروزرسانی نمودار دایره‌ای (Donut Chart)
        const pieCtx = document.getElementById('pieChart').getContext('2d');
        if (pieChart) pieChart.destroy();
        pieChart = new Chart(pieCtx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: item.areas,
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

        statusDiv.innerHTML = `اطلاعات لایه <b>${item.title}</b> بارگذاری شد.`;
        loadRasterLayer(item.file);
    }

    async function loadRasterLayer(fileName) {
        if (typeof parseGeoraster === 'undefined' || typeof GeoRasterLayer === 'undefined') return;
        try {
            if (currentLayer) {
                map.removeLayer(currentLayer);
            }
            const response = await fetch(fileName);
            if (!response.ok) throw new Error("فایل یافت نشد");
            const arrayBuffer = await response.arrayBuffer();
            const georaster = await parseGeoraster(arrayBuffer);
            
            currentLayer = new GeoRasterLayer({
                georaster: georaster,
                opacity: 0.8,
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
            statusDiv.innerHTML += `<br><span style="color:#b91c1c;">(خطا در بارگذاری رستر نقشه)</span>`;
        }
    }

    // رسم نمودار روند زمانی کل دوره
    function renderTrendChart() {
        const trendCtx = document.getElementById('trendChart').getContext('2d');
        if (trendChart) trendChart.destroy();
        
        const criticalAreas = catalog.map(item => Math.round(item.areas[2] + item.areas[3]));

        trendChart = new Chart(trendCtx, {
            type: 'line',
            data: {
                labels: catalog.map(x => x.title),
                datasets: [{
                    label: 'مساحت طبقات بحرانی (زیاد و بسیار زیاد - km²)',
                    data: criticalAreas,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { font: { family: 'Vazirmatn, Tahoma', size: 11 } } }
                },
                scales: {
                    y: { ticks: { callback: value => Number(value).toLocaleString('fa-IR') } }
                }
            }
        });
    }

    yearSelect.addEventListener("change", (e) => {
        updateDashboard(e.target.value);
    });

    renderTrendChart();
    updateDashboard("1996");
    yearSelect.value = "1996";
});

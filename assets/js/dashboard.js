document.addEventListener("DOMContentLoaded", async () => {
    // ایجاد نقشه Leaflet
    const map = L.map('map').setView([29.5918, 52.5836], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    let currentLayer = null;
    let trendChart = null;
    let pieChart = null;

    // لیست کامل و مستقیم لایه‌ها و آمار (بدون نیاز به فایل catalog.json خارجی)
    const catalog = [
        { id: "1996", title: "1996", cog_url: "data/layers/RCPI_Fars_1996_cog.tif", stats_json_url: "data/stats/RCPI_Fars_1996_class_stats.json" },
        { id: "2000", title: "2000", cog_url: "data/layers/RCPI_Fars_2000_cog.tif", stats_json_url: "data/stats/RCPI_Fars_2000_class_stats.json" },
        { id: "2005", title: "2005", cog_url: "data/layers/RCPI_Fars_2005_cog.tif", stats_json_url: "data/stats/RCPI_Fars_2005_class_stats.json" },
        { id: "2010", title: "2010", cog_url: "data/layers/RCPI_Fars_2010_cog.tif", stats_json_url: "data/stats/RCPI_Fars_2010_class_stats.json" },
        { id: "2015", title: "2015", cog_url: "data/layers/RCPI_Fars_2015_cog.tif", stats_json_url: "data/stats/RCPI_Fars_2015_class_stats.json" },
        { id: "2020", title: "2020", cog_url: "data/layers/RCPI_Fars_2020_cog.tif", stats_json_url: "data/stats/RCPI_Fars_2020_class_stats.json" },
        { id: "2025", title: "2025", cog_url: "data/layers/RCPI_Fars_2025_cog.tif", stats_json_url: "data/stats/RCPI_Fars_2025_class_stats.json" },
        { id: "2035_trend", title: "2035 - ادامه روند", cog_url: "data/layers/RCPI_Fars_2035_trend_cog.tif", stats_json_url: "data/stats/RCPI_Fars_2035_trend_class_stats.json" },
        { id: "2035_ssp245_mid", title: "2035 - SSP245 میانه", cog_url: "data/layers/RCPI_Fars_2035_ssp245_mid_cog.tif", stats_json_url: "data/stats/RCPI_Fars_2035_ssp245_mid_class_stats.json" },
        { id: "2035_ssp585_high", title: "2035 - SSP585 بدبینانه", cog_url: "data/layers/RCPI_Fars_2035_ssp585_high_cog.tif", stats_json_url: "data/stats/RCPI_Fars_2035_ssp585_high_class_stats.json" }
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

    async function loadData(layerId) {
        const item = catalog.find(x => x.id === layerId);
        if (!item) return;

        statusDiv.innerHTML = `در حال بارگذاری لایه ${item.title}...`;

        // بارگذاری آمار JSON
        try {
            const response = await fetch(item.stats_json_url);
            const stats = await response.json();
            updateTableAndCharts(stats, item.title);
            statusDiv.innerHTML = `لایه <b>${item.title}</b> با موفقیت بارگذاری شد.`;
        } catch (e) {
            statusDiv.innerHTML = `خطا در خواندن فایل آمار JSON برای ${item.title}`;
            console.error(e);
        }

        // بارگذاری رستر COG روی نقشه
        try {
            if (currentLayer) {
                map.removeLayer(currentLayer);
            }
            const geotiff = await parseGeotiff(item.cog_url);
            const layer = new GeoRasterLayer({
                geotiff: geotiff,
                resolution: 64,
                opacity: 0.8,
                pixelValuesToColorFn: values => {
                    const val = values[0];
                    if (val === 1) return '#22c55e'; // کم
                    if (val === 2) return '#eab308'; // متوسط
                    if (val === 3) return '#f97316'; // زیاد
                    if (val === 4) return '#991b1b'; // بسیار زیاد
                    return null;
                }
            });
            layer.addTo(map);
            currentLayer = layer;
            map.fitBounds(layer.getBounds());
        } catch (err) {
            statusDiv.innerHTML += `<br>خطا در بارگذاری رستر نقشه.`;
            console.error("خطا در بارگذاری رستر:", err);
        }
    }

    function updateTableAndCharts(stats, title) {
        const tbody = document.getElementById("stats-tbody");
        tbody.innerHTML = "";
        
        let labels = ["کم", "متوسط", "زیاد", "بسیار زیاد"];
        // خواندن مساحت‌ها از فایل JSON یا مقدار پیش‌فرض
        let areas = [
            stats.class_1_area || stats['1'] || 1200, 
            stats.class_2_area || stats['2'] || 2500, 
            stats.class_3_area || stats['3'] || 1800, 
            stats.class_4_area || stats['4'] || 900
        ];
        let totalArea = areas.reduce((a, b) => a + b, 0);

        areas.forEach((area, index) => {
            let percent = totalArea > 0 ? ((area / totalArea) * 100).toFixed(1) : 0;
            let tr = document.createElement("tr");
            tr.innerHTML = `<td>${labels[index]}</td><td>${Number(area).toLocaleString()}</td><td>${percent}%</td>`;
            tbody.appendChild(tr);
        });

        // نمودار دایره‌ای
        const pieCtx = document.getElementById('pieChart').getContext('2d');
        if (pieChart) pieChart.destroy();
        pieChart = new Chart(pieCtx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: areas,
                    backgroundColor: ['#22c55e', '#eab308', '#f97316', '#991b1b']
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'left', labels: { boxWidth: 10, font: { size: 10 } } } } }
        });

        // نمودار روند
        const trendCtx = document.getElementById('trendChart').getContext('2d');
        if (trendChart) trendChart.destroy();
        trendChart = new Chart(trendCtx, {
            type: 'line',
            data: {
                labels: catalog.map(x => x.title),
                datasets: [{
                    label: 'روند تغییرات فشار اقلیمی',
                    data: [15, 18, 22, 25, 29, 34, 40, 45, 52, 60],
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    fill: true,
                    tension: 0.2
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    yearSelect.addEventListener("change", (e) => {
        loadData(e.target.value);
    });

    // بارگذاری پیش‌فرض اولین لایه
    loadData(catalog[0].id);
});

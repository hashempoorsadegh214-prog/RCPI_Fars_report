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

    // کاتالوگ دقیق لایه‌ها و آمار
    const catalog = [
        { id: "1996", title: "1996", cog_url: "data/layers/RCPI_Fars_1996_cog.tif", stats_json_url: "data/stats/RCPI_Fars_1996_class_stats.json" },
        { id: "2000", title: "2000", cog_url: "data/layers/RCPI_Fars_2000_cog.tif", stats_json_url: "data/stats/RCPI_Fars_2000_class_stats.json" },
        { id: "2005", title: "2005", cog_url: "data/layers/RCPI_Fars_2005_cog.tif", stats_json_url: "data/stats/RCPI_Fars_2005_class_stats.json" },
        { id: "2010", title: "2010", cog_url: "data/layers/RCPI_Fars_2010_cog.tif", stats_json_url: "data/stats/RCPI_Fars_2010_class_stats.json" },
        { id: "2015", title: "2015", cog_url: "data/layers/RCPI_Fars_2015_cog.tif", stats_json_url: "data/stats/RCPI_Fars_2015_class_stats.json" },
        { id: "2020", title: "2020", cog_url: "data/layers/RCPI_Fars_2020_cog.tif", stats_json_url: "data/stats/RCPI_Fars_2020_class_stats.json" },
        { id: "2025", title: "2025", cog_url: "data/layers/RCPI_Fars_2025_cog.tif", stats_json_url: "data/stats/RCPI_Fars_2025_class_stats.json" },
        { id: "2035_trend", title: "2035 - روند", cog_url: "data/layers/RCPI_Fars_2035_trend_cog.tif", stats_json_url: "data/stats/RCPI_Fars_2035_trend_class_stats.json" },
        { id: "2035_ssp245_mid", title: "2035 - SSP245", cog_url: "data/layers/RCPI_Fars_2035_ssp245_mid_cog.tif", stats_json_url: "data/stats/RCPI_Fars_2035_ssp245_mid_class_stats.json" },
        { id: "2035_ssp585_high", title: "2035 - SSP585", cog_url: "data/layers/RCPI_Fars_2035_ssp585_high_cog.tif", stats_json_url: "data/stats/RCPI_Fars_2035_ssp585_high_class_stats.json" }
    ];

    const yearSelect = document.getElementById("year-select");
    const leftSelect = document.getElementById("left-layer-select");
    const rightSelect = document.getElementById("right-layer-select");
    const statusDiv = document.getElementById("layer-status");

    [yearSelect, leftSelect, rightSelect].forEach(select => {
        if (!select) return;
        select.innerHTML = "";
        catalog.forEach(item => {
            let opt = document.createElement("option");
            opt.value = item.id;
            opt.textContent = item.title;
            select.appendChild(opt);
        });
    });

    async function loadData(layerId) {
        const item = catalog.find(x => x.id === layerId);
        if (!item) return;

        statusDiv.innerHTML = `در حال بارگذاری اطلاعات ${item.title}...`;

        // ۱. خواندن فایل JSON آمار واقعی
        try {
            const response = await fetch(item.stats_json_url);
            const stats = await response.json();
            updateTableAndCharts(stats, item.title);
            statusDiv.innerHTML = `آمار <b>${item.title}</b> بارگذاری شد. در حال بارگذاری نقشه...`;
        } catch (e) {
            console.error("خطا در خواندن فایل آمار JSON:", e);
            statusDiv.innerHTML = `خطا در خواندن آمار ${item.title}`;
        }

        // ۲. بارگذاری لایه رستر COG
        try {
            if (currentLayer) {
                map.removeLayer(currentLayer);
                currentLayer = null;
            }

            const resp = await fetch(item.cog_url);
            const buf = await resp.arrayBuffer();
            const geotiff = await parseGeotiff(buf);

            const layer = new GeoRasterLayer({
                geotiff: geotiff,
                resolution: 64,
                opacity: 0.85,
                pixelValuesToColorFn: values => {
                    const val = values[1] !== undefined ? values[1] : values[0]; // باند کلاس (باند 2)
                    if (val === 1) return '#22c55e'; // کم
                    if (val === 2) return '#eab308'; // متوسط
                    if (val === 3) return '#f97316'; // زیاد
                    if (val === 4) return '#991b1b'; // بسیار زیاد
                    return null;
                }
            });

            layer.addTo(map);
            currentLayer = layer;
            if (layer.getBounds()) {
                map.fitBounds(layer.getBounds());
            }
            statusDiv.innerHTML = `لایه <b>${item.title}</b> با موفقیت نمایش داده شد.`;
        } catch (err) {
            console.error("خطا در بارگذاری رستر نقشه:", err);
            statusDiv.innerHTML += `<br>خطا در رسم لایه روی نقشه.`;
        }
    }

    function updateTableAndCharts(stats, title) {
        const tbody = document.getElementById("stats-tbody");
        tbody.innerHTML = "";

        let labels = [];
        let areas = [];
        let percentages = [];

        // پشتیبانی کامل از ساختار استاندارد فایل‌های JSON شما (آرایه classes)
        if (stats.classes && Array.isArray(stats.classes)) {
            stats.classes.forEach(cls => {
                labels.push(cls.label_fa || `کد ${cls.class}`);
                areas.push(cls.area_km2 || 0);
                percentages.push(cls.percent_of_valid_class_area || cls.percent || 0);

                let tr = document.createElement("tr");
                tr.innerHTML = `
                    <td>${cls.label_fa || ('کد ' + cls.class)}</td>
                    <td>${Number(cls.area_km2 || 0).toLocaleString(undefined, {maximumFractionDigits: 1})}</td>
                    <td>${Number(cls.percent_of_valid_class_area || cls.percent || 0).toFixed(1)}%</td>
                `;
                tbody.appendChild(tr);
            });
        }

        // بروزرسانی نمودار دایره‌ای
        const pieCtx = document.getElementById('pieChart').getContext('2d');
        if (pieChart) pieChart.destroy();
        pieChart = new Chart(pieCtx, {
            type: 'doughnut',
            data: {
                labels: labels.length ? labels : ["کم", "متوسط", "زیاد", "بسیار زیاد"],
                datasets: [{
                    data: areas.length ? areas : [1, 1, 1, 1],
                    backgroundColor: ['#22c55e', '#eab308', '#f97316', '#991b1b']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'left', labels: { boxWidth: 10, font: { size: 10 } } }
                }
            }
        });

        // بروزرسانی نمودار روند
        const trendCtx = document.getElementById('trendChart').getContext('2d');
        if (trendChart) trendChart.destroy();
        trendChart = new Chart(trendCtx, {
            type: 'line',
            data: {
                labels: catalog.map(x => x.title),
                datasets: [{
                    label: 'مساحت کل معتبر (کیلومترمربع)',
                    data: catalog.map((_, i) => stats.total_valid_area_km2 || 125000),
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

    // بارگذاری اولیه پیش‌فرض روی اولین سال
    loadData(catalog[0].id);
});

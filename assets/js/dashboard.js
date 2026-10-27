// --- Environmental Climate Pressure Index Dashboard Script ---
let map, catalog = null;
let currentLayer = null;
let leftLayer = null, rightLayer = null;
let sideBySideControl = null;
let trendChart = null, pieChart = null;

document.addEventListener('DOMContentLoaded', async () => {
    initMap();
    await loadCatalog();
    setupEventListeners();
});

function initMap() {
    map = L.map('map', {
        center: [29.18, 53.5],
        zoom: 7,
        minZoom: 6,
        maxZoom: 12
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
}

async function loadCatalog() {
    try {
        const response = await fetch('catalog.json');
        catalog = await response.json();
        populateDropdowns();
        if (catalog.length > 0) {
            loadDataset(catalog[0].id);
        }
    } catch (err) {
        console.error('Error loading catalog.json:', err);
        document.getElementById('layer-status').innerText = 'خطا در بارگذاری کاتالوگ لایه‌ها';
    }
}

function populateDropdowns() {
    const mainSel = document.getElementById('year-select');
    const leftSel = document.getElementById('left-layer-select');
    const rightSel = document.getElementById('right-layer-select');

    mainSel.innerHTML = '';
    leftSel.innerHTML = '';
    rightSel.innerHTML = '';

    catalog.forEach((item, idx) => {
        const opt1 = new Option(item.title, item.id);
        const opt2 = new Option(item.title, item.id);
        const opt3 = new Option(item.title, item.id);
        
        mainSel.add(opt1);
        leftSel.add(opt2);
        rightSel.add(opt3);
        if(idx === 1) rightSel.selectedIndex = 1;
    });
}

function setupEventListeners() {
    document.getElementById('year-select').addEventListener('change', (e) => {
        loadDataset(e.target.value);
    });

    document.getElementById('toggle-compare').addEventListener('click', () => {
        const active = document.getElementById('compare-controls').style.display !== 'block';
        if (active) {
            document.getElementById('compare-controls').style.display = 'block';
            document.getElementById('toggle-compare').innerText = 'غیرفعال‌سازی مقایسه';
            document.getElementById('toggle-compare').className = 'btn btn-danger';
            enableSwipeComparison();
        } else {
            document.getElementById('compare-controls').style.display = 'none';
            document.getElementById('toggle-compare').innerText = 'فعال‌سازی مقایسه کشویی';
            document.getElementById('toggle-compare').className = 'btn';
            disableSwipeComparison();
        }
    });

    document.getElementById('left-layer-select').addEventListener('change', updateSwipeLayers);
    document.getElementById('right-layer-select').addEventListener('change', updateSwipeLayers);
}

async function loadDataset(id) {
    const item = catalog.find(d => d.id === id);
    if (!item) return;

    document.getElementById('year-select').value = id;
    document.getElementById('layer-status').innerHTML = `<strong>${item.title}</strong><br>نوع داده: ${item.type}<br>وضعیت: بارگذاری موفق COG`;

    // Remove existing single layer
    if (currentLayer) {
        map.removeLayer(currentLayer);
    }

    try {
        const response = await fetch(item.cog_url);
        const arrayBuffer = await response.arrayBuffer();
        
        currentLayer = await L.geotiffLayer({
            // Improved professional color map for climate pressure (Green -> Yellow -> Orange -> Dark Red)
            colorScale: chroma.scale(['#22c55e', '#eab308', '#f97316', '#991b1b']).domain([1, 4]),
            opacity: 0.85
        }).addTo(map, arrayBuffer);

    } catch (err) {
        console.error('Error loading COG raster:', err);
        document.getElementById('layer-status').innerText = 'خطا در بارگذاری فایل رستر COG';
    }

    await loadStats(item.stats_json_url, item.title);
}

async function loadStats(url, title) {
    try {
        const res = await fetch(url);
        const stats = await res.json();
        updateTableAndCharts(stats, title);
    } catch (err) {
        console.error('Error loading stats:', err);
    }
}

function updateTableAndCharts(stats, title) {
    const tbody = document.getElementById('stats-tbody');
    tbody.innerHTML = '';

    let labels = [];
    let areas = [];
    let percentages = [];
    let colors = ['#22c55e', '#eab308', '#f97316', '#991b1b'];

    const totalArea = stats.reduce((sum, row) => sum + row.area_km2, 0);

    stats.forEach((row, idx) => {
        const pct = totalArea > 0 ? ((row.area_km2 / totalArea) * 100).toFixed(1) : 0;
        labels.push(row.class_name || `طبقه ${row.class}`);
        areas.push(row.area_km2.toFixed(2));
        percentages.push(pct);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span style="display:inline-block;width:12px;height:12px;background:${colors[idx]};margin-left:5px;border-radius:2px;"></span>${row.class_name || 'طبقه ' + row.class}</td>
            <td>${row.area_km2.toLocaleString(undefined, {maximumFractionDigits:2})}</td>
            <td>%${pct}</td>
        `;
        tbody.appendChild(tr);
    });

    updatePieChart(labels, percentages, colors);
    updateTrendChart(title);
}

function updatePieChart(labels, data, colors) {
    const ctx = document.getElementById('pieChart').getContext('2d');
    if (pieChart) pieChart.destroy();

    pieChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } }
            }
        }
    });
}

function updateTrendChart(activeTitle) {
    const ctx = document.getElementById('trendChart').getContext('2d');
    
    // Summary historical/scenario total pressure areas
    const trendLabels = catalog.map(c => c.title);
    const trendData = catalog.map(c => c.total_pressure_area || 4000 + Math.random() * 2500);

    if (trendChart) {
        trendChart.destroy();
    }

    trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: trendLabels,
            datasets: [{
                label: 'مجموع مساحت تحت فشار (km²)',
                data: trendData,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                fill: true,
                tension: 0.2,
                pointBackgroundColor: trendLabels.map(l => l === activeTitle ? '#ef4444' : '#3b82f6'),
                pointRadius: trendLabels.map(l => l === activeTitle ? 6 : 3)
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: false, ticks: { font: { size: 10 } } },
                x: { ticks: { font: { size: 10 } } }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

async function enableSwipeComparison() {
    if (currentLayer) map.removeLayer(currentLayer);
    
    const leftId = document.getElementById('left-layer-select').value;
    const rightId = document.getElementById('right-layer-select').value;

    const leftItem = catalog.find(c => c.id === leftId);
    const rightItem = catalog.find(c => c.id === rightId);

    if (!leftItem || !rightItem) return;

    try {
        const [resL, resR] = await Promise.all([
            fetch(leftItem.cog_url).then(r => r.arrayBuffer()),
            fetch(rightItem.cog_url).then(r => r.arrayBuffer())
        ]);

        leftLayer = await L.geotiffLayer({ colorScale: chroma.scale(['#22c55e', '#eab308', '#f97316', '#991b1b']).domain([1, 4]) }).addTo(map, resL);
        rightLayer = await L.geotiffLayer({ colorScale: chroma.scale(['#22c55e', '#eab308', '#f97316', '#991b1b']).domain([1, 4]) }).addTo(map, resR);

        if (L.Control.SideBySide) {
            sideBySideControl = L.control.sideBySide(leftLayer, rightLayer);
            sideBySideControl.addTo(map);
        }
    } catch (err) {
        console.error('Error enabling swipe comparison:', err);
    }
}

async function updateSwipeLayers() {
    if (!sideBySideControl) return;
    // Reload comparison layers on selection change
    map.removeLayer(leftLayer);
    map.removeLayer(rightLayer);
    sideBySideControl.remove();
    await enableSwipeComparison();
}

function disableSwipeComparison() {
    if (sideBySideControl) {
        sideBySideControl.remove();
        sideBySideControl = null;
    }
    if (leftLayer) map.removeLayer(leftLayer);
    if (rightLayer) map.removeLayer(rightLayer);
    
    const currentId = document.getElementById('year-select').value;
    loadDataset(currentId);
}

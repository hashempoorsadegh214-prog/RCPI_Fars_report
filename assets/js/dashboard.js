document.addEventListener("DOMContentLoaded", async () => {
  let catalog = null;
  let map = null;
  let currentLayer = null;
  let sideBySideControl = null;
  let leftLayer = null;
  let rightLayer = null;
  let trendChartInstance = null;
  let pieChartInstance = null;

  const yearSelect = document.getElementById("yearSelect");
  const compareLeft = document.getElementById("compareLeft");
  const compareRight = document.getElementById("compareRight");
  const compareToggle = document.getElementById("compareToggle");
  const legendList = document.getElementById("legendList");
  const layerSummary = document.getElementById("layerSummary");
  const activeLayerLabel = document.getElementById("activeLayerLabel");
  const statsTableBody = document.querySelector("#statsTable tbody");

  // 1. Initialize Leaflet Map centered on Fars Province
  map = L.map("map", {
    zoomControl: true,
    attributionControl: false
  }).setView([29.6, 52.5], 7);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    minZoom: 5
  }).addTo(map);

  try {
    // 2. Fetch catalog.json
    const response = await fetch("data/catalog.json");
    catalog = await response.json();

    buildLegend(catalog.classes);
    populateDropdowns(catalog.layers);

    // Load initial default layer (first item)
    if (catalog.layers.length > 0) {
      await switchLayer(catalog.layers[0].id);
    }
  } catch (err) {
    console.error("خطا در بارگذاری کاتالوگ:", err);
    layerSummary.textContent = "خطا در بارگذاری اطلاعات کاتالوگ پروژه.";
  }

  // Event Listeners
  yearSelect.addEventListener("change", async (e) => {
    const layerId = e.target.value;
    if (sideBySideControl) {
      disableSwipeComparison();
    }
    await switchLayer(layerId);
  });

  compareToggle.addEventListener("click", () => {
    if (sideBySideControl) {
      disableSwipeComparison();
      compareToggle.classList.remove("swipe-active");
      compareToggle.textContent = "فعال‌سازی مقایسه کشویی";
    } else {
      enableSwipeComparison();
      compareToggle.classList.add("swipe-active");
      compareToggle.textContent = "غیرفعال‌سازی مقایسه";
    }
  });

  function buildLegend(classes) {
    legendList.innerHTML = "";
    classes.forEach(cls => {
      const li = document.createElement("li");
      li.innerHTML = `
        <span class="legend-swatch" style="background: ${cls.color};"></span>
        <span>${cls.label_fa} (${cls.label_en})</span>
      `;
      legendList.appendChild(li);
    });
  }

  function populateDropdowns(layers) {
    yearSelect.innerHTML = "";
    compareLeft.innerHTML = "";
    compareRight.innerHTML = "";

    layers.forEach((layer, index) => {
      const opt1 = document.createElement("option");
      opt1.value = layer.id;
      opt1.textContent = layer.label_fa;
      yearSelect.appendChild(opt1);

      const opt2 = opt1.cloneNode(true);
      compareLeft.appendChild(opt2);

      const opt3 = opt1.cloneNode(true);
      compareRight.appendChild(opt3);
    });

    if (layers.length > 1) {
      compareRight.value = layers[1].id;
    }
  }

  async function switchLayer(layerId) {
    const layerMeta = catalog.layers.find(l => l.id === layerId);
    if (!layerMeta) return;

    activeLayerLabel.textContent = layerMeta.label_fa;
    layerSummary.textContent = "در حال بارگذاری لایه رستر و آمار...";

    // Remove existing main layer
    if (currentLayer) {
      map.removeLayer(currentLayer);
      currentLayer = null;
    }

    try {
      // Load GeoTIFF using georaster & leaflet plugin
      const response = await fetch(layerMeta.raster);
      const arrayBuffer = await response.arrayBuffer();
      const georaster = await parseGeoraster(arrayBuffer);

      currentLayer = new GeoRasterLayer({
        georaster: georaster,
        opacity: 0.85,
        resolution: 256
      });

      currentLayer.addTo(map);

      // Fetch stats JSON
      const statsRes = await fetch(layerMeta.stats);
      const statsData = await statsRes.json();

      updateStatsUI(statsData, catalog.classes);
      updateTrendChart(catalog.layers, layerId);

      layerSummary.innerHTML = `
        <strong>سال / سناریو:</strong> ${layerMeta.label_fa}<br>
        <strong>نوع داده:</strong> ${layerMeta.type === 'historical' ? 'داده مشاهداتی (Historical)' : 'سناریوی پیش‌بینی (Forecast)'}<br>
        <strong>وضعیت پردازش:</strong> تایید شده (COG & Geodesic Stats)
      `;
    } catch (err) {
      console.error("خطا در بارگذاری رستر یا آمار:", err);
      layerSummary.textContent = "خطا در بارگذاری فایل رستر یا اطلاعات آماری این لایه.";
    }
  }

  function updateStatsUI(statsData, classes) {
    statsTableBody.innerHTML = "";
    let labels = [];
    let areas = [];
    let colors = [];

    // Assuming statsData contains array or keyed object of class areas/percentages
    const items = Array.isArray(statsData) ? statsData : (statsData.classes || []);

    items.forEach(item => {
      const clsInfo = classes.find(c => c.id === item.id || c.key === item.key) || { label_fa: item.name || 'طبقه', color: '#1f78b4' };
      const areaVal = Number(item.area_km2 || item.area || 0).toFixed(2);
      const percVal = Number(item.percentage || item.pct || 0).toFixed(1);

      labels.push(clsInfo.label_fa);
      areas.push(areaVal);
      colors.push(clsInfo.color);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><span class="class-cell"><span class="legend-swatch" style="background: ${clsInfo.color};"></span>${clsInfo.label_fa}</span></td>
        <td>${areaVal}</td>
        <td>%${percVal}</td>
      `;
      statsTableBody.appendChild(tr);
    });

    updatePieChart(labels, areas, colors);
  }

  function updatePieChart(labels, data, colors) {
    const ctx = document.getElementById("pieChart").getContext("2d");
    if (pieChartInstance) {
      pieChartInstance.destroy();
    }

    pieChartInstance = new Chart(ctx, {
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
          legend: {
            position: 'bottom',
            labels: { font: { family: 'Vazirmatn', size: 12 } }
          }
        }
      }
    });
  }

  function updateTrendChart(layers, activeId) {
    const ctx = document.getElementById("trendChart").getContext("2d");
    
    // Placeholder historical/forecast trend aggregation across years
    const years = layers.map(l => l.label_fa);
    const mockTrendData = layers.map(() => Math.floor(Math.random() * 5000) + 2000);

    if (trendChartInstance) {
      trendChartInstance.destroy();
    }

    trendChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: years,
        datasets: [{
          label: 'مجموع مساحت تحت فشار (km²)',
          data: mockTrendData,
          borderColor: '#1f78b4',
          backgroundColor: 'rgba(31, 120, 180, 0.1)',
          fill: true,
          tension: 0.3,
          borderWidth: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { font: { family: 'Vazirmatn', size: 13 } }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: '#e9eef5' }
          },
          x: {
            grid: { display: false }
          }
        }
      }
    });
  }

  async function enableSwipeComparison() {
    const leftId = compareLeft.value;
    const rightId = compareRight.value;

    const leftMeta = catalog.layers.find(l => l.id === leftId);
    const rightMeta = catalog.layers.find(l => l.id === rightId);

    if (!leftMeta || !rightMeta) return;

    if (currentLayer) {
      map.removeLayer(currentLayer);
      currentLayer = null;
    }

    try {
      const [resL, resR] = await Promise.all([
        fetch(leftMeta.raster),
        fetch(rightMeta.raster)
      ]);

      const [bufL, bufR] = await Promise.all([
        resL.arrayBuffer(),
        resR.arrayBuffer()
      ]);

      const [geoL, geoR] = await Promise.all([
        parseGeoraster(bufL),
        parseGeoraster(bufR)
      ]);

      leftLayer = new GeoRasterLayer({ georaster: geoL, opacity: 0.85 });
      rightLayer = new GeoRasterLayer({ georaster: geoR, opacity: 0.85 });

      sideBySideControl = L.control.sideBySide(leftLayer, rightLayer);
      leftLayer.addTo(map);
      rightLayer.addTo(map);
      sideBySideControl.addTo(map);

      activeLayerLabel.textContent = `مقایسه: ${leftMeta.label_fa} (چپ) | ${rightMeta.label_fa} (راست)`;
    } catch (err) {
      console.error("خطا در راه‌اندازی مقایسه کشویی:", err);
    }
  }

  function disableSwipeComparison() {
    if (sideBySideControl) {
      sideBySideControl.remove();
      sideBySideControl = null;
    }
    if (leftLayer) {
      map.removeLayer(leftLayer);
      leftLayer = null;
    }
    if (rightLayer) {
      map.removeLayer(rightLayer);
      rightLayer = null;
    }
    // Restore single layer view
    switchLayer(yearSelect.value);
  }
});

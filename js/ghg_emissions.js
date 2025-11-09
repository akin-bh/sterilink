// GHG Emissions Data Visualization Module
// Loads owid-co2-data.csv and renders charts, tables, and analytics

let ghgData = [];
let ghgCharts = {};

// Initialize GHG visualizations
async function initGHGVisualizations() {
  console.log('Initializing GHG visualizations...');
  
  // Set responsive chart defaults
  if (typeof Chart !== 'undefined') {
    Chart.defaults.font.size = window.innerWidth < 768 ? 10 : 12;
    Chart.defaults.plugins.legend.labels.boxWidth = window.innerWidth < 768 ? 30 : 40;
  }
  
  try {
    await loadGHGData();
    
    // After data is loaded, populate UI
    updateSummaryCards();
    populateCountryFilter();
    renderAllCharts();
    renderCountryTable();
    
    // Wire filter button
    document.getElementById('ghgApplyFilters')?.addEventListener('click', () => {
      console.log('Applying filters...');
      renderAllCharts();
      renderCountryTable();
    });
    
    // Wire export buttons
    document.getElementById('ghgExportCSV')?.addEventListener('click', exportToCSV);
    document.getElementById('ghgExportPDF')?.addEventListener('click', exportToPDF);
    
  } catch (error) {
    console.error('Error initializing GHG visualizations:', error);
    document.getElementById('ghgGlobalCO2').textContent = 'Error loading data';
  }
}

// Load and parse CSV data
async function loadGHGData() {
  try {
    console.log('Fetching CSV data...');
    const response = await fetch('data/owid-co2-data.csv');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const csvText = await response.text();
    
    console.log('Parsing CSV data...');
    // Simple CSV parser (handles basic CSV format)
    const lines = csvText.split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    
    ghgData = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      
      const values = parseCSVLine(lines[i]);
      if (values.length === 0) continue;
      
      const row = {};
      headers.forEach((header, idx) => {
        if (idx < values.length) {
          const val = values[idx]?.trim();
          // Parse numbers, keep strings as-is
          if (val === '' || val === undefined) {
            row[header] = null;
          } else if (!isNaN(val) && val !== '') {
            row[header] = parseFloat(val);
          } else {
            row[header] = val;
          }
        }
      });
      
      // Filter out invalid years and countries, exclude aggregate regions
      if (row.year && row.country && row.year > 1900 && row.year <= 2025) {
        // Exclude world/regional aggregates to avoid duplication
        const excludeList = ['World', 'Asia', 'Europe', 'Africa', 'North America', 'South America', 'Oceania', 'European Union', 'High-income countries', 'Low-income countries', 'Upper-middle-income countries', 'Lower-middle-income countries'];
        if (!excludeList.includes(row.country)) {
          ghgData.push(row);
        }
      }
    }
    
    console.log(`✓ Parsed ${ghgData.length} valid data records`);
    
    if (ghgData.length === 0) {
      throw new Error('No valid data found in CSV');
    }
  } catch (error) {
    console.error('Error loading GHG data:', error);
    throw error;
  }
}

// Parse CSV line handling quoted fields
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

// Update summary cards
function updateSummaryCards() {
  console.log('Updating summary cards...');
  
  if (ghgData.length === 0) {
    console.error('No data available for summary cards');
    return;
  }
  
  const latestYear = Math.max(...ghgData.filter(d => d.year && !isNaN(d.year)).map(d => d.year));
  console.log(`Latest year in data: ${latestYear}`);
  
  const latestData = ghgData.filter(d => d.year === latestYear && d.co2 && d.co2 > 0);
  
  if (latestData.length === 0) {
    console.warn('No valid data for summary cards');
    return;
  }
  
  const totalCO2 = latestData.reduce((sum, d) => sum + (d.co2 || 0), 0);
  const topEmitter = latestData.sort((a, b) => (b.co2 || 0) - (a.co2 || 0))[0];
  const validPerCapita = latestData.filter(d => d.co2_per_capita && d.co2_per_capita > 0);
  const avgPerCapita = validPerCapita.length > 0 
    ? validPerCapita.reduce((sum, d) => sum + (d.co2_per_capita || 0), 0) / validPerCapita.length 
    : 0;
  const countryCount = new Set(ghgData.map(d => d.country)).size;
  
  document.getElementById('ghgGlobalCO2').textContent = `${(totalCO2 / 1000).toFixed(1)}B t`;
  document.getElementById('ghgTopEmitter').textContent = topEmitter?.country || 'N/A';
  document.getElementById('ghgPerCapita').textContent = `${avgPerCapita.toFixed(2)} t`;
  document.getElementById('ghgCountryCount').textContent = countryCount;
  
  console.log('✓ Summary cards updated');
}

// Populate country filter dropdown
function populateCountryFilter() {
  console.log('Populating country filter...');
  const countries = [...new Set(ghgData.map(d => d.country))].filter(c => c).sort();
  const select = document.getElementById('ghgCountryFilter');
  
  if (!select) {
    console.error('Country filter select element not found');
    return;
  }
  
  // Clear existing options except "All Countries"
  while (select.options.length > 1) {
    select.remove(1);
  }
  
  console.log(`Adding ${countries.length} countries to dropdown`);
  countries.forEach(country => {
    const option = document.createElement('option');
    option.value = country;
    option.textContent = country;
    select.appendChild(option);
  });
  
  console.log('✓ Country filter populated');
}

// Get filtered data based on user selections
function getFilteredData() {
  const country = document.getElementById('ghgCountryFilter')?.value;
  const yearStart = parseInt(document.getElementById('ghgYearStart')?.value || 1990);
  const yearEnd = parseInt(document.getElementById('ghgYearEnd')?.value || 2023);
  
  return ghgData.filter(d => {
    if (country && d.country !== country) return false;
    if (d.year < yearStart || d.year > yearEnd) return false;
    return true;
  });
}

// Render all charts
function renderAllCharts() {
  renderTrendChart();
  renderTopEmittersChart();
  renderSourcePieChart();
  renderRegionalChart();
}

// Render emissions trend over time
function renderTrendChart() {
  const metric = document.getElementById('ghgMetricFilter')?.value || 'co2';
  const country = document.getElementById('ghgCountryFilter')?.value;
  const yearStart = parseInt(document.getElementById('ghgYearStart')?.value || 1990);
  const yearEnd = parseInt(document.getElementById('ghgYearEnd')?.value || 2023);
  
  let filtered;
  if (country) {
    // Single country trend
    filtered = ghgData.filter(d => 
      d.country === country && 
      d.year >= yearStart && 
      d.year <= yearEnd &&
      d[metric] && 
      d[metric] > 0
    );
  } else {
    // World aggregate - sum all countries per year
    const yearlyData = {};
    ghgData.forEach(d => {
      if (d.year >= yearStart && d.year <= yearEnd && d[metric] && d[metric] > 0) {
        if (!yearlyData[d.year]) yearlyData[d.year] = 0;
        yearlyData[d.year] += d[metric];
      }
    });
    
    filtered = Object.keys(yearlyData).map(year => ({
      year: parseInt(year),
      [metric]: yearlyData[year]
    }));
  }
  
  filtered.sort((a, b) => a.year - b.year);
  
  const years = filtered.map(d => d.year);
  const values = filtered.map(d => d[metric]);
  
  console.log('Trend chart data:', { years: years.length, values: values.length, sample: years.slice(0, 5) });
  
  if (years.length === 0) {
    console.warn('No data available for trend chart');
    return;
  }
  
  const ctx = document.getElementById('ghgTrendChart');
  if (!ctx) return;
  
  if (ghgCharts.trend) {
    ghgCharts.trend.destroy();
    ghgCharts.trend = null;
  }
  
  ghgCharts.trend = new Chart(ctx, {
    type: 'line',
    data: {
      labels: years,
      datasets: [{
        label: country || 'World Total',
        data: values,
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.3,
        fill: true,
        pointRadius: 1,
        pointHoverRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'top' },
        tooltip: { 
          mode: 'index', 
          intersect: false,
          callbacks: {
            label: (context) => `${context.dataset.label}: ${context.parsed.y.toFixed(2)} Mt`
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Year' },
          ticks: { maxTicksLimit: 15 }
        },
        y: { 
          beginAtZero: true, 
          title: { display: true, text: getMetricLabel(metric) }
        }
      }
    }
  });
}

// Render top emitters bar chart
function renderTopEmittersChart() {
  const metric = document.getElementById('ghgMetricFilter')?.value || 'co2';
  const latestYear = Math.max(...ghgData.filter(d => d.year && !isNaN(d.year)).map(d => d.year));
  
  console.log('Latest year for top emitters:', latestYear);
  
  const latestData = ghgData.filter(d => 
    d.year === latestYear && 
    d[metric] && 
    d[metric] > 0 &&
    d.country // Must have a country name
  );
  
  console.log('Latest data points:', latestData.length);
  
  if (latestData.length === 0) {
    console.warn('No data for top emitters chart');
    return;
  }
  
  // Get top 10 and ensure they're valid
  const top10 = latestData
    .sort((a, b) => b[metric] - a[metric])
    .slice(0, 10)
    .filter(d => d[metric] > 0); // Double-check positive values
  
  console.log('Top 10 emitters:', top10.map(d => ({ country: d.country, value: d[metric] })));
  
  const ctx = document.getElementById('ghgTopEmittersChart');
  if (!ctx) return;
  
  if (ghgCharts.topEmitters) {
    ghgCharts.topEmitters.destroy();
    ghgCharts.topEmitters = null;
  }
  
  ghgCharts.topEmitters = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top10.map(d => d.country),
      datasets: [{
        label: `${latestYear}`,
        data: top10.map(d => d[metric]),
        backgroundColor: [
          'rgba(239, 68, 68, 0.8)',
          'rgba(249, 115, 22, 0.8)',
          'rgba(234, 179, 8, 0.8)',
          'rgba(34, 197, 94, 0.8)',
          'rgba(59, 130, 246, 0.8)',
          'rgba(99, 102, 241, 0.8)',
          'rgba(168, 85, 247, 0.8)',
          'rgba(236, 72, 153, 0.8)',
          'rgba(107, 114, 128, 0.8)',
          'rgba(156, 163, 175, 0.8)'
        ],
        borderColor: 'rgba(255, 255, 255, 0.5)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: { 
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => `${context.parsed.x.toFixed(2)} Mt`
          }
        }
      },
      scales: { 
        x: { 
          beginAtZero: true,
          title: { display: true, text: getMetricLabel(metric) }
        },
        y: {
          ticks: {
            autoSkip: false
          }
        }
      }
    }
  });
}

// Render emissions by source pie chart
function renderSourcePieChart() {
  const latestYear = Math.max(...ghgData.filter(d => d.year && !isNaN(d.year)).map(d => d.year));
  const latestData = ghgData.filter(d => d.year === latestYear);
  
  const sources = {
    'Coal': latestData.reduce((sum, d) => sum + (d.coal_co2 && d.coal_co2 > 0 ? d.coal_co2 : 0), 0),
    'Oil': latestData.reduce((sum, d) => sum + (d.oil_co2 && d.oil_co2 > 0 ? d.oil_co2 : 0), 0),
    'Gas': latestData.reduce((sum, d) => sum + (d.gas_co2 && d.gas_co2 > 0 ? d.gas_co2 : 0), 0),
    'Cement': latestData.reduce((sum, d) => sum + (d.cement_co2 && d.cement_co2 > 0 ? d.cement_co2 : 0), 0),
    'Flaring': latestData.reduce((sum, d) => sum + (d.flaring_co2 && d.flaring_co2 > 0 ? d.flaring_co2 : 0), 0)
  };
  
  // Filter out zero values
  const validSources = Object.entries(sources).filter(([_, val]) => val > 0);
  
  const ctx = document.getElementById('ghgSourcePieChart');
  if (!ctx) return;
  
  if (ghgCharts.sourcePie) ghgCharts.sourcePie.destroy();
  
  ghgCharts.sourcePie = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: validSources.map(([key]) => key),
      datasets: [{
        data: validSources.map(([_, val]) => val),
        backgroundColor: [
          'rgba(75, 85, 99, 0.8)',
          'rgba(234, 179, 8, 0.8)',
          'rgba(59, 130, 246, 0.8)',
          'rgba(107, 114, 128, 0.8)',
          'rgba(249, 115, 22, 0.8)'
        ]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right' },
        tooltip: {
          callbacks: {
            label: (context) => {
              const label = context.label || '';
              const value = context.parsed || 0;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = ((value / total) * 100).toFixed(1);
              return `${label}: ${value.toFixed(1)} Mt (${percentage}%)`;
            }
          }
        }
      }
    }
  });
}

// Render regional comparison
function renderRegionalChart() {
  const latestYear = Math.max(...ghgData.filter(d => d.year && !isNaN(d.year)).map(d => d.year));
  const metric = document.getElementById('ghgMetricFilter')?.value || 'co2';
  
  // Use major countries as proxies for regions
  const majorCountries = [
    'China',
    'United States', 
    'India',
    'Russia',
    'Japan',
    'Germany',
    'Iran',
    'South Korea',
    'Saudi Arabia',
    'Indonesia'
  ];
  
  const regionalData = [];
  majorCountries.forEach(country => {
    const countryData = ghgData.find(d => d.country === country && d.year === latestYear && d[metric]);
    if (countryData && countryData[metric] > 0) {
      regionalData.push({
        country: country,
        value: countryData[metric]
      });
    }
  });
  
  regionalData.sort((a, b) => b.value - a.value);
  
  console.log('Regional data:', regionalData);
  
  const ctx = document.getElementById('ghgRegionalChart');
  if (!ctx) return;
  
  if (ghgCharts.regional) {
    ghgCharts.regional.destroy();
    ghgCharts.regional = null;
  }
  
  ghgCharts.regional = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: regionalData.map(d => d.country),
      datasets: [{
        label: `${latestYear}`,
        data: regionalData.map(d => d.value),
        backgroundColor: 'rgba(34, 197, 94, 0.7)',
        borderColor: 'rgb(34, 197, 94)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { 
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => `${context.parsed.y.toFixed(2)} Mt`
          }
        }
      },
      scales: { 
        y: { 
          beginAtZero: true,
          title: { display: true, text: getMetricLabel(metric) }
        },
        x: {
          ticks: {
            maxRotation: 45,
            minRotation: 45
          }
        }
      }
    }
  });
}

// Render country breakdown table
function renderCountryTable() {
  const filtered = getFilteredData();
  const latestYear = Math.max(...filtered.filter(d => d.year && !isNaN(d.year)).map(d => d.year));
  const tableData = filtered
    .filter(d => d.year === latestYear && d.co2 && d.co2 > 0)
    .sort((a, b) => (b.co2 || 0) - (a.co2 || 0))
    .slice(0, 20);
  
  const tbody = document.getElementById('ghgTableBody');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  if (tableData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="px-4 py-3 text-center text-gray-500">No data available</td></tr>';
    return;
  }
  
  tableData.forEach(d => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td class="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-medium text-gray-900">${d.country || 'N/A'}</td>
      <td class="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-500">${d.year || 'N/A'}</td>
      <td class="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-500">${d.co2 ? d.co2.toFixed(2) : '0.00'}</td>
      <td class="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-500">${d.co2_per_capita ? d.co2_per_capita.toFixed(2) : '0.00'}</td>
      <td class="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-500 hidden sm:table-cell">${d.coal_co2 ? d.coal_co2.toFixed(2) : '0.00'}</td>
      <td class="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-500 hidden sm:table-cell">${d.oil_co2 ? d.oil_co2.toFixed(2) : '0.00'}</td>
      <td class="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-500 hidden sm:table-cell">${d.gas_co2 ? d.gas_co2.toFixed(2) : '0.00'}</td>
    `;
    tbody.appendChild(row);
  });
}

// Helper: Get metric display label
function getMetricLabel(metric) {
  const labels = {
    'co2': 'Total CO₂ (Mt)',
    'co2_per_capita': 'CO₂ per Capita (t)',
    'coal_co2': 'Coal CO₂ (Mt)',
    'oil_co2': 'Oil CO₂ (Mt)',
    'gas_co2': 'Gas CO₂ (Mt)',
    'methane': 'Methane [incl. Agriculture] (Mt CO₂e)',
    'nitrous_oxide': 'Nitrous Oxide [incl. Fertilizers/Pesticides] (Mt CO₂e)'
  };
  return labels[metric] || metric;
}

// Export filtered data to CSV
function exportToCSV() {
  const filtered = getFilteredData();
  if (filtered.length === 0) {
    alert('No data to export');
    return;
  }
  
  const headers = ['country', 'year', 'co2', 'co2_per_capita', 'coal_co2', 'oil_co2', 'gas_co2', 'population'];
  let csv = headers.join(',') + '\n';
  
  filtered.forEach(d => {
    const row = headers.map(h => d[h] || '').join(',');
    csv += row + '\n';
  });
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ghg_emissions_export.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// Export to PDF report
function exportToPDF() {
  alert('PDF export functionality coming soon! Use the "Export CSV" button for now.');
  // TODO: Implement PDF export using jsPDF
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGHGVisualizations);
} else {
  initGHGVisualizations();
}

// Handle window resize for responsive charts
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (typeof Chart !== 'undefined' && ghgData.length > 0) {
      Chart.defaults.font.size = window.innerWidth < 768 ? 10 : 12;
      Chart.defaults.plugins.legend.labels.boxWidth = window.innerWidth < 768 ? 30 : 40;
      renderAllCharts();
    }
  }, 250);
});

# SterileLoop

A client-side dashboard for scheduling Sterile Insect Technique (SIT) and irradiation services while tracking global sustainability impact through real-time GHG emissions analytics.

## Table of Contents

- [About](#about)
- [Features](#features)
- [Data](#data)
- [Installation](#installation)
- [Usage](#usage)
- [Screenshots](#screenshots)
- [Technologies](#technologies)
- [Other Resources](#other-resources)
- [License](#license)
- [Contact](#contact)

## About

SterileLoop is a sustainable agriculture scheduling platform that connects farmers with SIT (Sterile Insect Technique) and irradiation service providers. The platform combines location-based provider discovery with comprehensive global GHG emissions analytics to help users understand the environmental impact of agricultural practices.

This hackathon demo implements:
- Interactive provider mapping and booking system
- Real-time GHG emissions visualization with 273 years of historical data
- Sustainability impact calculations for pesticide reduction and food waste prevention
- Client-side data processing for 50,000+ emission records without requiring a backend

## Features

- **📍 Smart Provider Discovery**: Google Maps integration with autocomplete for finding nearby SIT/irradiation providers
- **📊 Global GHG Emissions Analytics**: Interactive visualizations of CO₂ emissions data (1750-2023) for all countries
  - Emissions trend analysis over time
  - Top 10 emitters comparison
  - Emissions breakdown by source (coal, oil, gas, cement, flaring)
  - Country-by-country data filtering
- **🌱 Sustainability Calculations**: Real-time calculation of pesticide reduction, GHG savings, and water conservation
- **📱 Responsive Design**: Optimized for desktop, tablet, and mobile devices
- **💾 Local Booking Storage**: Demo booking system using localStorage (production-ready for Firebase integration)
- **📥 Data Export**: CSV and PDF export capabilities for reports and analytics

## Data

### Provider Data
- **Source**: Local seeded data
- **Format**: CSV (`providers.csv`)
- **Description**: Service provider locations with coordinates, services offered, and contact information

### GHG Emissions Data
- **Source**: [Our World in Data - Global Carbon Budget 2024](https://globalcarbonbudget.org/)
- **Files**: 
  - `data/owid-co2-data.csv` (50,193 rows, 79 columns)
  - `data/owid-co2-codebook.csv` (82 rows - metadata)
- **Format**: CSV
- **Coverage**: 273 years (1750-2023), all countries worldwide
- **Description**: Comprehensive CO₂ emissions data including:
  - Total emissions and per capita metrics
  - Emissions by source (coal, oil, gas, cement, flaring)
  - Other greenhouse gases (methane, nitrous oxide)
  - Population and GDP data for context
- **Processing**: 
  - Client-side CSV parsing with custom parser for quoted fields
  - Filters to exclude aggregate regions (World, continents, income groups)
  - Validates years between 1900-2025
  - Processes ~40,000 clean country-year records in 1-2 seconds

### Pesticide Data
- **Source**: USDA Agricultural Pesticide Use Data
- **Format**: JSON (`data/pesticide_summary.json`), TXT (raw data)
- **Description**: Aggregated pesticide usage by state and year (1992-2016)

## Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/sterileloop.git
   cd sterileloop
   ```

2. **Serve with a static server** (required for Google Maps API)
   ```bash
   python3 -m http.server 8000
   ```
   
   Or using Node.js:
   ```bash
   npx http-server -p 8000
   ```

3. **Open in browser**
   ```
   http://localhost:8000
   ```

No build process or dependencies to install - it's a pure static web application!

## Usage

### Scheduling a Service
1. Navigate to the "New Job / Schedule" section
2. Enter your farm location (autocomplete-enabled)
3. Select service type (SIT or Irradiation)
4. Fill in crop type, acreage, and contact details
5. View nearby providers on the interactive map
6. Submit booking (saved to localStorage in demo)

### Exploring GHG Emissions
1. Scroll to the "Global GHG Emissions Analytics" section
2. View summary cards showing global totals, top emitters, and country count
3. Use filters to customize data:
   - Select specific countries or view all
   - Adjust year range (1990-2023 default)
   - Choose metric (Total CO₂, per capita, coal, oil, gas, methane, etc.)
4. Interact with charts by hovering for detailed information
5. Export filtered data as CSV or PDF report

### Viewing Sustainability Impact
1. Input farm metrics (number of farms, acreage, production)
2. Adjust SIT reduction percentage and irradiation benefits
3. View calculated savings in pesticides, GHG, water, and food waste
4. Generate ESG report for stakeholders

## Screenshots

*Add screenshots here showing:*
- Dashboard overview with provider map
- GHG emissions analytics charts
- Mobile responsive views
- Data export functionality

## Technologies

### Frontend
- **HTML5, CSS3, JavaScript (ES6+)** - Core web technologies
- **Chart.js** - Interactive data visualizations
- **Tailwind CSS** - Utility-first styling framework
- **Google Maps JavaScript API** - Maps and Places Autocomplete

### Data Processing
- **Vanilla JavaScript** - Client-side CSV parsing (custom implementation)
- **Fetch API** - Asynchronous data loading
- **localStorage** - Demo booking persistence

### Libraries (CDN)
- **Chart.js 4.x** - Charts and graphs
- **jsPDF** - PDF report generation
- **Tailwind CSS** - Responsive styling

### Development
- **Python http.server** - Local development server (no build tools required)

## Other Resources

### External APIs
- [Google Maps JavaScript API](https://developers.google.com/maps/documentation/javascript) - Provider mapping and location autocomplete
- API key embedded for demo; restrict by HTTP referrer in production

### Data Sources
- [Our World in Data - CO₂ and Greenhouse Gas Emissions](https://ourworldindata.org/co2-and-greenhouse-gas-emissions) - Global emissions dataset
- [Global Carbon Budget 2024](https://globalcarbonbudget.org/) - Primary source for emissions data

### Documentation
- [Chart.js Documentation](https://www.chartjs.org/docs/) - Chart configuration and customization
- [jsPDF Documentation](https://rawgit.com/MrRio/jsPDF/master/docs/) - PDF generation

### Data Attribution
The GHG emissions data is provided by Our World in Data and sourced from the Global Carbon Budget project. Please ensure proper attribution when using or redistributing this data.

## License

This is a demo/prototype project built for the Desert Dev Lab hackathon. Use freely for educational and prototyping purposes.

## Contact

**Akin Bhattarai** - Desert Dev Team

GitHub: [akin-bh](https://github.com/akin-bh)

---

*Built for Desert Dev Lab Hackathon - Sustainable Agriculture Technology Track*

License
- This is a small demo starter. Use freely for prototyping and extend as needed.

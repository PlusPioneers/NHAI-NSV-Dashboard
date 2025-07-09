/**
 * NHAI NSV Dashboard JavaScript - Frontend Client
 * Communicates with FastAPI backend
 */

// Configuration
const CONFIG = {
    apiBaseUrl: 'http://localhost:8000',
    mapCenter: [20.5937, 78.9629], // India center coordinates
    mapZoom: 5,
    severityColors: {
        'High': '#dc3545',
        'Medium': '#fd7e14',
        'Low': '#28a745'
    },
    markerRadius: 8,
    popupOffset: [0, -10]
};

// Global Variables
let map;
let markers = [];
let pavementData = [];
let originalStatistics = { total: 0, high: 0, medium: 0, low: 0 }; // Store original stats
let currentFilter = 'All';

/**
 * Initialize the map
 */
function initializeMap() {
    map = L.map('map').setView(CONFIG.mapCenter, CONFIG.mapZoom);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18
    }).addTo(map);
    
    console.log('Map initialized successfully');
}

/**
 * API Communication Functions
 */
async function uploadFiles(files) {
    const formData = new FormData();
    Array.from(files).forEach(file => {
        formData.append('files', file);
    });
    
    try {
        showLoadingSpinner(true);
        const response = await fetch(`${CONFIG.apiBaseUrl}/upload`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('Upload error:', error);
        throw error;
    } finally {
        showLoadingSpinner(false);
    }
}

async function fetchData() {
    try {
        const response = await fetch(`${CONFIG.apiBaseUrl}/data`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Fetch data error:', error);
        throw error;
    }
}

async function filterData(severity = null, measurementType = null, highway = null) {
    try {
        const params = new URLSearchParams();
        if (severity) params.append('severity', severity);
        if (measurementType) params.append('measurement_type', measurementType);
        if (highway) params.append('highway', highway);
        
        const response = await fetch(`${CONFIG.apiBaseUrl}/data/filter?${params}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Filter data error:', error);
        throw error;
    }
}

async function clearAllData() {
    try {
        const response = await fetch(`${CONFIG.apiBaseUrl}/data`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Clear data error:', error);
        throw error;
    }
}

async function loadSampleData() {
    try {
        showLoadingSpinner(true);
        const response = await fetch(`${CONFIG.apiBaseUrl}/sample-data`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('Load sample data error:', error);
        throw error;
    } finally {
        showLoadingSpinner(false);
    }
}

async function exportData() {
    try {
        const response = await fetch(`${CONFIG.apiBaseUrl}/export`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        // Create download link
        const blob = new Blob([result.csv_content], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = result.filename;
        link.click();
        URL.revokeObjectURL(url);
        
        showNotification('Data exported successfully!', 'success');
    } catch (error) {
        console.error('Export error:', error);
        showNotification('Error exporting data', 'error');
    }
}
/**
 * Show export modal with filters
 */
function showExportModal() {
    // Populate dropdowns with current data
    populateExportFilters();
    
    // Show the modal
    const exportModal = new bootstrap.Modal(document.getElementById('exportModal'));
    exportModal.show();
}

/**
 * Populate export filter dropdowns
 */
function populateExportFilters() {
    if (!pavementData || pavementData.length === 0) {
        return;
    }
    
    const highways = [...new Set(pavementData.map(d => d.highway))];
    const types = [...new Set(pavementData.map(d => d.type))];
    
    // Populate highway dropdown
    const highwaySelect = document.getElementById('export-highway-filter');
    highwaySelect.innerHTML = '<option value="">All Highways</option>';
    highways.forEach(highway => {
        highwaySelect.innerHTML += `<option value="${highway}">${highway}</option>`;
    });
    
    // Populate type dropdown
    const typeSelect = document.getElementById('export-type-filter');
    typeSelect.innerHTML = '<option value="">All Types</option>';
    types.forEach(type => {
        typeSelect.innerHTML += `<option value="${type}">${type}</option>`;
    });
}

/**
 * Preview export data based on filters
 */
function previewExportData() {
    const filters = getExportFilters();
    const columns = getSelectedColumns();
    const filteredData = applyExportFilters(pavementData, filters);
    
    // Update preview
    const previewDiv = document.getElementById('export-preview');
    if (filteredData.length === 0) {
        previewDiv.innerHTML = '<small class="text-warning">No data matches the selected filters</small>';
        return;
    }
    
    const limitedData = filters.limit ? filteredData.slice(0, parseInt(filters.limit)) : filteredData;
    
    previewDiv.innerHTML = `
        <div class="row">
            <div class="col-md-6">
                <small><strong>Total matching records:</strong> ${filteredData.length}</small><br>
                <small><strong>Records to export:</strong> ${limitedData.length}</small><br>
                <small><strong>Selected columns:</strong> ${columns.length}</small>
            </div>
            <div class="col-md-6">
                <small><strong>Applied filters:</strong></small><br>
                <small>Severity: ${filters.severity || 'All'}</small><br>
                <small>Type: ${filters.type || 'All'}</small><br>
                <small>Highway: ${filters.highway || 'All'}</small>
            </div>
        </div>
        <div class="mt-2">
            <small class="text-muted">Sample data preview:</small>
            <div class="table-responsive mt-1" style="max-height: 200px; overflow-y: auto;">
                <table class="table table-sm table-striped">
                    <thead>
                        <tr>
                            ${columns.map(col => `<th>${col}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${limitedData.slice(0, 5).map(row => `
                            <tr>
                                ${columns.map(col => `<td>${formatExportValue(row, col)}</td>`).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            ${limitedData.length > 5 ? `<small class="text-muted">... and ${limitedData.length - 5} more rows</small>` : ''}
        </div>
    `;
}

/**
 * Get export filters from form
 */
function getExportFilters() {
    return {
        severity: document.getElementById('export-severity-filter').value,
        type: document.getElementById('export-type-filter').value,
        highway: document.getElementById('export-highway-filter').value,
        limit: document.getElementById('export-limit').value
    };
}

/**
 * Get selected columns for export
 */
function getSelectedColumns() {
    const checkboxes = document.querySelectorAll('#exportModal input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

/**
 * Apply filters to data
 */
function applyExportFilters(data, filters) {
    let filteredData = data.slice(); // Create a copy
    
    if (filters.severity) {
        filteredData = filteredData.filter(item => item.severity === filters.severity);
    }
    
    if (filters.type) {
        filteredData = filteredData.filter(item => item.type === filters.type);
    }
    
    if (filters.highway) {
        filteredData = filteredData.filter(item => item.highway === filters.highway);
    }
    
    return filteredData;
}

/**
 * Format export value for display
 */
function formatExportValue(row, column) {
    if (column === 'googleMapsLink') {
        return `https://maps.google.com/?q=${row.lat},${row.lng}`;
    }
    return row[column] || 'N/A';
}

/**
 * Export filtered data
 */
async function exportFilteredData() {
    const filters = getExportFilters();
    const columns = getSelectedColumns();
    
    if (columns.length === 0) {
        showNotification('Please select at least one column to export', 'warning');
        return;
    }
    
    try {
        const filteredData = applyExportFilters(pavementData, filters);
        
        if (filteredData.length === 0) {
            showNotification('No data matches the selected filters', 'warning');
            return;
        }
        
        // Apply limit if specified
        const limitedData = filters.limit ? filteredData.slice(0, parseInt(filters.limit)) : filteredData;
        
        // Prepare data for export
        const exportData = limitedData.map(row => {
            const exportRow = {};
            columns.forEach(col => {
                if (col === 'googleMapsLink') {
                    exportRow[col] = `https://maps.google.com/?q=${row.lat},${row.lng}`;
                } else {
                    exportRow[col] = row[col] || 'N/A';
                }
            });
            return exportRow;
        });
        
        // Convert to CSV
        const csvContent = convertToCSV(exportData);
        
        // Create download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        
        // Generate filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filterSuffix = filters.severity ? `_${filters.severity}` : '';
        const filename = `nhai_pavement_data_filtered${filterSuffix}_${timestamp}.csv`;
        
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Close modal and show success message
        const exportModal = bootstrap.Modal.getInstance(document.getElementById('exportModal'));
        exportModal.hide();
        
        showNotification(`Successfully exported ${limitedData.length} records`, 'success');
        
    } catch (error) {
        console.error('Export error:', error);
        showNotification('Error exporting data', 'error');
    }
}

/**
 * Convert data to CSV format
 */
function convertToCSV(data) {
    if (!data || data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')];
    
    data.forEach(row => {
        const values = headers.map(header => {
            const value = row[header];
            // Escape quotes and wrap in quotes if contains comma
            const escaped = String(value).replace(/"/g, '""');
            return escaped.includes(',') ? `"${escaped}"` : escaped;
        });
        csvRows.push(values.join(','));
    });
    
    return csvRows.join('\n');
}

/**
 * Map and UI Functions
 */
function addMarkersToMap(data) {
    clearMarkers();
    
    data.forEach((point, index) => {
        if (!isValidCoordinate(point.lat, point.lng)) {
            console.warn('Invalid coordinates:', point);
            return;
        }
        
        const marker = L.circleMarker([point.lat, point.lng], {
            radius: CONFIG.markerRadius,
            fillColor: CONFIG.severityColors[point.severity] || CONFIG.severityColors['Medium'],
            color: '#fff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
        }).addTo(map);
        
        const popupContent = createPopupContent(point);
        marker.bindPopup(popupContent);
        
        markers.push(marker);
    });
    
    if (data.length > 0) {
        fitMapToMarkers();
    }
    
    generateSeverityList(data);
    console.log(`Added ${data.length} markers to map`);
}

function clearMarkers() {
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
}

function createPopupContent(point) {
    return `
        <div class="popup-content">
            <h6><i class="fas fa-road"></i> ${point.highway || 'N/A'}</h6>
            <p><strong>Lane:</strong> ${point.lane || 'N/A'}</p>
            <p><strong>Chainage:</strong> ${point.startChainage || 'N/A'} - ${point.endChainage || 'N/A'}</p>
            <p><strong>Structure:</strong> ${point.structure || 'N/A'}</p>
            <p><strong>Measurement:</strong> ${point.type || 'N/A'}</p>
            <p><strong>Value:</strong> ${point.value || 'N/A'} ${point.unit || ''}</p>
            <p><strong>Limit:</strong> ${point.limit || 'N/A'} ${point.unit || ''}</p>
            <p><strong>Severity:</strong> <span class="severity-badge severity-${point.severity.toLowerCase()}">${point.severity}</span></p>
            <p><strong>Date:</strong> ${new Date(point.datetime).toLocaleString()}</p>
        </div>
    `;
}

function isValidCoordinate(lat, lng) {
    return (
        typeof lat === 'number' && 
        typeof lng === 'number' && 
        !isNaN(lat) && 
        !isNaN(lng) && 
        lat >= -90 && 
        lat <= 90 && 
        lng >= -180 && 
        lng <= 180
    );
}

function fitMapToMarkers() {
    if (markers.length === 0) return;
    
    const group = new L.featureGroup(markers);
    map.fitBounds(group.getBounds(), { padding: [20, 20] });
}

let currentSeverityData = [];
let currentDisplayedItems = 0;
let itemsPerPage = 50;
let currentSeverityFilter = 'All';

/**
 * Generate severity list with pagination
 */
function generateSeverityList(data) {
    currentSeverityData = data;
    currentDisplayedItems = 0;
    currentSeverityFilter = 'All';
    
    const severityList = document.getElementById('severity-list');
    const loadMoreContainer = document.getElementById('load-more-container');
    const severityStats = document.getElementById('severity-stats');
    
    if (!severityList) return;
    
    // Clear existing content
    severityList.innerHTML = '';
    
    if (data.length === 0) {
        severityList.innerHTML = `
            <div class="text-center p-4 text-muted">
                <i class="fas fa-upload fa-2x mb-2"></i>
                <p>No data loaded yet</p>
                <small>Upload data files to see severity issues</small>
            </div>
        `;
        loadMoreContainer.style.display = 'none';
        severityStats.style.display = 'none';
        return;
    }
    
    // Show initial items
    loadMoreItems(true);
    
    // Show/hide load more button and stats
    updateLoadMoreButton();
    updateSeverityStats();
    severityStats.style.display = 'block';
}

/**
 * Load more items (50 at a time)
 */
function loadMoreItems(isInitialLoad = false) {
    const severityList = document.getElementById('severity-list');
    const loadMoreBtn = document.getElementById('load-more-btn');
    
    if (!severityList || !currentSeverityData.length) return;
    
    // Show loading state
    if (!isInitialLoad) {
        loadMoreBtn.classList.add('loading');
        loadMoreBtn.disabled = true;
    }
    
    // Filter data based on current filter
    let filteredData = currentSeverityData;
    if (currentSeverityFilter !== 'All') {
        filteredData = currentSeverityData.filter(point => point.severity === currentSeverityFilter);
    }
    
    // Calculate which items to show
    const startIndex = currentDisplayedItems;
    const endIndex = Math.min(startIndex + itemsPerPage, filteredData.length);
    const itemsToShow = filteredData.slice(startIndex, endIndex);
    
    // Group items by severity for display
    const groupedItems = groupItemsBySeverity(itemsToShow);
    
    // If this is initial load, clear the list first
    if (isInitialLoad) {
        severityList.innerHTML = '';
    }
    
    // Add new items to the display
    setTimeout(() => {
        Object.entries(groupedItems).forEach(([severity, points]) => {
            addSeveritySection(severity, points, isInitialLoad);
        });
        
        // Update displayed items count
        currentDisplayedItems = endIndex;
        
        // Update UI
        updateLoadMoreButton();
        updateSeverityStats();
        
        // Remove loading state
        if (!isInitialLoad) {
            loadMoreBtn.classList.remove('loading');
            loadMoreBtn.disabled = false;
        }
    }, isInitialLoad ? 0 : 500);
}

/**
 * Group items by severity
 */
function groupItemsBySeverity(items) {
    return items.reduce((acc, point) => {
        if (!acc[point.severity]) acc[point.severity] = [];
        acc[point.severity].push(point);
        return acc;
    }, {});
}

/**
 * Add or update severity section
 */
function addSeveritySection(severity, points, isInitialLoad) {
    const severityList = document.getElementById('severity-list');
    let existingSection = severityList.querySelector(`[data-severity="${severity}"]`);
    
    if (!existingSection) {
        // Create new section
        const section = document.createElement('div');
        section.className = 'severity-section';
        section.setAttribute('data-severity', severity);
        
        const itemsContainer = document.createElement('div');
        itemsContainer.className = 'severity-items-container';
        itemsContainer.innerHTML = `
            <h6 class="severity-title p-3 mb-0 border-bottom">
                <span class="severity-badge severity-${severity.toLowerCase()}">${severity}</span>
                <span class="count" data-count="${severity}">0</span>
            </h6>
            <div class="severity-items" data-severity-items="${severity}"></div>
        `;
        
        section.appendChild(itemsContainer);
        severityList.appendChild(section);
        existingSection = section;
    }
    
    // Add items to the section
    const itemsContainer = existingSection.querySelector(`[data-severity-items="${severity}"]`);
    const countElement = existingSection.querySelector(`[data-count="${severity}"]`);
    
    points.forEach(point => {
        const itemElement = document.createElement('div');
        itemElement.className = `severity-item ${!isInitialLoad ? 'new-item' : ''}`;
        itemElement.onclick = () => highlightMarker(point.lat, point.lng);
        itemElement.innerHTML = `
            <div class="d-flex justify-content-between align-items-start p-3 border-bottom">
                <div class="flex-grow-1">
                    <div class="d-flex align-items-center mb-1">
                        <i class="fas fa-map-marker-alt text-muted me-2"></i>
                        <strong>${point.highway} - ${point.lane}</strong>
                    </div>
                    <div class="item-details">
                        <small class="text-muted d-block">${point.type}: ${point.value} ${point.unit}</small>
                        <small class="text-muted">Chainage: ${point.startChainage} - ${point.endChainage}</small>
                    </div>
                </div>
                <div class="text-end">
                    <span class="severity-badge severity-${point.severity.toLowerCase()}">${point.severity}</span>
                </div>
            </div>
        `;
        
        itemsContainer.appendChild(itemElement);
    });
    
    // Update count
    const currentCount = parseInt(countElement.textContent.replace(/[()]/g, '')) || 0;
    countElement.textContent = `(${currentCount + points.length})`;
}

/**
 * Update load more button visibility and text
 */
function updateLoadMoreButton() {
    const loadMoreContainer = document.getElementById('load-more-container');
    const loadMoreBtn = document.getElementById('load-more-btn');
    const loadMoreInfo = document.getElementById('load-more-info');
    
    if (!loadMoreContainer || !currentSeverityData.length) return;
    
    // Filter data based on current filter
    let filteredData = currentSeverityData;
    if (currentSeverityFilter !== 'All') {
        filteredData = currentSeverityData.filter(point => point.severity === currentSeverityFilter);
    }
    
    const remainingItems = filteredData.length - currentDisplayedItems;
    
    if (remainingItems > 0) {
        loadMoreContainer.style.display = 'block';
        const itemsToLoad = Math.min(itemsPerPage, remainingItems);
        loadMoreBtn.innerHTML = `<i class="fas fa-plus"></i> Load More (${itemsToLoad})`;
        loadMoreInfo.textContent = `${remainingItems} items remaining`;
    } else {
        loadMoreContainer.style.display = 'none';
    }
}

/**
 * Update severity statistics display
 */
function updateSeverityStats() {
    const showingCount = document.getElementById('showing-count');
    const totalCount = document.getElementById('total-count');
    
    if (!showingCount || !totalCount) return;
    
    // Filter data based on current filter
    let filteredData = currentSeverityData;
    if (currentSeverityFilter !== 'All') {
        filteredData = currentSeverityData.filter(point => point.severity === currentSeverityFilter);
    }
    
    showingCount.textContent = Math.min(currentDisplayedItems, filteredData.length);
    totalCount.textContent = filteredData.length;
}

/**
 * Updated filter severity list function with pagination support
 */
function filterSeverityList(severity) {
    currentSeverityFilter = severity;
    currentDisplayedItems = 0;
    
    // Update active button
    document.querySelectorAll('[id^="filter"]').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById('filter' + severity).classList.add('active');
    
    // Regenerate list with new filter
    generateSeverityList(currentSeverityData);
}

function highlightMarker(lat, lng) {
    const marker = markers.find(m => 
        Math.abs(m.getLatLng().lat - lat) < 0.001 && 
        Math.abs(m.getLatLng().lng - lng) < 0.001
    );
    
    if (marker) {
        // Calculate optimal zoom level based on current view
        const currentZoom = map.getZoom();
        let targetZoom;
        
        if (currentZoom < 12) {
            targetZoom = 16; // Zoom in significantly if currently far out
        } else if (currentZoom < 15) {
            targetZoom = 17; // Moderate zoom in
        } else {
            targetZoom = Math.min(18, currentZoom + 2); // Fine adjustment, max zoom 18
        }
        
        // Smooth fly-to animation for better user experience
        map.flyTo([lat, lng], targetZoom, {
            animate: true,
            duration: 1.2,
            easeLinearity: 0.1
        });
        
        // Enhanced popup and highlight effects
        setTimeout(() => {
            // Store original marker properties
            const originalRadius = marker.getRadius();
            const originalColor = marker.options.color;
            const originalWeight = marker.options.weight;
            
            // Create pulsing highlight effect
            let pulseCount = 0;
            const pulseInterval = setInterval(() => {
                if (pulseCount % 2 === 0) {
                    marker.setStyle({
                        color: '#ffff00',
                        weight: 5,
                        radius: originalRadius + 3
                    });
                } else {
                    marker.setStyle({
                        color: originalColor,
                        weight: originalWeight,
                        radius: originalRadius
                    });
                }
                
                pulseCount++;
                if (pulseCount >= 4) { // 2 complete pulses
                    clearInterval(pulseInterval);
                    // Ensure marker returns to original state
                    marker.setStyle({
                        color: originalColor,
                        weight: originalWeight,
                        radius: originalRadius
                    });
                }
            }, 300);
            
            // Open popup after animation
            marker.openPopup();
            
        }, 600);
    }
}

/**
 * UI Helper Functions
 */
function showLoadingSpinner(show = true) {
    const spinner = document.getElementById('loading-spinner');
    if (spinner) {
        spinner.style.display = show ? 'block' : 'none';
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `alert alert-${type} alert-dismissible fade show notification`;
    notification.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    const container = document.getElementById('notification-container') || document.body;
    container.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

/**
 * Update the top statistics cards (these should NOT change when filters are applied)
 */
function updateTopStatisticsCards(stats) {
    // Store original statistics for future reference
    originalStatistics = {
        total: stats.total || 0,
        high: stats.high || 0,
        medium: stats.medium || 0,
        low: stats.low || 0
    };
    
    // Update the top cards with original/full statistics
    document.getElementById('totalPoints').textContent = originalStatistics.total;
    document.getElementById('highSeverity').textContent = originalStatistics.high;
    document.getElementById('mediumSeverity').textContent = originalStatistics.medium;
    document.getElementById('lowSeverity').textContent = originalStatistics.low;
}

/**
 * Update the detailed statistics section (this can change with filters)
 */
function updateDetailedStatistics(stats) {
    const statsContainer = document.getElementById('statistics');
    if (!statsContainer) return;
    
    if (stats.total > 0) {
        statsContainer.innerHTML = `
            <div class="row">
                <div class="col-md-6">
                    <h6>By Measurement Type</h6>
                    <div class="table-responsive">
                        <table class="table table-sm">
                            <thead>
                                <tr>
                                    <th>Type</th>
                                    <th>Total</th>
                                    <th>High</th>
                                    <th>Medium</th>
                                    <th>Low</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${Object.entries(stats.by_type || {}).map(([type, counts]) => `
                                    <tr>
                                        <td>${type}</td>
                                        <td>${counts.total}</td>
                                        <td class="text-danger">${counts.high}</td>
                                        <td class="text-warning">${counts.medium}</td>
                                        <td class="text-success">${counts.low}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="col-md-6">
                    <h6>By Highway</h6>
                    <div class="table-responsive">
                        <table class="table table-sm">
                            <thead>
                                <tr>
                                    <th>Highway</th>
                                    <th>Total</th>
                                    <th>High</th>
                                    <th>Medium</th>
                                    <th>Low</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${Object.entries(stats.by_highway || {}).map(([highway, counts]) => `
                                    <tr>
                                        <td>${highway}</td>
                                        <td>${counts.total}</td>
                                        <td class="text-danger">${counts.high}</td>
                                        <td class="text-warning">${counts.medium}</td>
                                        <td class="text-success">${counts.low}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    } else {
        statsContainer.innerHTML = `
            <div class="text-center text-muted">
                <i class="fas fa-chart-line fa-2x mb-2"></i>
                <p>No statistics available</p>
                <small>Upload data to see detailed statistics</small>
            </div>
        `;
    }
}

/**
 * Reset statistics cards to zero (when data is cleared)
 */
function resetStatisticsCards() {
    originalStatistics = { total: 0, high: 0, medium: 0, low: 0 };
    document.getElementById('totalPoints').textContent = 0;
    document.getElementById('highSeverity').textContent = 0;
    document.getElementById('mediumSeverity').textContent = 0;
    document.getElementById('lowSeverity').textContent = 0;
}

function updateFilterDropdowns(data) {
    const highways = [...new Set(data.map(d => d.highway))];
    const measurementTypes = [...new Set(data.map(d => d.type))];
    
    const highwaySelect = document.getElementById('highway-filter');
    const typeSelect = document.getElementById('type-filter');
    
    if (highwaySelect) {
        highwaySelect.innerHTML = '<option value="">All Highways</option>';
        highways.forEach(highway => {
            highwaySelect.innerHTML += `<option value="${highway}">${highway}</option>`;
        });
    }
    
    if (typeSelect) {
        typeSelect.innerHTML = '<option value="">All Types</option>';
        measurementTypes.forEach(type => {
            typeSelect.innerHTML += `<option value="${type}">${type}</option>`;
        });
    }
}

/**
 * Event Handlers
 */
function initializeEventHandlers() {
    // File upload handler
    const fileInput = document.getElementById('file-input');
    if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
            const files = e.target.files;
            if (files.length > 0) {
                try {
                    const result = await uploadFiles(files);
                    pavementData = result.data;
                    addMarkersToMap(pavementData);
                    updateTopStatisticsCards(result.statistics); // Update top cards
                    updateDetailedStatistics(result.statistics); // Update detailed stats
                    updateFilterDropdowns(pavementData);
                    showNotification(`Successfully uploaded ${files.length} file(s)`, 'success');
                } catch (error) {
                    showNotification(`Upload failed: ${error.message}`, 'error');
                }
            }
        });
    }
    
    // Sample data button
    const sampleDataBtn = document.getElementById('sample-data-btn');
    if (sampleDataBtn) {
        sampleDataBtn.addEventListener('click', async () => {
            try {
                const result = await loadSampleData();
                pavementData = result.data;
                addMarkersToMap(pavementData);
                updateTopStatisticsCards(result.statistics); // Update top cards
                updateDetailedStatistics(result.statistics); // Update detailed stats
                updateFilterDropdowns(pavementData);
                showNotification('Sample data loaded successfully', 'success');
            } catch (error) {
                showNotification(`Failed to load sample data: ${error.message}`, 'error');
            }
        });
    }
    
    // Clear data button
    const clearDataBtn = document.getElementById('clear-data-btn');
    if (clearDataBtn) {
        clearDataBtn.addEventListener('click', async () => {
            if (confirm('Are you sure you want to clear all data?')) {
                try {
                    await clearAllData();
                    pavementData = [];
                    clearMarkers();
                    resetStatisticsCards(); // Reset top cards to zero
                    updateDetailedStatistics({ total: 0, high: 0, medium: 0, low: 0 }); // Reset detailed stats
                    showNotification('All data cleared successfully', 'success');
                } catch (error) {
                    showNotification(`Failed to clear data: ${error.message}`, 'error');
                }
            }
        });
    }
    // Updated Export data button handler
    const exportDataBtn = document.getElementById('export-data-btn');
    if (exportDataBtn) {
        exportDataBtn.addEventListener('click', () => {
            if (!pavementData || pavementData.length === 0) {
                showNotification('No data available to export', 'warning');
                return;
            }
            showExportModal();
        });
    }
    
    // Filter handlers
    const severityFilter = document.getElementById('severity-filter');
    const typeFilter = document.getElementById('type-filter');
    const highwayFilter = document.getElementById('highway-filter');
    
    const applyFilters = async () => {
        const severity = severityFilter?.value || null;
        const type = typeFilter?.value || null;
        const highway = highwayFilter?.value || null;
        
        try {
            const result = await filterData(severity, type, highway);
            addMarkersToMap(result.data);
            // DON'T update top statistics cards - they should remain unchanged
            updateDetailedStatistics(result.statistics); // Only update detailed stats
            showNotification(`Filter applied: ${result.total_points} points shown`, 'info');
        } catch (error) {
            showNotification(`Filter failed: ${error.message}`, 'error');
        }
    };
    
    severityFilter?.addEventListener('change', applyFilters);
    typeFilter?.addEventListener('change', applyFilters);
    highwayFilter?.addEventListener('change', applyFilters);
    
    // Refresh data button
    const refreshDataBtn = document.getElementById('refresh-data-btn');
    if (refreshDataBtn) {
        refreshDataBtn.addEventListener('click', async () => {
            try {
                const result = await fetchData();
                pavementData = result.data;
                addMarkersToMap(pavementData);
                updateTopStatisticsCards(result.statistics); // Update top cards
                updateDetailedStatistics(result.statistics); // Update detailed stats
                updateFilterDropdowns(pavementData);
                showNotification('Data refreshed successfully', 'success');
            } catch (error) {
                showNotification(`Refresh failed: ${error.message}`, 'error');
            }
        });
    }
    // Export modal event handlers
    const previewExportBtn = document.getElementById('preview-export-btn');
    if (previewExportBtn) {
        previewExportBtn.addEventListener('click', previewExportData);
    }
    
    const confirmExportBtn = document.getElementById('confirm-export-btn');
    if (confirmExportBtn) {
        confirmExportBtn.addEventListener('click', exportFilteredData);
    }
    
    // Auto-preview when filters change
    const exportFilters = ['export-severity-filter', 'export-type-filter', 'export-highway-filter', 'export-limit'];
    exportFilters.forEach(filterId => {
        const filterElement = document.getElementById(filterId);
        if (filterElement) {
            filterElement.addEventListener('change', previewExportData);
        }
    });
    
    // Auto-preview when columns change
    const exportModal = document.getElementById('exportModal');
    if (exportModal) {
        exportModal.addEventListener('change', (e) => {
            if (e.target.type === 'checkbox') {
                previewExportData();
            }
        });
    }
}

/**
 * Initialize the application
 */
document.addEventListener('DOMContentLoaded', () => {
    console.log('NHAI NSV Dashboard initializing...');
    
    try {
        initializeMap();
        initializeEventHandlers();
        
        // Load initial data if available
        fetchData().then(result => {
            if (result.data.length > 0) {
                pavementData = result.data;
                addMarkersToMap(pavementData);
                updateTopStatisticsCards(result.statistics); // Update top cards
                updateDetailedStatistics(result.statistics); // Update detailed stats
                updateFilterDropdowns(pavementData);
            }
        }).catch(error => {
            console.log('No initial data available:', error.message);
        });
        
        console.log('NHAI NSV Dashboard initialized successfully');
    } catch (error) {
        console.error('Failed to initialize dashboard:', error);
        showNotification('Failed to initialize dashboard', 'error');
    }
});

/**
 * Utility Functions
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function formatValue(value, unit) {
    if (typeof value === 'number') {
        return `${value.toFixed(2)} ${unit}`;
    }
    return `${value} ${unit}`;
}

function getSeverityClass(severity) {
    return `severity-${severity.toLowerCase()}`;
}

// Error handler for uncaught errors
window.addEventListener('error', (event) => {
    console.error('Uncaught error:', event.error);
    showNotification('An unexpected error occurred', 'error');
});

// Handle API connection errors
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    if (event.reason.message && event.reason.message.includes('fetch')) {
        showNotification('Unable to connect to server. Please check if the backend is running.', 'error');
    }
});
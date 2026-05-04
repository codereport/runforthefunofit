document.addEventListener('DOMContentLoaded', function() {
  // Extract race data from the table
  const table = document.querySelector('table');
  const rows = Array.from(table.querySelectorAll('tr')).slice(1); // Skip header row
  
  // Define race name mappings for renamed races
  const raceNameMappings = {
    "Scotiabank Waterfront Half": "TCS Waterfront Half"
  };
  
  // Define minimum date cutoff - May 1, 2014
  const minDate = new Date('2014-05-01');
  
  // Define race distances in kilometers for pace calculations
  const distanceValues = {
    '5k': 5,
    '10k': 10,
    'Half': 21.0975,
    'Marathon': 42.195,
    '8k': 8,
    '6k': 6,
    '1 Mile': 1.60934
  };
  
  const races = [];
  rows.forEach(row => {
    const cells = row.querySelectorAll('td');
    if (cells.length >= 4) { // Ensure we have enough cells
      const date = cells[0].textContent.trim();
      // Skip section headers, pandemic markers and dates with invalid format
      if (date.includes('--') || !date.match(/^\d{4}-\d{2}-\d{2}$/)) return;
      
      // Skip races before May 2014
      const raceDate = new Date(date);
      if (raceDate < minDate) return;
      
      let raceName = cells[1].textContent.trim();
      // Apply race name mapping if this race has been renamed
      raceName = raceNameMappings[raceName] || raceName;
      
      const distance = cells[2].textContent.trim();
      const timeStr = cells[3].textContent.trim();
      
      // Parse time to seconds for graphing
      let seconds = 0;
      if (timeStr.includes(':')) {
        const parts = timeStr.split(':');
        if (parts.length === 2) {
          seconds = parseInt(parts[0]) * 60 + parseFloat(parts[1]);
        } else if (parts.length === 3) {
          seconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
        }
      }
      
      if (seconds > 0) {
        // Calculate pace (seconds per km)
        const distanceKm = distanceValues[distance] || 0;
        const pace = distanceKm > 0 ? seconds / distanceKm : 0;
        
        races.push({
          date: raceDate,
          name: raceName,
          distance: distance,
          timeSeconds: seconds,
          timeFormatted: timeStr,
          pace: pace
        });
      }
    }
  });
  
  // Count race occurrences to find those run 3+ times
  const raceCounts = {};
  races.forEach(race => {
    raceCounts[race.name] = (raceCounts[race.name] || 0) + 1;
  });
  
  // Add options for races run 3+ times
  const filter = document.getElementById('raceFilter');
  Object.entries(raceCounts).forEach(([name, count]) => {
    if (count >= 3) {
      const option = document.createElement('option');
      option.value = `race:${name}`;
      option.textContent = name;
      filter.appendChild(option);
    }
  });
  
  // Set up the chart
  const ctx = document.getElementById('raceChart').getContext('2d');
  let chart = null;
  
  // Format pace (MM:SS per km)
  const formatPace = (paceSeconds) => {
    const m = Math.floor(paceSeconds / 60);
    const s = Math.floor(paceSeconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}/km`;
  };
  
  // Format y-axis time labels (MM:SS or HH:MM:SS)
  const formatTime = (seconds) => {
    if (seconds >= 3600) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    } else {
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      return `${m}:${s.toString().padStart(2, '0')}`;
    }
  };
  
  function updateChart(filterValue) {
    let filteredRaces = races;
    let title = '';
    let showMultipleDistances = false;
    let usePace = false;
    
    if (filterValue === 'AllRaces') {
      // Only include major race types for the combined view
      filteredRaces = races.filter(race => 
        race.distance === '5k' || 
        race.distance === '10k' || 
        race.distance === 'Half' ||
        race.distance === 'Marathon'
      );
      title = 'All Races (Pace)';
      showMultipleDistances = true;
      usePace = true;
    } else if (filterValue === '5k') {
      filteredRaces = races.filter(race => race.distance === '5k');
      title = 'All 5k Races';
    } else if (filterValue === '10k') {
      filteredRaces = races.filter(race => race.distance === '10k');
      title = 'All 10k Races';
    } else if (filterValue === 'Half') {
      filteredRaces = races.filter(race => race.distance === 'Half');
      title = 'All Half Marathons';
    } else if (filterValue === 'Marathon') {
      filteredRaces = races.filter(race => race.distance === 'Marathon');
      title = 'All Marathons';
    } else if (filterValue.startsWith('race:')) {
      const raceName = filterValue.substring(5);
      filteredRaces = races.filter(race => race.name === raceName);
      title = raceName;
    }
    
    // Destroy existing chart if it exists
    if (chart) {
      chart.destroy();
    }
    
    if (showMultipleDistances) {
      // Group races by distance
      const raceTypes = ['5k', '10k', 'Half', 'Marathon'];
      const datasets = [];
      const colors = {
        '5k': 'rgb(0, 128, 255)', // Blue
        '10k': 'rgb(255, 0, 0)',  // Red
        'Half': 'rgb(0, 128, 0)',   // Green
        'Marathon': 'rgb(238, 32, 238)'  // Pink
      };
      
      // Create a unified chronological list of all races
      const allRacesSorted = filteredRaces.sort((a, b) => a.date - b.date);
      
      // Create a map to track x positions by date
      const dateToXPosition = new Map();
      allRacesSorted.forEach((race, index) => {
        const dateKey = race.date.toISOString().split('T')[0];
        if (!dateToXPosition.has(dateKey)) {
          dateToXPosition.set(dateKey, dateToXPosition.size);
        }
      });
      
      // Create simple sequential labels (one per unique date)
      const xLabels = Array(dateToXPosition.size).fill('');
      
      // Create datasets for each distance type
      raceTypes.forEach(distanceType => {
        const distanceRaces = filteredRaces
          .filter(race => race.distance === distanceType);
          
        if (distanceRaces.length > 0) {
          datasets.push({
            label: distanceType,
            data: distanceRaces.map(race => {
              const dateKey = race.date.toISOString().split('T')[0];
              const xPos = dateToXPosition.get(dateKey);
              
              return {
                x: xPos,
                y: race.pace,
                race: race
              };
            }),
            borderColor: colors[distanceType],
            backgroundColor: colors[distanceType],
            tension: 0.1,
            fill: false,
            pointRadius: 7,
            showLine: true
          });
        }
      });
      
      // Create chart with multiple datasets
      chart = new Chart(ctx, {
        type: 'scatter',
        data: {
          labels: xLabels,
          datasets: datasets
        },
        options: {
          font: {
            family: "'JetBrains Mono', monospace"
          },
          scales: {
            x: {
              type: 'linear',
              min: -0.5,
              max: dateToXPosition.size - 0.5,
              title: {
                display: true,
                text: 'Race Timeline',
                font: {
                  family: "'JetBrains Mono', monospace"
                }
              },
              ticks: {
                stepSize: 1,
                display: false,
                font: {
                  family: "'JetBrains Mono', monospace"
                }
              },
              grid: {
                display: false
              }
            },
            y: {
              // Not reversed - higher pace will be higher on chart
              reverse: false,
              ticks: {
                callback: formatPace,
                font: {
                  family: "'JetBrains Mono', monospace"
                }
              },
              title: {
                display: true,
                text: 'Pace (min/km)',
                font: {
                  family: "'JetBrains Mono', monospace"
                }
              }
            }
          },
          plugins: {
            tooltip: {
              titleFont: {
                size: 18,
                weight: 'bold',
                family: "'JetBrains Mono', monospace"
              },
              bodyFont: {
                size: 18,
                family: "'JetBrains Mono', monospace"
              },
              padding: 15,
              position: 'nearest',
              caretPadding: 20,
              yAlign: 'bottom',
              callbacks: {
                title: (tooltipItems) => {
                  const race = tooltipItems[0].raw.race;
                  // Format date as YYYY-MM-DD
                  const dateStr = race.date.toISOString().split('T')[0];
                  return `${race.name} (${dateStr})`;
                },
                label: (context) => {
                  const race = context.raw.race;
                  return `${race.distance}: ${formatPace(race.pace)} (${race.timeFormatted})`;
                },
                afterLabel: (context) => {
                  // Add race date info
                  const race = context.raw.race;
                  return `Date: ${race.date.toISOString().split('T')[0]}`;
                }
              }
            }
          },
          elements: {
            point: {
              radius: 7,
              hoverRadius: 16,
              z: 10
            }
          }
        }
      });
    } else {
      // Sort by date for single-distance charts
      filteredRaces.sort((a, b) => a.date - b.date);
      
      // Create chart data
      const labels = filteredRaces.map(race => race.date.toISOString().split('T')[0]);
      const data = filteredRaces.map(race => usePace ? race.pace : race.timeSeconds);
      
      // Create new chart
      chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: title,
            data: data,
            borderColor: 'rgb(0, 128, 0)', // Green line
            backgroundColor: 'rgb(0, 128, 0)',
            tension: 0.1,
            fill: false,
            pointRadius: 7 // Match with scatter chart
          }]
        },
        options: {
          font: {
            family: "'JetBrains Mono', monospace"
          },
          elements: {
            point: {
              radius: 7,
              hoverRadius: 16,
              z: 10
            }
          },
          scales: {
            y: {
              // For pace, lower is better so reverse the axis
              reverse: usePace,
              ticks: {
                callback: usePace ? formatPace : formatTime,
                font: {
                  family: "'JetBrains Mono', monospace"
                }
              },
              title: {
                font: {
                  family: "'JetBrains Mono', monospace"
                }
              }
            }
          },
          plugins: {
            tooltip: {
              titleFont: {
                size: 18,
                weight: 'bold',
                family: "'JetBrains Mono', monospace"
              },
              bodyFont: {
                size: 18,
                family: "'JetBrains Mono', monospace"
              },
              padding: 15,
              position: 'nearest',
              caretPadding: 20,
              yAlign: 'bottom',
              callbacks: {
                label: (context) => {
                  const index = context.dataIndex;
                  const race = filteredRaces[index];
                  return `${race.name} - ${race.timeFormatted}`;
                }
              }
            }
          }
        }
      });
    }
  }
  
  // === TABLE FILTERING & SORTING ===

  const allTableRows = Array.from(table.querySelectorAll('tr'));
  const headerRow = allTableRows[0];
  const bodyRows = allTableRows.slice(1);
  const originalOrder = bodyRows.slice();
  const tbody = table.querySelector('tbody') || table;

  const rowData = bodyRows.map(row => {
    const cells = Array.from(row.querySelectorAll('td'));
    const dateText = cells[0]?.textContent.trim() || '';
    const nameText = cells[1]?.textContent.trim() || '';
    const distanceText = cells[2]?.textContent.trim() || '';

    if (!dateText.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return { type: 'divider', row };
    }

    return {
      type: 'data', row, cells,
      date: dateText,
      mappedName: raceNameMappings[nameText] || nameText,
      distance: distanceText
    };
  });

  function parseTimeSort(str) {
    if (!str || !str.includes(':')) return Infinity;
    const p = str.split(':');
    if (p.length === 2) return parseInt(p[0]) * 60 + parseFloat(p[1]);
    if (p.length === 3) return parseInt(p[0]) * 3600 + parseInt(p[1]) * 60 + parseFloat(p[2]);
    return Infinity;
  }

  function parseNumSort(str) {
    if (!str || str === '-') return Infinity;
    if (str.includes('\u{1F947}')) return 1;
    if (str.includes('\u{1F948}')) return 2;
    if (str.includes('\u{1F949}')) return 3;
    const n = parseInt(str);
    return isNaN(n) ? Infinity : n;
  }

  let activeFilter = 'AllRaces';
  let sortState = { col: -1, dir: 'none' };

  function filterTable(filterValue) {
    activeFilter = filterValue;
    rowData.forEach(item => {
      if (item.type === 'divider') {
        item.row.style.display = (filterValue === 'AllRaces' && sortState.col === -1) ? '' : 'none';
        return;
      }
      let show = true;
      if (filterValue === '5k') show = item.distance === '5k';
      else if (filterValue === '10k') show = item.distance === '10k';
      else if (filterValue === 'Half') show = item.distance === 'Half';
      else if (filterValue === 'Marathon') show = item.distance === 'Marathon';
      else if (filterValue.startsWith('race:')) show = item.mappedName === filterValue.substring(5);
      item.row.style.display = show ? '' : 'none';
    });
    if (sortState.col !== -1) applySortToDOM();
    else restoreOriginalOrder();
  }

  function applySortToDOM() {
    rowData.forEach(item => {
      if (item.type === 'divider') item.row.style.display = 'none';
    });
    const visible = rowData.filter(item => item.type === 'data' && item.row.style.display !== 'none');
    visible.sort((a, b) => {
      const col = sortState.col;
      const tA = a.cells[col]?.textContent.trim() || '';
      const tB = b.cells[col]?.textContent.trim() || '';
      let cmp = 0;
      if (col === 0) cmp = tA.localeCompare(tB);
      else if (col === 2) cmp = (distanceValues[tA] || 0) - (distanceValues[tB] || 0);
      else if (col === 3) cmp = parseTimeSort(tA) - parseTimeSort(tB);
      else if (col === 4 || col === 5) cmp = parseNumSort(tA) - parseNumSort(tB);
      else cmp = tA.localeCompare(tB);
      return sortState.dir === 'desc' ? -cmp : cmp;
    });
    visible.forEach(item => tbody.appendChild(item.row));
    rowData.forEach(item => {
      if (item.row.style.display === 'none') tbody.appendChild(item.row);
    });
  }

  function restoreOriginalOrder() {
    originalOrder.forEach(row => tbody.appendChild(row));
  }

  function updateSortIndicators() {
    headerRow.querySelectorAll('th').forEach((th, i) => {
      const existing = th.querySelector('.sort-arrow');
      if (existing) existing.remove();
      if (i === sortState.col && sortState.dir !== 'none') {
        const span = document.createElement('span');
        span.className = 'sort-arrow';
        span.textContent = sortState.dir === 'asc' ? ' \u25B2' : ' \u25BC';
        th.appendChild(span);
      }
    });
  }

  headerRow.querySelectorAll('th').forEach((th, index) => {
    th.style.cursor = 'pointer';
    th.style.userSelect = 'none';
    th.addEventListener('click', () => {
      if (sortState.col === index) {
        if (sortState.dir === 'asc') sortState.dir = 'desc';
        else { sortState.col = -1; sortState.dir = 'none'; }
      } else {
        sortState.col = index;
        sortState.dir = 'asc';
      }
      updateSortIndicators();
      if (sortState.col === -1) filterTable(activeFilter);
      else applySortToDOM();
    });
  });

  const sortStyle = document.createElement('style');
  sortStyle.textContent = 'table th:hover{background:rgba(0,0,0,.06);transition:background .15s}' +
    '.sort-arrow{font-size:.7em;vertical-align:middle}';
  document.head.appendChild(sortStyle);

  // Initial state
  updateChart('AllRaces');
  filterTable('AllRaces');

  filter.addEventListener('change', function() {
    updateChart(this.value);
    filterTable(this.value);
  });
});
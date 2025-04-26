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
        race.distance === 'Half'
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
      const raceTypes = ['5k', '10k', 'Half'];
      const datasets = [];
      const colors = {
        '5k': 'rgb(0, 128, 255)', // Blue
        '10k': 'rgb(255, 0, 0)',  // Red
        'Half': 'rgb(0, 128, 0)'   // Green
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
  
  // Initial chart - default to All Races
  updateChart('AllRaces');
  
  // Update chart when filter changes
  filter.addEventListener('change', function() {
    updateChart(this.value);
  });
}); 
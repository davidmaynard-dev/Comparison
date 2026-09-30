// Canvas Graph Dimensions Layout Setup
const margin = {top: 20, right: 30, bottom: 65, left: 85};
const width = 1000 - margin.left - margin.right;
const height = 500 - margin.top - margin.bottom;

const svg = d3.select("#chart")
    .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
    .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

const xAxisG = svg.append("g").attr("transform", `translate(0,${height})`);
const yAxisG = svg.append("g");
const xGridG = svg.append("g").attr("class", "grid").attr("transform", `translate(0,${height})`);
const yGridG = svg.append("g").attr("class", "grid");

const xLabel = svg.append("text").attr("class", "axis-label").attr("text-anchor", "middle").attr("x", width / 2).attr("y", height + 50);
const yLabel = svg.append("text").attr("class", "axis-label").attr("text-anchor", "middle").attr("transform", "rotate(-90)").attr("x", -height / 2).attr("y", -60);

let parsedDataset = [];
let numericalHeadersList = [];
const tooltipNode = d3.select("#tooltip");

// Clean monetary strings, ratio percentages, and double quote formatting safely
function cleanCellToNumber(rawStringValue) {
    if (!rawStringValue) return 0;
    let scrubbed = rawStringValue.toString().replace(/[\"\$\s,%!]/g, '').trim();
    if (scrubbed === "" || scrubbed === "-") return 0;
    let outputFloat = parseFloat(scrubbed);
    return isNaN(outputFloat) ? 0 : outputFloat;
}

// Helper to split CSV strings that handles basic quotation marks
function parseCSVLine(textString) {
    let result = [];
    let insideQuote = false;
    let entry = "";
    for (let i = 0; i < textString.length; i++) {
        let char = textString[i];
        if (char === '"') {
            insideQuote = !insideQuote;
        } else if (char === ',' && !insideQuote) {
            result.push(entry.trim());
            entry = "";
        } else {
            entry += char;
        }
    }
    result.push(entry.trim());
    return result;
}

// NATIVE FETCH ENGINE: Bypasses browser cache parameters completely
const dataFilename = "demo.csv";
fetch(dataFilename, { cache: "no-store" })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Server returned HTTP Error Status: ${response.status}`);
        }
        return response.text();
    })
    .then(textData => {
        if (!textData || textData.trim() === "") {
            throw new Error("Target file loaded successfully but contains absolutely no text contents.");
        }

        // Break content block down by raw string break parameters
        const dataRows = textData.split(/\r?\n/).filter(line => line.trim() !== "");
        if (dataRows.length < 2) {
            throw new Error("The target data file lacks structural data records below the row line.");
        }

        // Extract the first index row as the clean configuration headers row
        const baseHeaders = parseCSVLine(dataRows[0]);
        
        // Build the exclusion matching definitions list
        const wordExclusions = ["year", "neighborhood", "name", "id"];
        numericalHeadersList = baseHeaders.filter(headerName => {
            if (!headerName) return false;
            return !wordExclusions.some(badWord => headerName.toLowerCase().includes(badWord));
        });

        if (numericalHeadersList.length < 2) {
            throw new Error("Could not programmatically isolate separate numerical variables across your header rows.");
        }

        // Map standard rows back into the application runtime database array
        for (let r = 1; r < dataRows.length; r++) {
            let cellValues = parseCSVLine(dataRows[r]);
            if (cellValues.length < baseHeaders.length) continue; // Skip partial lines

            let neighborhoodText = cellValues[1] || cellValues[0] || "Unknown Node Area";
            let mappedObject = { neighborhood: neighborhoodText };

            baseHeaders.forEach((header, index) => {
                if (numericalHeadersList.includes(header)) {
                    mappedObject[header] = cleanCellToNumber(cellValues[index]);
                }
            });
            parsedDataset.push(mappedObject);
        }

        // Target dropdown nodes
        const selectXNode = document.getElementById("x-select");
        const selectYNode = document.getElementById("y-select");

        // Flush temporary values
        selectXNode.innerHTML = "";
        selectYNode.innerHTML = "";

        // Construct and inject options using vanilla browser logic
        numericalHeadersList.forEach((header, keyIdx) => {
            let optX = document.createElement("option");
            optX.value = header;
            optX.textContent = header;
            if (keyIdx === 2) optX.selected = true; // Default to initial data value
            selectXNode.appendChild(optX);

            let optY = document.createElement("option");
            optY.value = header;
            optY.textContent = header;
            if (keyIdx === Math.min(10, numericalHeadersList.length - 1)) optY.selected = true; // Stagger default selection
            selectYNode.appendChild(optY);
        });

        // Bind change hooks
        selectXNode.addEventListener("change", updateScatterPlotGraphics);
        selectYNode.addEventListener("change", updateScatterPlotGraphics);

        // Execute first view draw pass
        updateScatterPlotGraphics();

    })
    .catch(runtimeError => {
        showRuntimeUIError(`Execution Failed: ${runtimeError.message}. Double-check that your file is named exactly 'demo.csv' and is stored in the same repository folder.`);
        console.error("Critical Parse Error Encountered:", runtimeError);
    });

function updateScatterPlotGraphics() {
    const currentXSelection = document.getElementById("x-select").value;
    const currentYSelection = document.getElementById("y-select").value;

    xLabel.text(currentXSelection);
    yLabel.text(currentYSelection);

    // Build scaling calculations using the clean parsed values
    const scaleX = d3.scaleLinear()
        .domain(d3.extent(parsedDataset, d => d[currentXSelection]))
        .range([0, width])
        .nice();

    const scaleY = d3.scaleLinear()
        .domain(d3.extent(parsedDataset, d => d[currentYSelection]))
        .range([height, 0])
        .nice();

    // Smoothly draw axes and grid lines
    xGridG.transition().duration(250).call(d3.axisBottom(scaleX).tickSize(-height).tickFormat(""));
    yGridG.transition().duration(250).call(d3.axisLeft(scaleY).tickSize(-width).tickFormat(""));
    xAxisG.transition().duration(250).call(d3.axisBottom(scaleX));
    yAxisG.transition().duration(250).call(d3.axisLeft(scaleY));

    // Sync data metrics directly with circles on the page
    const nodes = svg.selectAll(".dot")
        .data(parsedDataset);

    nodes.exit().remove();

    // Animate existing circles to their new coordinate locations
    nodes.transition().duration(250)
        .attr("cx", d => scaleX(d[currentXSelection]))
        .attr("cy", d => scaleY(d[currentYSelection]));

    // Generate new coordinate circle points on entry
    const entryNodes = nodes.enter()
        .append("circle")
        .attr("class", "dot")
        .attr("r", 6)
        .attr("cx", d => scaleX(d[currentXSelection]))
        .attr("cy", d => scaleY(d[currentYSelection]));

    // Setup mouseover interactions and hover context cards
    entryNodes.merge(nodes)
        .on("mouseover", (event, dataRecord) => {
            tooltipNode.style("opacity", 1);
            tooltipNode.html(`
                <strong style="color:#63b3ed; font-size:13px;">${dataRecord.neighborhood}</strong><br/>
                <hr style="border:0; border-top:1px solid #4a5568; margin:4px 0;"/>
                <span style="color:#a0aec0">${currentXSelection}:</span> ${dataRecord[currentXSelection].toLocaleString()}<br/>
                <span style="color:#a0aec0">${currentYSelection}:</span> ${dataRecord[currentYSelection].toLocaleString()}
            `);
        })
        .on("mousemove", (event) => {
            const [cursorX, cursorY] = d3.pointer(event, d3.select("#chart").node());
            tooltipNode
                .style("left", (cursorX + 15) + "px")
                .style("top", (cursorY - 15) + "px");
        })
        .on("mouseleave", () => {
            tooltipNode.style("opacity", 0);
        });
}

function showRuntimeUIError(errorStringText) {
    const errorDivElement = document.getElementById("status-display");
    errorDivElement.innerText = errorStringText;
    errorDivElement.style.display = "block";
    errorDivElement.className = "status-box error";
}

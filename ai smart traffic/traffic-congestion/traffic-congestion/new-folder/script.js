let map;
let routeLayer;

function initMap() {
    map = L.map('map').setView([15.0, 75.0], 6);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(map);
}
window.onload = initMap;


async function geocode(place) {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${place}`);
    const data = await res.json();
    if (!data.length) throw new Error("Location not found");
    return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
}


async function findRoute(type="default") {
    const source = document.getElementById("source").value;
    const destination = document.getElementById("destination").value;
    const hour = document.getElementById("travel-hour").value;
    const day = document.getElementById("travel-day").value;
    const vehicle = document.getElementById("vehicle-type").value;

    if (!source || !destination) {
        alert("Enter both locations");
        return;
    }

    try {
      
        const srcCoords = await geocode(source);
        const destCoords = await geocode(destination);

       
        const routeRes = await fetch(
            `https://router.project-osrm.org/route/v1/driving/${srcCoords[1]},${srcCoords[0]};${destCoords[1]},${destCoords[0]}?overview=full&geometries=geojson&alternatives=true`
        );
        const routeData = await routeRes.json();
        if (!routeData.routes.length) throw new Error("Route not found");

       
        let route = routeData.routes[0];
        if (type === "shortest") {
            route = routeData.routes.reduce((a,b)=> a.distance<b.distance?a:b);
        } else if (type === "best") {
            route = routeData.routes.reduce((a,b)=> a.duration<b.duration?a:b);
        } else if (type === "fuel") {
            route = routeData.routes.reduce((a,b)=> (a.distance/a.duration)<(b.distance/b.duration)?a:b);
        }

        const distance = (route.distance / 1000).toFixed(2);
        const duration = Math.round(route.duration / 60);

        
        if (routeLayer) map.removeLayer(routeLayer);
        routeLayer = L.geoJSON(route.geometry).addTo(map);
        map.fitBounds(routeLayer.getBounds());

       
        const res = await fetch(
            `http://localhost:5500/predict?hour=${hour}&day=${day}&dist=${distance}&dur=${duration}&vehicle=${vehicle}`
        );
        const data = await res.json();

        
        document.getElementById("result-card").classList.remove("hidden");
        document.getElementById("route-details").innerHTML =
            `Distance: ${distance} km<br>Duration: ${duration} mins`;
        document.getElementById("congestion-badge").innerText = data.congestion_level;
        document.getElementById("advice-box").innerText = data.advice;

        
        let pct = data.congestion_level === "Low" ? 30 :
                  data.congestion_level === "Medium" ? 60 : 90;
        document.querySelector("#progress-bar div").style.width = pct+"%";

       
        document.getElementById("weather-info").innerText = `Weather: ${data.weather}`;

        
        const hotelList = document.getElementById("hotel-list");
        hotelList.innerHTML = "";
        data.hotels.forEach(h => {
            const li = document.createElement("li");
            li.textContent = h;
            hotelList.appendChild(li);
        });

       
        document.getElementById("leave-info").innerText = data.leave_time;

        
        drawTrafficGraph(data.traffic_points);

    } catch (err) {
        console.error(err);
        alert("Error: " + err.message);
    }
}


document.getElementById("voice-btn").onclick = () => {
    const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.lang = "en-IN"; 
    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        
        if (transcript.includes(" to ")) {
            const parts = transcript.split(" to ");
            document.getElementById("source").value = parts[0].trim();
            document.getElementById("destination").value = parts[1].trim();
        } else {
         
            document.getElementById("source").value = transcript.trim();
        }
    };
    recognition.start();
};



function drawTrafficGraph(points) {
    const canvas = document.getElementById("traffic-graph");
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.strokeStyle = "lime";
    ctx.beginPath();
    points.forEach((p,i)=>{
        const x = i*(canvas.width/points.length);
        const y = canvas.height - (p/100)*canvas.height;
        if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();
}

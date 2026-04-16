let map;
let routeLayer;
let userMarker;
let watchId;
let pathLine;
let searchHistory = [];
let sourceMarker;
let destMarker;
let viaMarkers = [];
let draftWaypointMarkers = [];
let waypointAddMode = false;
let smartAlertTimer = null;
let lastRouteSnapshot = null;
let cachedVoices = [];
let fatigueMonitorActive = false;
let fatigueDetectionMode = "off";
let fatigueStream = null;
let fatigueFrameHandle = null;
let fatigueFaceMesh = null;
let fatigueFallbackTimer = null;
let fatigueScore = 0;
let fatigueAlertCooldownUntil = 0;
let fatigueTripContextNote = "";
let closedEyeFrameCount = 0;
let yawnFrameCount = 0;
let eyesClosedEventCount = 0;
let yawnEventCount = 0;
let routeLayers = [];
let routeLayerMeta = [];
let selectedRouteKey = "recommended";
let selectedRouteCoordinates = [];
let selectedRouteGeometry = null;
let trafficHotspotLayer = null;
let trafficHotspots = [];
let trafficRefreshTimer = null;
let evRefreshTimer = null;
let realtimeDataTimer = null;
let evStations = [];
let ambulanceModeActive = false;
let ambulanceMarker = null;
let ambulancePriorityLayer = null;
let ambulanceSimulationTimer = null;
let ambulanceRouteCursor = 0;
let ambulanceAlertLevel = "none";
let activeBaseLayer = null;
let offlineRouteCache = null;
let workspaceState = "splash";

const poiLayers = { gas: null, charging: null, police: null };
const OFFLINE_ROUTE_CACHE_KEY = "trafficai_offline_route_cache_v2";
const OFFLINE_REALTIME_CACHE_KEY = "trafficai_realtime_cache_v2";
const REALTIME_POLL_MS = 45000;
const EV_REFRESH_MS = 60000;

const FATIGUE_CONFIG = {
    earThreshold: 0.215,
    marThreshold: 0.62,
    closedEyeFramesForAlert: 14,
    yawnFramesForAlert: 18,
    alertCooldownMs: 22000
};

const LEFT_EYE_POINTS = [33, 160, 158, 133, 153, 144];
const RIGHT_EYE_POINTS = [362, 385, 387, 263, 373, 380];

const PURPOSE_LABELS = {
    hospital: "Hospital",
    school: "School/College",
    office: "Office",
    temple: "Temple/Religious",
    airport: "Airport/Station",
    personal: "Personal",
    delivery: "Delivery",
    tourism: "Tourism",
    other: "Other"
};

const PRIORITY_LABELS = {
    normal: "Normal",
    important: "Important",
    urgent: "Urgent",
    emergency: "Emergency"
};

const FUEL_PROFILES = {
    car: { kmPerL: 15, fuelPricePerL: 106, co2PerL: 2392 },
    bike: { kmPerL: 40, fuelPricePerL: 104, co2PerL: 2300 },
    bus: { kmPerL: 4, fuelPricePerL: 94, co2PerL: 2680 },
    truck: { kmPerL: 3, fuelPricePerL: 94, co2PerL: 3200 }
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const formatDistance = (km) => `${km.toFixed(2)} km`;

function formatDuration(minutes) {
    if (minutes < 60) return `${minutes} mins`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins ? `${hours} hr ${mins} mins` : `${hours} hr`;
}

function formatHour(hour24) {
    const hour = hour24 % 24;
    const suffix = hour >= 12 ? "PM" : "AM";
    const display = hour % 12 === 0 ? 12 : hour % 12;
    return `${display}:00 ${suffix}`;
}

function getLabel(labels, key, fallback = "Unknown") {
    return labels[key] || fallback;
}

function getTrafficColor(level) {
    if (level === "High") return "#EF4444";
    if (level === "Medium") return "#F59E0B";
    return "#10B981";
}

function scoreToTrafficLevel(score) {
    if (score < 35) return "Low";
    if (score < 65) return "Medium";
    return "High";
}

function setWorkspaceState(nextState) {
    workspaceState = nextState;
    const splash = document.getElementById("workspace-splash");
    const loader = document.getElementById("workspace-loader");
    const content = document.getElementById("workspace-content");

    splash?.classList.toggle("hidden", nextState !== "splash");
    loader?.classList.toggle("hidden", nextState !== "loading");
    content?.classList.toggle("hidden", nextState !== "results");

    if (nextState === "results") {
        setTimeout(() => {
            map?.invalidateSize();
            if (routeLayer) {
                const bounds = routeLayer.getBounds?.();
                if (bounds?.isValid?.()) map.fitBounds(bounds, { padding: [40, 40] });
            }
        }, 250);
    }
}

function updateOfflineBanner() {
    const banner = document.getElementById("offline-banner");
    if (!banner) return;
    banner.classList.toggle("hidden", navigator.onLine);
}

function computePolylineDistanceMeters(polylineCoords, toLatLng) {
    if (!map || !polylineCoords?.length) return Number.POSITIVE_INFINITY;
    let minDistance = Number.POSITIVE_INFINITY;
    polylineCoords.forEach(([lat, lon]) => {
        const pointDistance = map.distance([lat, lon], toLatLng);
        if (pointDistance < minDistance) minDistance = pointDistance;
    });
    return minDistance;
}

function initMap() {
    map = L.map("map", { zoomControl: true, scrollWheelZoom: true }).setView([14.4644, 75.9218], 11);

    const standardLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    });
    const satelliteLayer = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
            attribution: "Tiles &copy; Esri",
            maxZoom: 19
        }
    );

    activeBaseLayer = standardLayer;
    standardLayer.addTo(map);
    L.control.layers(
        {
            "Standard (OSM)": standardLayer,
            "Satellite (Esri)": satelliteLayer
        },
        {},
        { position: "topright" }
    ).addTo(map);

    pathLine = L.polyline([], { color: "#2563EB", weight: 4, opacity: 0.7 }).addTo(map);
    trafficHotspotLayer = L.layerGroup().addTo(map);
    poiLayers.gas = L.layerGroup();
    poiLayers.charging = L.layerGroup();
    poiLayers.police = L.layerGroup();

    bindStaticListeners();
    map.on("click", handleMapClickAddStop);
    setupRouteDragSkeleton();
    initSpeechVoices();

    loadSearchHistory();
    loadCachedRealtimeData();
    updateWeatherDisplay("Clear, 28C");
    updateConnectionStatus();
    updateOfflineBanner();
    updateLiveIndicators(false);
    updateFatigueUi("low", "Start monitoring to detect eye-closure and yawn patterns.");
    setWorkspaceState("splash");
    setAmbulanceUi("Ambulance priority is in standby.", "--", "--");
    updatePlacePreviews("Source", "Destination");
    renderTrafficHotspotList([]);
    renderEvStationList([]);

    const hourValue = document.getElementById("future-hour-value");
    if (hourValue) hourValue.textContent = "0";
    setTimeout(() => map.invalidateSize(), 300);
}

window.onload = initMap;

function bindStaticListeners() {
    document.getElementById("locate-btn")?.addEventListener("click", toggleLiveLocation);
    document.getElementById("waypoint-mode-btn")?.addEventListener("click", toggleWaypointMode);
    document.getElementById("ambulance-mode-btn")?.addEventListener("click", toggleAmbulanceMode);
    document.getElementById("voice-btn")?.addEventListener("click", startVoiceInput);
    document.getElementById("voice-command-btn")?.addEventListener("click", startVoiceCommandStarter);
    document.getElementById("poi-gas")?.addEventListener("change", applyPoiLayerVisibility);
    document.getElementById("poi-charging")?.addEventListener("change", applyPoiLayerVisibility);
    document.getElementById("poi-police")?.addEventListener("change", applyPoiLayerVisibility);
    document.getElementById("fatigue-start-btn")?.addEventListener("click", startFatigueMonitoring);
    document.getElementById("fatigue-stop-btn")?.addEventListener("click", () => stopFatigueMonitoring());
    document.getElementById("calendar-google-btn")?.addEventListener("click", () => connectCalendar("Google"));
    document.getElementById("calendar-outlook-btn")?.addEventListener("click", () => connectCalendar("Outlook"));

    document.getElementById("future-traffic-slider")?.addEventListener("input", (event) => {
        const hoursAhead = Number(event.target.value);
        const hourValue = document.getElementById("future-hour-value");
        if (hourValue) hourValue.textContent = String(hoursAhead);
        applyFutureTrafficPrediction(hoursAhead);
    });
}

function initSpeechVoices() {
    if (!("speechSynthesis" in window)) return;
    cachedVoices = window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
        cachedVoices = window.speechSynthesis.getVoices();
    };
}

function selectCalmVoice() {
    if (!cachedVoices.length && "speechSynthesis" in window) {
        cachedVoices = window.speechSynthesis.getVoices();
    }
    const englishVoices = cachedVoices.filter((voice) => /en/i.test(voice.lang));
    const preferredPatterns = [/Google UK English Female/i, /Samantha/i, /Microsoft Zira/i, /Female/i];
    for (const pattern of preferredPatterns) {
        const match = englishVoices.find((voice) => pattern.test(voice.name));
        if (match) return match;
    }
    return englishVoices[0] || cachedVoices[0] || null;
}

function setSpeakingPulse(active) {
    document.getElementById("locate-btn")?.classList.toggle("pulse", active);
    document.getElementById("live-badge")?.classList.toggle("pulse", active);
}

function announceRouteDetails(data) {
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return;

    const utterance = new SpeechSynthesisUtterance(
        `Route found from ${data.source} to ${data.destination}. ` +
        `Total distance is ${data.distanceText} with a duration of ${data.durationText}. ` +
        `Traffic level is ${data.trafficLevel}.`
    );

    const voice = selectCalmVoice();
    if (voice) utterance.voice = voice;
    utterance.rate = 0.92;
    utterance.pitch = 1;
    utterance.volume = 1;
    utterance.onstart = () => setSpeakingPulse(true);
    utterance.onend = () => setSpeakingPulse(false);
    utterance.onerror = () => setSpeakingPulse(false);

    setSpeakingPulse(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
}

async function geocode(place) {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(place)}`);
    const data = await response.json();
    if (!data.length) throw new Error(`Location "${place}" not found`);
    return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
}

async function reverseGeocode(lat, lon) {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
    const data = await response.json();
    const label = data.display_name ? data.display_name.split(",").slice(0, 2).join(",").trim() : `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    return label || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

function chooseRouteByContext(routes, type, purpose, priority) {
    if (type === "shortest") return routes.reduce((a, b) => (a.distance < b.distance ? a : b));
    if (type === "best") return routes.reduce((a, b) => (a.duration < b.duration ? a : b));
    if (type === "fuel") {
        return routes.reduce((a, b) => (a.distance / Math.max(a.duration, 1)) < (b.distance / Math.max(b.duration, 1)) ? a : b);
    }

    const isEmergency = purpose === "hospital" || priority === "emergency";
    if (isEmergency || priority === "urgent") return routes.reduce((a, b) => (a.duration < b.duration ? a : b));

    if (purpose === "school" || purpose === "office" || purpose === "airport" || priority === "important") {
        return routes.reduce((a, b) => ((a.duration * 0.75) + (a.distance * 0.25)) < ((b.duration * 0.75) + (b.distance * 0.25)) ? a : b);
    }

    if (purpose === "temple" || purpose === "tourism") {
        return routes.reduce((a, b) => ((a.duration * 0.55) + (a.distance * 0.45)) < ((b.duration * 0.55) + (b.distance * 0.45)) ? a : b);
    }

    return routes[0];
}

function buildRouteVariants(routes) {
    const shortest = routes.reduce((a, b) => (a.distance < b.distance ? a : b));
    const fastest = routes.reduce((a, b) => (a.duration < b.duration ? a : b));
    const eco = routes.reduce((a, b) => (a.distance / Math.max(a.duration, 1)) < (b.distance / Math.max(b.duration, 1)) ? a : b);
    return {
        shortest: { key: "shortest", label: "Shortest", route: shortest },
        fastest: { key: "fastest", label: "Fastest", route: fastest },
        eco: { key: "eco", label: "Eco", route: eco }
    };
}

function getSelectedVariantKey(route, routeVariants) {
    if (route === routeVariants.shortest.route) return "shortest";
    if (route === routeVariants.fastest.route) return "fastest";
    if (route === routeVariants.eco.route) return "eco";
    return "recommended";
}

async function findRoute(type = "default") {
    if (!map) {
        showAlert("Map is still loading. Please wait a moment.");
        return;
    }

    const source = document.getElementById("source").value.trim();
    const destination = document.getElementById("destination").value.trim();
    const viaInput = document.getElementById("via-points");
    const viaStops = viaInput ? viaInput.value.split(",").map((stop) => stop.trim()).filter(Boolean) : [];
    const purpose = document.getElementById("trip-purpose")?.value || "personal";
    const priority = document.getElementById("trip-priority")?.value || "normal";
    const hour = Number(document.getElementById("travel-hour").value);
    const day = document.getElementById("travel-day").value;
    const vehicle = document.getElementById("vehicle-type").value;

    if (!source || !destination) return showAlert("Please enter both source and destination");
    if (viaStops.length > 5) return showAlert("Please use up to 5 via stops");

    const findBtn = document.getElementById("find-btn");
    const originalText = findBtn.textContent;
    setWorkspaceState("loading");
    findBtn.textContent = "Finding Route...";
    findBtn.classList.add("loading");
    findBtn.disabled = true;

    try {
        const routePlaces = [source, ...viaStops, destination];
        const routePoints = await Promise.all(routePlaces.map((place) => geocode(place)));
        const srcCoords = routePoints[0];
        const destCoords = routePoints[routePoints.length - 1];
        const viaCoords = routePoints.slice(1, -1);
        const routeCoordinates = routePoints.map(([lat, lon]) => `${lon},${lat}`).join(";");

        const routeRes = await fetch(`https://router.project-osrm.org/route/v1/driving/${routeCoordinates}?overview=full&geometries=geojson&alternatives=true`);
        const routeData = await routeRes.json();
        if (!routeData.routes?.length) throw new Error("No route found between these locations");

        const routeVariants = buildRouteVariants(routeData.routes);
        const selectedRoute = chooseRouteByContext(routeData.routes, type, purpose, priority);
        selectedRouteGeometry = selectedRoute.geometry;
        selectedRouteCoordinates = selectedRoute.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
        const selectedVariantKey =
            type === "fuel" ? "eco" :
            type === "best" ? "fastest" :
            type === "shortest" ? "shortest" :
            getSelectedVariantKey(selectedRoute, routeVariants);
        selectedRouteKey = selectedVariantKey;
        const distanceKm = selectedRoute.distance / 1000;
        const durationMins = Math.max(1, Math.round(selectedRoute.duration / 60));
        const prediction = simulateTrafficPrediction(hour, day, distanceKm, durationMins, vehicle, purpose, priority);

        drawRouteOnMap(routeVariants, selectedVariantKey, prediction);
        clearDraftWaypointMarkers();
        addRouteMarkers(srcCoords, destCoords, source, destination, viaCoords, viaStops);
        updatePoiOverlays(selectedRoute.geometry.coordinates, prediction);
        applyPoiLayerVisibility();

        updateResultsUI({
            source, destination, viaStops, purpose, priority, vehicle, routeMode: type,
            distanceKm, durationMins, prediction, routeVariants, selectedVariantKey
        });
        syncFatigueTripContext(distanceKm, durationMins, prediction.congestion_level);
        updatePlacePreviews(source, destination);
        refreshTrafficHotspots(selectedRoute.geometry.coordinates, prediction);
        refreshEvStations(selectedRoute.geometry.coordinates, prediction);
        saveCachedRealtimeData();
        if (ambulanceModeActive) {
            restartAmbulanceSimulation();
        }

        cacheOfflineRoute({
            source,
            destination,
            viaStops,
            srcCoords,
            destCoords,
            viaCoords,
            routes: routeData.routes,
            hour,
            day,
            vehicle,
            purpose,
            priority,
            selectedVariantKey,
            timestamp: Date.now()
        });

        saveToHistory(source, destination, purpose, priority);
        setWorkspaceState("results");
        focusMapSection();
        announceRouteDetails({
            source,
            destination,
            distanceText: formatDistance(distanceKm),
            durationText: formatDuration(durationMins),
            trafficLevel: prediction.congestion_level
        });

        lastRouteSnapshot = {
            source,
            destination,
            prediction,
            distanceKm,
            durationMins,
            purpose,
            priority,
            routeCoordinates: selectedRoute.geometry.coordinates,
            selectedVariantKey
        };
        const slider = document.getElementById("future-traffic-slider");
        if (slider) applyFutureTrafficPrediction(Number(slider.value || "0"));
        scheduleSmartAlert(lastRouteSnapshot);
        startRealtimeDataLoop();
    } catch (error) {
        console.error("Route Error:", error);
        const cached = getOfflineRoute(source, destination);
        if (cached) {
            try {
                await renderRouteFromOfflineCache(cached, type);
                setWorkspaceState("results");
                showSmartAlert("Offline route loaded from cache.");
            } catch (cacheError) {
                console.error("Offline cache fallback error:", cacheError);
                setWorkspaceState("splash");
                showAlert("Error: " + error.message);
            }
        } else {
            setWorkspaceState("splash");
            showAlert("Error: " + error.message);
        }
    } finally {
        findBtn.textContent = originalText;
        findBtn.classList.remove("loading");
        findBtn.disabled = false;
    }
}

function drawRouteOnMap(routeVariants, selectedVariantKey, prediction) {
    routeLayers.forEach((layer) => map.removeLayer(layer));
    routeLayers = [];
    routeLayerMeta = [];
    routeLayer = null;

    const styleMap = {
        fastest: { color: "#2563EB", label: "Fastest" },
        shortest: { color: "#6B7280", label: "Shortest" },
        eco: { color: "#10B981", label: "Eco" }
    };
    const fastestMins = Math.round(routeVariants.fastest.route.duration / 60);

    [routeVariants.fastest, routeVariants.shortest, routeVariants.eco].forEach((variant) => {
        const style = styleMap[variant.key] || { color: "#4F46E5", label: variant.label };
        const isSelected = variant.key === selectedVariantKey;
        const delay = Math.max(0, Math.round(variant.route.duration / 60) - fastestMins);
        const tooltipText = `${style.label} route | Traffic: ${prediction.congestion_level} | Delay: ${delay} mins`;

        const layer = L.geoJSON(variant.route.geometry, {
            style: {
                color: style.color,
                weight: isSelected ? 7 : 4,
                opacity: isSelected ? 0.96 : 0.6,
                dashArray: isSelected ? null : "8 7"
            }
        }).addTo(map);

        layer.eachLayer((segment) => {
            segment.bindTooltip(tooltipText, { sticky: true, opacity: 0.95 });
            segment.on("mouseover", () => segment.openTooltip());
            segment.on("mouseout", () => segment.closeTooltip());
        });

        routeLayers.push(layer);
        routeLayerMeta.push({
            key: variant.key,
            label: style.label,
            delay,
            distanceKm: variant.route.distance / 1000,
            durationMins: Math.round(variant.route.duration / 60)
        });
        if (isSelected) routeLayer = layer;
    });

    const bounds = routeLayer?.getBounds?.() || routeLayers[0]?.getBounds?.();
    if (bounds?.isValid?.()) map.fitBounds(bounds, { padding: [50, 50] });
}

function focusMapSection() {
    const mapSection = document.querySelector(".map-section");
    if (!mapSection) return;

    mapSection.scrollIntoView({ behavior: "smooth", block: "start" });
    mapSection.classList.remove("map-highlight");
    void mapSection.offsetWidth;
    mapSection.classList.add("map-highlight");

    setTimeout(() => {
        if (!map) return;
        map.invalidateSize();
        if (routeLayer) map.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });
    }, 650);

    setTimeout(() => mapSection.classList.remove("map-highlight"), 1300);
}

function clearRouteMarkers() {
    if (sourceMarker) {
        map.removeLayer(sourceMarker);
        sourceMarker = null;
    }
    if (destMarker) {
        map.removeLayer(destMarker);
        destMarker = null;
    }
    viaMarkers.forEach((marker) => map.removeLayer(marker));
    viaMarkers = [];
}

function clearDraftWaypointMarkers() {
    draftWaypointMarkers.forEach((marker) => map.removeLayer(marker));
    draftWaypointMarkers = [];
}

function addRouteMarkers(srcCoords, destCoords, srcName, destName, viaCoords = [], viaNames = []) {
    clearRouteMarkers();

    const startIcon = L.divIcon({
        className: "custom-marker",
        html: '<div style="background:#10B981;width:30px;height:30px;border-radius:50%;border:3px solid white;box-shadow:0 3px 10px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;color:white;font-size:15px;">&#x1F6A9;</div>',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });
    const endIcon = L.divIcon({
        className: "custom-marker",
        html: '<div style="background:#EF4444;width:30px;height:30px;border-radius:50%;border:3px solid white;box-shadow:0 3px 10px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;color:white;font-size:15px;">&#x1F3C1;</div>',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });
    const viaIcon = (index) => L.divIcon({
        className: "custom-marker",
        html: `<div style="background:#F59E0B;width:28px;height:28px;border-radius:50%;border:3px solid white;box-shadow:0 3px 8px rgba(0,0,0,0.2);color:white;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;">${index + 1}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
    });

    sourceMarker = L.marker(srcCoords, { icon: startIcon }).addTo(map).bindPopup(`<strong>Start:</strong> ${srcName}`).bindTooltip(`Start: ${srcName}`, { direction: "top" });
    sourceMarker.on("mouseover", () => sourceMarker.openTooltip());
    viaCoords.forEach((coords, index) => {
        const marker = L.marker(coords, { icon: viaIcon(index) })
            .addTo(map)
            .bindPopup(`<strong>Via ${index + 1}:</strong> ${viaNames[index] || "Stop"}`)
            .bindTooltip(`Via ${index + 1}: ${viaNames[index] || "Stop"}`, { direction: "top" });
        marker.on("mouseover", () => marker.openTooltip());
        viaMarkers.push(marker);
    });
    destMarker = L.marker(destCoords, { icon: endIcon }).addTo(map).bindPopup(`<strong>Destination:</strong> ${destName}`).bindTooltip(`Destination: ${destName}`, { direction: "top" });
    destMarker.on("mouseover", () => destMarker.openTooltip());
}

function toggleWaypointMode() {
    waypointAddMode = !waypointAddMode;
    const btn = document.getElementById("waypoint-mode-btn");
    if (!btn) return;
    btn.classList.toggle("active", waypointAddMode);
    btn.textContent = `Add Stop Mode: ${waypointAddMode ? "On" : "Off"}`;
}

async function handleMapClickAddStop(event) {
    if (!waypointAddMode) return;

    const viaInput = document.getElementById("via-points");
    if (!viaInput) return;

    const currentStops = viaInput.value.split(",").map((stop) => stop.trim()).filter(Boolean);
    if (currentStops.length >= 5) {
        showAlert("Maximum 5 via stops supported.");
        return;
    }

    const { lat, lng } = event.latlng;
    let stopName = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    try {
        stopName = await reverseGeocode(lat, lng);
    } catch (error) {
        console.warn("Reverse geocode fallback:", error.message);
    }
    const normalizedStopName = stopName.split(",")[0].trim() || stopName;

    viaInput.value = [...currentStops, normalizedStopName].join(", ");

    const draftIcon = L.divIcon({
        className: "custom-marker",
        html: '<div style="background:#334155;width:22px;height:22px;border-radius:50%;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.25);"></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11]
    });

    const marker = L.marker([lat, lng], { icon: draftIcon }).addTo(map).bindPopup(`Stop added: ${normalizedStopName}`).openPopup();
    draftWaypointMarkers.push(marker);
    showSmartAlert(`Waypoint added: ${normalizedStopName}. Click Find Route to recalculate.`);
}

function makePoiIcon(label, bg) {
    return L.divIcon({
        className: "poi-marker",
        html: `<div style="background:${bg};color:#fff;padding:4px 6px;border-radius:10px;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.25);font-size:10px;font-weight:700;">${label}</div>`,
        iconSize: [26, 22],
        iconAnchor: [13, 11]
    });
}

function pickRouteSamplePoints(routeCoordinates, count = 3) {
    if (!routeCoordinates.length) return [];
    const points = [];
    for (let i = 1; i <= count; i += 1) {
        const ratio = i / (count + 1);
        points.push(routeCoordinates[Math.floor(ratio * (routeCoordinates.length - 1))]);
    }
    return points;
}

function estimateEvWaitMinutes(congestionLevel, hour = new Date().getHours()) {
    const peakFactor = (hour >= 8 && hour <= 10) || (hour >= 17 && hour <= 20) ? 10 : 4;
    const congestionFactor = congestionLevel === "High" ? 12 : congestionLevel === "Medium" ? 7 : 3;
    return clamp(Math.round(6 + peakFactor + congestionFactor + Math.random() * 8), 5, 45);
}

function renderEvStationList(stations) {
    const list = document.getElementById("ev-list");
    if (!list) return;
    list.innerHTML = "";
    if (!stations.length) {
        const li = document.createElement("li");
        li.textContent = "No charging points available yet. Run a route to load corridor stations.";
        list.appendChild(li);
        return;
    }

    stations.forEach((station) => {
        const li = document.createElement("li");
        li.textContent = `${station.name} | ${station.connector} | ${station.distanceFromRouteKm.toFixed(1)} km away | Wait ~${station.waitMins} mins`;
        list.appendChild(li);
    });
}

function updatePoiOverlays(routeCoordinates, prediction = null) {
    Object.values(poiLayers).forEach((layer) => layer.clearLayers());
    evStations = [];
    if (!routeCoordinates?.length) return;

    const samplePoints = pickRouteSamplePoints(routeCoordinates, 4);
    samplePoints.forEach(([lon, lat], index) => {
        poiLayers.gas.addLayer(L.marker([lat + 0.004 * (index - 1), lon + 0.003], { icon: makePoiIcon("G", "#f59e0b") }).bindPopup("Gas station (mock) within route corridor"));
        const waitMins = estimateEvWaitMinutes(prediction?.congestion_level || "Medium");
        const station = {
            name: `EV Hub ${index + 1}`,
            connector: index % 2 === 0 ? "CCS2 / Type2" : "CCS2 / CHAdeMO",
            distanceFromRouteKm: 0.3 + (index * 0.25),
            waitMins
        };
        evStations.push(station);

        const evMarker = L.marker([lat - 0.003, lon - 0.002 * (index - 1)], { icon: makePoiIcon("EV", "#10b981") })
            .bindPopup(`${station.name}<br>${station.connector}<br>Estimated wait: ${waitMins} mins`);
        poiLayers.charging.addLayer(evMarker);
        poiLayers.police.addLayer(L.marker([lat + 0.002, lon - 0.003], { icon: makePoiIcon("P", "#2563eb") }).bindPopup("Police checkpoint (mock) on nearby road"));
    });

    renderEvStationList(evStations);
}

function applyPoiLayerVisibility() {
    const toggleMap = {
        gas: document.getElementById("poi-gas")?.checked,
        charging: document.getElementById("poi-charging")?.checked,
        police: document.getElementById("poi-police")?.checked
    };

    Object.entries(poiLayers).forEach(([key, layer]) => {
        if (!layer) return;
        const shouldShow = Boolean(toggleMap[key]);
        if (shouldShow && !map.hasLayer(layer)) layer.addTo(map);
        if (!shouldShow && map.hasLayer(layer)) map.removeLayer(layer);
    });
}

function renderTrafficHotspotList(hotspots) {
    const list = document.getElementById("traffic-hotspot-list");
    if (!list) return;
    list.innerHTML = "";

    if (!hotspots.length) {
        const li = document.createElement("li");
        li.textContent = "Run a route to load traffic hotspots between source and destination.";
        list.appendChild(li);
        return;
    }

    hotspots.forEach((item) => {
        const li = document.createElement("li");
        li.textContent = `${item.label} | ${item.severity} | Delay ${item.delayMins} mins | Updated ${item.updatedAt}`;
        list.appendChild(li);
    });
}

function refreshTrafficHotspots(routeCoordinates, prediction) {
    if (!trafficHotspotLayer) return;
    trafficHotspotLayer.clearLayers();
    trafficHotspots = [];
    if (!routeCoordinates?.length) return;

    const hotspotTypes = ["Congestion Cluster", "Road Work", "Minor Accident", "Diversion", "Signal Delay"];
    const points = pickRouteSamplePoints(routeCoordinates, 5);
    const severityLevel = prediction?.congestion_level || "Medium";
    const now = new Date().toLocaleTimeString();

    points.forEach(([lon, lat], index) => {
        const delayBase = severityLevel === "High" ? 10 : severityLevel === "Medium" ? 6 : 3;
        const delayMins = delayBase + Math.round(Math.random() * 6);
        const severity = delayMins > 12 ? "High" : delayMins > 7 ? "Medium" : "Low";
        const label = hotspotTypes[index % hotspotTypes.length];
        const color = severity === "High" ? "#ef4444" : severity === "Medium" ? "#f59e0b" : "#22c55e";

        const marker = L.circleMarker([lat + (Math.random() - 0.5) * 0.003, lon + (Math.random() - 0.5) * 0.003], {
            radius: 7,
            color,
            fillColor: color,
            fillOpacity: 0.85,
            weight: 2
        })
            .bindTooltip(`${label} | ${severity} | Delay ${delayMins} mins`, { sticky: true })
            .bindPopup(`<strong>${label}</strong><br>Severity: ${severity}<br>Estimated delay: ${delayMins} mins<br>Updated: ${now}`);
        marker.on("mouseover", () => marker.openTooltip());
        trafficHotspotLayer.addLayer(marker);

        trafficHotspots.push({
            label,
            severity,
            delayMins,
            updatedAt: now,
            lat,
            lon
        });
    });

    renderTrafficHotspotList(trafficHotspots);
}

function refreshEvStations(routeCoordinates, prediction) {
    updatePoiOverlays(routeCoordinates, prediction);
    applyPoiLayerVisibility();
}

function buildPlacePreviewUrl(place) {
    return `https://source.unsplash.com/800x480/?${encodeURIComponent(`${place} city road`)}`;
}

function makePlaceFallbackDataUri(place) {
    const safePlace = place.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='480'><rect width='100%' height='100%' fill='#e2e8f0'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='#334155' font-size='28' font-family='Arial'>${safePlace}</text></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function updatePlacePreviews(source, destination) {
    const sourceImg = document.getElementById("source-image");
    const destImg = document.getElementById("destination-image");
    const srcLabel = document.getElementById("source-image-label");
    const destLabel = document.getElementById("destination-image-label");

    if (srcLabel) srcLabel.textContent = source || "Source";
    if (destLabel) destLabel.textContent = destination || "Destination";
    if (!sourceImg || !destImg) return;

    if (!navigator.onLine) {
        sourceImg.src = makePlaceFallbackDataUri(source || "Source");
        destImg.src = makePlaceFallbackDataUri(destination || "Destination");
        return;
    }

    sourceImg.src = buildPlacePreviewUrl(source || "source");
    destImg.src = buildPlacePreviewUrl(destination || "destination");
    sourceImg.onerror = () => {
        sourceImg.src = makePlaceFallbackDataUri(source || "Source");
    };
    destImg.onerror = () => {
        destImg.src = makePlaceFallbackDataUri(destination || "Destination");
    };
}

function setupRouteDragSkeleton() {
    window.enableRouteDragEditing = () => {
        showSmartAlert("Route drag editing skeleton ready. Integrate Leaflet.draw for full drag support.");
    };
}

function updateLiveIndicators(active) {
    const locateBtn = document.getElementById("locate-btn");
    const liveBadge = document.getElementById("live-badge");
    if (locateBtn) {
        locateBtn.classList.toggle("active", active);
        locateBtn.title = active ? "Stop Live Location" : "Toggle Live Location";
        const label = locateBtn.querySelector("span");
        if (label) label.textContent = active ? "LIVE" : "GPS";
    }
    if (liveBadge) liveBadge.classList.toggle("active", active);
}

function toggleLiveLocation() {
    if (watchId) stopLiveLocationTracking();
    else startLiveLocationTracking();
}

function startLiveLocationTracking() {
    if (!navigator.geolocation) return showAlert("Live location is not supported in your browser.");
    updateLiveIndicators(true);

    watchId = navigator.geolocation.watchPosition(
        (pos) => {
            const latlng = [pos.coords.latitude, pos.coords.longitude];
            const userIcon = L.divIcon({
                className: "user-marker",
                html: '<div style="background:#2563EB;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 0 10px rgba(37,99,235,0.6);"></div>',
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            });

            if (!userMarker) {
                userMarker = L.marker(latlng, { icon: userIcon }).addTo(map).bindPopup("Your Live Location");
                map.setView(latlng, Math.max(map.getZoom(), 14), { animate: true });
            } else {
                smoothMove(userMarker, latlng);
            }
            pathLine?.addLatLng(latlng);
        },
        (err) => {
            showAlert("Unable to fetch live location: " + err.message);
            stopLiveLocationTracking();
        },
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    );
}

function stopLiveLocationTracking() {
    if (watchId) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
    if (userMarker) {
        map.removeLayer(userMarker);
        userMarker = null;
    }
    pathLine?.setLatLngs([]);
    updateLiveIndicators(false);
}

function setAmbulanceUi(statusText, distanceText, etaText) {
    const status = document.getElementById("ambulance-status");
    const distance = document.getElementById("ambulance-distance");
    const eta = document.getElementById("ambulance-eta");
    if (status) status.textContent = statusText;
    if (distance) distance.textContent = `Distance to you: ${distanceText}`;
    if (eta) eta.textContent = `ETA to corridor: ${etaText}`;
}

function toggleAmbulanceMode() {
    ambulanceModeActive = !ambulanceModeActive;
    const btn = document.getElementById("ambulance-mode-btn");
    if (btn) {
        btn.classList.toggle("active", ambulanceModeActive);
        btn.textContent = `Ambulance Priority: ${ambulanceModeActive ? "On" : "Off"}`;
    }

    if (ambulanceModeActive) {
        restartAmbulanceSimulation();
        showSmartAlert("Emergency corridor mode enabled.");
    } else {
        stopAmbulanceSimulation();
        setAmbulanceUi("Ambulance priority is in standby.", "--", "--");
        showSmartAlert("Emergency corridor mode disabled.");
    }
}

function getUserReferencePoint() {
    if (userMarker) {
        const loc = userMarker.getLatLng();
        return [loc.lat, loc.lng];
    }
    if (sourceMarker) {
        const loc = sourceMarker.getLatLng();
        return [loc.lat, loc.lng];
    }
    return null;
}

async function handleAmbulanceProximity(ambulanceLatLng) {
    const userPoint = getUserReferencePoint();
    if (!userPoint || !map) return;
    const distanceMeters = map.distance(ambulanceLatLng, userPoint);
    const etaMinutes = Math.max(1, Math.round(distanceMeters / 400));
    setAmbulanceUi(
        "Emergency vehicle active on selected corridor.",
        `${Math.round(distanceMeters)} m`,
        `${etaMinutes} mins`
    );

    if (distanceMeters <= 100 && ambulanceAlertLevel !== "critical") {
        ambulanceAlertLevel = "critical";
        const message = "Critical alert: ambulance is within 100 meters. Give immediate right of way.";
        showSmartAlert(message);
        speakFatigueWarning(message);
        await notifyBrowser("Critical Ambulance Alert", message);
    } else if (distanceMeters <= 500 && ambulanceAlertLevel === "none") {
        ambulanceAlertLevel = "warning";
        const message = "Warning: ambulance is within 500 meters. Prepare to clear lane.";
        showSmartAlert(message);
        await notifyBrowser("Ambulance Nearby", message);
    } else if (distanceMeters > 500) {
        ambulanceAlertLevel = "none";
    }
}

function stopAmbulanceSimulation() {
    if (ambulanceSimulationTimer) {
        clearInterval(ambulanceSimulationTimer);
        ambulanceSimulationTimer = null;
    }
    if (ambulanceMarker) {
        map.removeLayer(ambulanceMarker);
        ambulanceMarker = null;
    }
    if (ambulancePriorityLayer) {
        map.removeLayer(ambulancePriorityLayer);
        ambulancePriorityLayer = null;
    }
    ambulanceRouteCursor = 0;
    ambulanceAlertLevel = "none";
}

function restartAmbulanceSimulation() {
    stopAmbulanceSimulation();
    if (!ambulanceModeActive || !selectedRouteCoordinates?.length || !map) return;

    ambulancePriorityLayer = L.polyline(selectedRouteCoordinates, {
        color: "#dc2626",
        weight: 10,
        opacity: 0.18
    }).addTo(map);

    const ambulanceIcon = L.divIcon({
        className: "ambulance-marker",
        html: '<div style="background:#dc2626;color:#fff;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,0.25);">&#x1F691;</div>',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });

    const step = Math.max(1, Math.floor(selectedRouteCoordinates.length / 140));
    ambulanceMarker = L.marker(selectedRouteCoordinates[0], { icon: ambulanceIcon })
        .addTo(map)
        .bindTooltip("Emergency Ambulance", { sticky: true });

    setAmbulanceUi("Emergency corridor active. Ambulance movement started.", "--", "--");
    ambulanceSimulationTimer = setInterval(() => {
        if (!ambulanceMarker || !selectedRouteCoordinates.length) return;
        ambulanceRouteCursor = (ambulanceRouteCursor + step) % selectedRouteCoordinates.length;
        const nextLatLng = selectedRouteCoordinates[ambulanceRouteCursor];
        ambulanceMarker.setLatLng(nextLatLng);
        void handleAmbulanceProximity(nextLatLng);
    }, 1600);
}

function smoothMove(marker, newLatLng, duration = 700) {
    const start = marker.getLatLng();
    const end = L.latLng(newLatLng);
    const startTime = performance.now();
    const animate = (time) => {
        const t = Math.min((time - startTime) / duration, 1);
        marker.setLatLng([start.lat + (end.lat - start.lat) * t, start.lng + (end.lng - start.lng) * t]);
        if (t < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
}

function getWeatherByHour(hour) {
    if (hour >= 12 && hour <= 16) return "Clear, 31C";
    if (hour >= 17 && hour <= 20) return "Cloudy, 27C";
    if (hour >= 21 || hour <= 5) return "Clear, 24C";
    return "Clear, 28C";
}

function getWeatherImpactText(weather, congestionLevel) {
    const text = weather.toLowerCase();
    if (text.includes("rain") || text.includes("storm")) return "Wet roads likely. Maintain longer braking distance and lower speed on turns.";
    if (text.includes("fog") || text.includes("haze")) return "Reduced visibility expected. Use low beam and keep safe following distance.";
    if (text.includes("clear")) return congestionLevel === "High" ? "High visibility, but traffic density remains the main delay factor." : "High visibility and stable conditions. Ideal for smoother driving.";
    return "Moderate weather impact expected. Drive with caution near busy junctions.";
}

function buildTrafficCycle24() {
    return Array.from({ length: 24 }, (_, h) => {
        if ((h >= 8 && h <= 10) || (h >= 17 && h <= 19)) return 72;
        if (h >= 11 && h <= 16) return 48;
        if (h >= 22 || h <= 5) return 18;
        return 30;
    });
}

function predictFutureTrafficScore(baseScore, hoursAhead) {
    const cycle = buildTrafficCycle24();
    const targetHour = (new Date().getHours() + hoursAhead) % 24;
    return clamp((baseScore * 0.58) + (cycle[targetHour] * 0.42), 10, 95);
}

function suggestFutureLeaveTime(baseTrafficPoints, hoursAhead) {
    const cycle = buildTrafficCycle24();
    const adjusted = baseTrafficPoints.map((point, idx) => clamp((point * 0.65) + (cycle[(idx + hoursAhead) % 24] * 0.35), 0, 100));
    return formatHour(adjusted.indexOf(Math.min(...adjusted)));
}

function simulateTrafficPrediction(hour, day, distanceKm, durationMins, vehicle, purpose = "personal", priority = "normal") {
    let score = 30;
    if ((hour >= 8 && hour <= 10) || (hour >= 17 && hour <= 19)) score += 40;
    else if (hour >= 11 && hour <= 16) score += 20;
    if (day === "1") score -= 15;
    if (vehicle === "truck") score += 10;
    if (vehicle === "bike") score -= 10;
    if (purpose === "hospital" || priority === "emergency") score += 8;
    if (purpose === "temple" || purpose === "tourism") score -= 4;
    score = clamp(score + Math.floor(Math.random() * 20) - 10, 10, 95);

    const level = scoreToTrafficLevel(score);
    const trafficPoints = buildTrafficCycle24().map((value) => clamp(value + Math.floor(Math.random() * 12) - 6, 10, 95));
    const bestHour = trafficPoints.indexOf(Math.min(...trafficPoints));
    const priorityBuffer = { normal: "No extra buffer", important: "Leave ~10 mins earlier", urgent: "Leave ~20 mins earlier", emergency: "Leave immediately" };

    const purposeAdvice = {
        hospital: "Medical trip detected: fastest and most reliable corridor prioritized.",
        school: "School trip detected: aiming for consistent arrival windows.",
        office: "Office trip detected: balancing predictability and travel time.",
        temple: "Religious trip detected: keeping route comfort and flow balanced.",
        airport: "Transit hub trip detected: on-time arrival given higher weight.",
        delivery: "Delivery trip detected: consistent movement corridor selected.",
        tourism: "Tourism trip detected: comfort-priority route balancing enabled."
    };
    const levelAdvice = { Low: "Roads are relatively free-flowing.", Medium: "Moderate delays expected in urban choke points.", High: "Heavy congestion likely around core junctions." };
    const priorityAdvice = { important: "Add a small buffer before departure.", urgent: "Prefer immediate start and dynamic rerouting.", emergency: "Fastest possible movement recommended now." };

    return {
        congestion_level: level,
        congestion_score: score,
        advice: [purposeAdvice[purpose], levelAdvice[level], priorityAdvice[priority]].filter(Boolean).join(" "),
        weather: getWeatherByHour(hour),
        traffic_points: trafficPoints,
        leave_time: formatHour(bestHour),
        buffer_note: priorityBuffer[priority] || priorityBuffer.normal
    };
}

function estimateFuelAndCo2(distanceKm, vehicle, routeVariants, selectedVariantKey) {
    const profile = FUEL_PROFILES[vehicle] || FUEL_PROFILES.car;
    const liters = distanceKm / profile.kmPerL;
    const fuelCost = liters * profile.fuelPricePerL;
    const co2Grams = liters * profile.co2PerL;
    const fastestKm = routeVariants.fastest.route.distance / 1000;
    const fastestCo2 = (fastestKm / profile.kmPerL) * profile.co2PerL;
    const co2Saved = selectedVariantKey === "eco" ? Math.max(0, fastestCo2 - co2Grams) : 0;
    return { liters, fuelCost, co2Grams, co2Saved, fuelPricePerL: profile.fuelPricePerL };
}

function renderRouteComparison(routeVariants, selectedVariantKey) {
    const list = document.getElementById("route-compare-list");
    if (!list) return;
    list.innerHTML = "";
    [routeVariants.shortest, routeVariants.fastest, routeVariants.eco].forEach((variant) => {
        const li = document.createElement("li");
        const distanceKm = variant.route.distance / 1000;
        const durationMins = Math.max(1, Math.round(variant.route.duration / 60));
        const selectedTag = variant.key === selectedVariantKey ? " (Selected)" : "";
        li.textContent = `${variant.label}: ${formatDistance(distanceKm)}, ${formatDuration(durationMins)}${selectedTag}`;
        list.appendChild(li);
    });
}

function renderIncidentReports(level) {
    const list = document.getElementById("incident-list");
    if (!list) return;
    list.innerHTML = "";
    const byLevel = {
        Low: ["No major incidents reported on this corridor.", "Minor speed fluctuations near city entry points."],
        Medium: ["Road maintenance activity near the mid-route segment.", "Temporary lane slowdown near one urban junction."],
        High: ["Construction bottleneck reported near a primary highway merge.", "Minor accident alert near a major exit slowing throughput."]
    };
    (byLevel[level] || byLevel.Medium).forEach((text) => {
        const li = document.createElement("li");
        li.textContent = text;
        list.appendChild(li);
    });
}

function getMultiModalSuggestion(level, distanceKm) {
    if (level === "High" && distanceKm > 20) return "Heavy congestion detected. Consider nearby bus or train options for faster arrival reliability.";
    if (level === "Medium") return "Moderate congestion. Keep transit alternatives ready in case peak delays increase.";
    return "Current traffic is manageable. Road travel remains the best option for this trip.";
}

function updateResultsUI(payload) {
    const { source, destination, viaStops, purpose, priority, vehicle, routeMode, distanceKm, durationMins, prediction, routeVariants, selectedVariantKey } = payload;

    document.getElementById("result-card")?.classList.remove("hidden");
    const badge = document.getElementById("congestion-badge");
    if (badge) {
        badge.textContent = `${prediction.congestion_level} Congestion`;
        badge.className = prediction.congestion_level.toLowerCase();
    }
    const progressFill = document.querySelector(".progress-fill");
    if (progressFill) progressFill.style.width = `${prediction.congestion_score}%`;

    const viaDetails = viaStops.length ? `<strong>Via Stops:</strong> ${viaStops.join(" -> ")}<br>` : "";
    const purposeLabel = getLabel(PURPOSE_LABELS, purpose, "Personal");
    const priorityLabel = getLabel(PRIORITY_LABELS, priority, "Normal");
    const routeDetails = document.getElementById("route-details");
    if (routeDetails) {
        routeDetails.innerHTML = `
            <strong>Route:</strong> ${source} -> ${destination}<br>
            <strong>Distance:</strong> ${formatDistance(distanceKm)}<br>
            <strong>Estimated Duration:</strong> ${formatDuration(durationMins)}<br>
            <strong>Purpose:</strong> ${purposeLabel}<br>
            <strong>Priority:</strong> ${priorityLabel}<br>
            ${viaDetails}
            <strong>Traffic Level:</strong> ${prediction.congestion_level}
        `;
    }

    const adviceBox = document.getElementById("advice-box");
    if (adviceBox) adviceBox.textContent = prediction.advice;
    updateWeatherDisplay(prediction.weather);

    const fuelData = estimateFuelAndCo2(distanceKm, vehicle, routeVariants, selectedVariantKey);
    const fuelEstimate = document.getElementById("fuel-estimate");
    if (fuelEstimate) {
        fuelEstimate.textContent = `Estimated fuel: ${fuelData.liters.toFixed(2)} L at INR ${fuelData.fuelPricePerL}/L. Approx cost: INR ${fuelData.fuelCost.toFixed(0)}.`;
    }

    const weatherImpact = document.getElementById("weather-impact");
    if (weatherImpact) weatherImpact.textContent = `${prediction.weather} -> ${getWeatherImpactText(prediction.weather, prediction.congestion_level)}`;

    const co2Footprint = document.getElementById("co2-footprint");
    if (co2Footprint) {
        const savingsText = selectedVariantKey === "eco"
            ? ` CO2 saved vs fastest: ${fuelData.co2Saved.toFixed(0)} g.`
            : " Choose Eco route to compare CO2 savings vs fastest.";
        co2Footprint.textContent = `Estimated CO2: ${fuelData.co2Grams.toFixed(0)} g.${savingsText}`;
    }

    renderRouteComparison(routeVariants, selectedVariantKey);
    renderIncidentReports(prediction.congestion_level);

    const multimodal = document.getElementById("multimodal-suggestion");
    if (multimodal) multimodal.textContent = getMultiModalSuggestion(prediction.congestion_level, distanceKm);

    const leaveInfo = document.getElementById("leave-info");
    const modeLabel = routeMode === "fuel" ? "Eco" : routeMode === "best" ? "Fastest" : routeMode === "shortest" ? "Shortest" : "Recommended";
    if (leaveInfo) leaveInfo.textContent = `Recommended departure: ${prediction.leave_time} (${prediction.buffer_note}) | Route mode: ${modeLabel}`;

    drawTrafficGraph(prediction.traffic_points);
}

function updateWeatherDisplay(weather) {
    const weatherInfo = document.getElementById("weather-info");
    if (weatherInfo) weatherInfo.textContent = weather;
}

function applyFutureTrafficPrediction(hoursAhead) {
    const futureNote = document.getElementById("future-traffic-note");
    const leaveInfo = document.getElementById("leave-info");
    if (!lastRouteSnapshot || !futureNote || !leaveInfo) {
        if (futureNote) futureNote.textContent = "Predicted using historical pattern simulation.";
        return;
    }

    const futureScore = predictFutureTrafficScore(lastRouteSnapshot.prediction.congestion_score, hoursAhead);
    const futureLevel = scoreToTrafficLevel(futureScore);
    const futureLeaveTime = suggestFutureLeaveTime(lastRouteSnapshot.prediction.traffic_points, hoursAhead);

    leaveInfo.textContent = `Recommended departure: ${futureLeaveTime} (${lastRouteSnapshot.prediction.buffer_note}) | Future traffic at +${hoursAhead}h: ${futureLevel}`;
    futureNote.textContent = `Predicted using historical pattern simulation. Forecast score at +${hoursAhead}h: ${Math.round(futureScore)}%.`;
}

function cacheOfflineRoute(payload) {
    try {
        localStorage.setItem(OFFLINE_ROUTE_CACHE_KEY, JSON.stringify(payload));
        offlineRouteCache = payload;
    } catch (error) {
        console.warn("Unable to store offline route cache:", error.message);
    }
}

function getOfflineRoute(source, destination) {
    if (!offlineRouteCache) {
        const raw = localStorage.getItem(OFFLINE_ROUTE_CACHE_KEY);
        if (raw) {
            try {
                offlineRouteCache = JSON.parse(raw);
            } catch (error) {
                console.warn("Offline route cache parsing error:", error.message);
            }
        }
    }
    if (!offlineRouteCache) return null;
    if (!source || !destination) return offlineRouteCache;

    const sameRoute =
        offlineRouteCache.source?.toLowerCase() === source.toLowerCase() &&
        offlineRouteCache.destination?.toLowerCase() === destination.toLowerCase();
    return sameRoute ? offlineRouteCache : offlineRouteCache;
}

async function renderRouteFromOfflineCache(cachePayload, requestedType = "default") {
    if (!cachePayload?.routes?.length) throw new Error("No cached route available.");

    const source = document.getElementById("source").value.trim() || cachePayload.source;
    const destination = document.getElementById("destination").value.trim() || cachePayload.destination;
    const viaInput = document.getElementById("via-points");
    const viaStops = viaInput ? viaInput.value.split(",").map((item) => item.trim()).filter(Boolean) : cachePayload.viaStops || [];
    const purpose = document.getElementById("trip-purpose")?.value || cachePayload.purpose || "personal";
    const priority = document.getElementById("trip-priority")?.value || cachePayload.priority || "normal";
    const vehicle = document.getElementById("vehicle-type")?.value || cachePayload.vehicle || "car";
    const hour = Number(document.getElementById("travel-hour")?.value || cachePayload.hour || 9);
    const day = document.getElementById("travel-day")?.value || cachePayload.day || "0";

    const routeVariants = buildRouteVariants(cachePayload.routes);
    const selectedRoute = chooseRouteByContext(cachePayload.routes, requestedType, purpose, priority);
    const selectedVariantKey =
        requestedType === "fuel" ? "eco" :
        requestedType === "best" ? "fastest" :
        requestedType === "shortest" ? "shortest" :
        getSelectedVariantKey(selectedRoute, routeVariants);

    const distanceKm = selectedRoute.distance / 1000;
    const durationMins = Math.max(1, Math.round(selectedRoute.duration / 60));
    const prediction = simulateTrafficPrediction(hour, day, distanceKm, durationMins, vehicle, purpose, priority);
    selectedRouteGeometry = selectedRoute.geometry;
    selectedRouteCoordinates = selectedRoute.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
    selectedRouteKey = selectedVariantKey;

    let srcCoords = cachePayload.srcCoords || null;
    let destCoords = cachePayload.destCoords || null;
    let viaCoords = cachePayload.viaCoords || [];
    if (!srcCoords || !destCoords) {
        srcCoords = await geocode(source);
        destCoords = await geocode(destination);
    }
    if (!viaCoords.length && viaStops.length) {
        viaCoords = await Promise.all(viaStops.map((stop) => geocode(stop)));
    }

    drawRouteOnMap(routeVariants, selectedVariantKey, prediction);
    clearDraftWaypointMarkers();
    addRouteMarkers(srcCoords, destCoords, source, destination, viaCoords, viaStops);
    updatePoiOverlays(selectedRoute.geometry.coordinates, prediction);
    refreshTrafficHotspots(selectedRoute.geometry.coordinates, prediction);
    refreshEvStations(selectedRoute.geometry.coordinates, prediction);
    applyPoiLayerVisibility();
    updatePlacePreviews(source, destination);
    updateResultsUI({
        source,
        destination,
        viaStops,
        purpose,
        priority,
        vehicle,
        routeMode: requestedType,
        distanceKm,
        durationMins,
        prediction,
        routeVariants,
        selectedVariantKey
    });
    syncFatigueTripContext(distanceKm, durationMins, prediction.congestion_level);
    if (ambulanceModeActive) restartAmbulanceSimulation();

    lastRouteSnapshot = {
        source,
        destination,
        prediction,
        distanceKm,
        durationMins,
        purpose,
        priority,
        routeCoordinates: selectedRoute.geometry.coordinates,
        selectedVariantKey
    };
    startRealtimeDataLoop();
}

function saveCachedRealtimeData() {
    try {
        const payload = {
            hotspots: trafficHotspots,
            evStations,
            timestamp: Date.now()
        };
        localStorage.setItem(OFFLINE_REALTIME_CACHE_KEY, JSON.stringify(payload));
    } catch (error) {
        console.warn("Unable to cache realtime data:", error.message);
    }
}

function loadCachedRealtimeData() {
    try {
        const raw = localStorage.getItem(OFFLINE_REALTIME_CACHE_KEY);
        if (!raw) return;
        const payload = JSON.parse(raw);
        trafficHotspots = payload.hotspots || [];
        evStations = payload.evStations || [];
        renderTrafficHotspotList(trafficHotspots);
        renderEvStationList(evStations);
    } catch (error) {
        console.warn("Unable to load realtime cache:", error.message);
    }
}

function stopRealtimeDataLoop() {
    if (trafficRefreshTimer) {
        clearInterval(trafficRefreshTimer);
        trafficRefreshTimer = null;
    }
    if (evRefreshTimer) {
        clearInterval(evRefreshTimer);
        evRefreshTimer = null;
    }
    if (realtimeDataTimer) {
        clearInterval(realtimeDataTimer);
        realtimeDataTimer = null;
    }
}

function startRealtimeDataLoop() {
    stopRealtimeDataLoop();
    if (!lastRouteSnapshot?.routeCoordinates?.length) return;

    trafficRefreshTimer = setInterval(() => {
        if (!lastRouteSnapshot?.routeCoordinates?.length) return;
        refreshTrafficHotspots(lastRouteSnapshot.routeCoordinates, lastRouteSnapshot.prediction);
        saveCachedRealtimeData();
    }, REALTIME_POLL_MS);

    evRefreshTimer = setInterval(() => {
        if (!lastRouteSnapshot?.routeCoordinates?.length) return;
        refreshEvStations(lastRouteSnapshot.routeCoordinates, lastRouteSnapshot.prediction);
        saveCachedRealtimeData();
    }, EV_REFRESH_MS);

    realtimeDataTimer = setInterval(() => {
        if (ambulanceModeActive && selectedRouteCoordinates?.length) {
            setAmbulanceUi("Emergency corridor active. Live tracking updates every few seconds.", document.getElementById("ambulance-distance")?.textContent?.replace("Distance to you: ", "") || "--", document.getElementById("ambulance-eta")?.textContent?.replace("ETA to corridor: ", "") || "--");
        }
    }, 15000);
}

function showSmartAlert(message) {
    const box = document.getElementById("smart-alert");
    if (!box) return;
    box.textContent = message;
    box.classList.remove("hidden");
    window.setTimeout(() => box.classList.add("hidden"), 9000);
}

async function notifyBrowser(title, body) {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
        try {
            await Notification.requestPermission();
        } catch (error) {
            console.warn("Notification permission request failed:", error.message);
        }
    }
    if (Notification.permission === "granted") {
        new Notification(title, { body });
    }
}

function scheduleSmartAlert(snapshot) {
    if (smartAlertTimer) clearTimeout(smartAlertTimer);
    smartAlertTimer = setTimeout(async () => {
        const projected = predictFutureTrafficScore(snapshot.prediction.congestion_score, 1);
        if (projected > snapshot.prediction.congestion_score + 10) {
            const msg = `Traffic may increase soon for ${snapshot.source} -> ${snapshot.destination}. Consider leaving earlier than planned.`;
            showSmartAlert(msg);
            await notifyBrowser("TrafficAI Smart Alert", msg);
        }
    }, 45000);
}

function getFatigueLevel(score) {
    if (score < 35) return "low";
    if (score < 70) return "medium";
    return "high";
}

function resetFatigueFrameCounters() {
    closedEyeFrameCount = 0;
    yawnFrameCount = 0;
}

function updateFatigueUi(level, detailsText = "") {
    const badge = document.getElementById("fatigue-status-badge");
    const risk = document.getElementById("fatigue-risk");
    const meterFill = document.getElementById("fatigue-meter-fill");
    const details = document.getElementById("fatigue-details");

    if (badge) {
        const modeLabel = fatigueMonitorActive ? (fatigueDetectionMode === "camera" ? "Camera AI" : "Fallback AI") : "Monitoring Off";
        const levelLabel = level === "high" ? "High" : level === "medium" ? "Medium" : "Low";
        badge.className = `fatigue-badge ${fatigueMonitorActive ? level : "off"}`;
        badge.textContent = fatigueMonitorActive ? `${modeLabel} - ${levelLabel}` : modeLabel;
    }

    if (risk) {
        if (fatigueMonitorActive) {
            const levelLabel = level === "high" ? "High" : level === "medium" ? "Medium" : "Low";
            risk.textContent = `Risk: ${Math.round(fatigueScore)}% (${levelLabel})`;
        } else {
            risk.textContent = "Risk: --";
        }
    }

    if (meterFill) meterFill.style.width = `${fatigueMonitorActive ? Math.round(fatigueScore) : 0}%`;
    if (details) {
        details.textContent = `${detailsText}${fatigueTripContextNote ? ` ${fatigueTripContextNote}` : ""}`.trim();
    }
}

function updateFatigueScore(nextScore, detailsText) {
    fatigueScore = clamp(nextScore, 0, 100);
    updateFatigueUi(getFatigueLevel(fatigueScore), detailsText);
}

function getPointDistance(landmarks, a, b) {
    const pa = landmarks[a];
    const pb = landmarks[b];
    if (!pa || !pb) return 0;
    return Math.hypot(pa.x - pb.x, pa.y - pb.y);
}

function getEyeAspectRatio(landmarks, points) {
    const verticalA = getPointDistance(landmarks, points[1], points[5]);
    const verticalB = getPointDistance(landmarks, points[2], points[4]);
    const horizontal = getPointDistance(landmarks, points[0], points[3]);
    return horizontal > 0 ? (verticalA + verticalB) / (2 * horizontal) : 0;
}

function getMouthAspectRatio(landmarks) {
    const vertical = getPointDistance(landmarks, 13, 14);
    const horizontal = getPointDistance(landmarks, 61, 291);
    return horizontal > 0 ? vertical / horizontal : 0;
}

function syncFatigueTripContext(distanceKm, durationMins, trafficLevel) {
    const context = [];
    if (durationMins >= 180) context.push("Long-drive risk: plan a 15 min break every 2 hours.");
    else if (durationMins >= 120) context.push("Trip duration is high: plan a short refresh break.");
    else if (durationMins >= 90) context.push("Medium-long trip: stay hydrated and avoid monotony.");
    if (trafficLevel === "High") context.push("Heavy traffic may increase mental fatigue.");
    if (distanceKm >= 200) context.push("Keep emergency contact and rest stop options ready.");

    fatigueTripContextNote = context.join(" ");
    if (!fatigueMonitorActive) {
        const details = document.getElementById("fatigue-details");
        if (details) {
            details.textContent = `${fatigueTripContextNote || "Start monitoring to detect eye-closure and yawn patterns."} Enable monitoring before departure.`;
        }
    } else {
        const boost = durationMins >= 180 ? 12 : durationMins >= 120 ? 8 : durationMins >= 90 ? 4 : 0;
        const trafficBoost = trafficLevel === "High" ? 4 : trafficLevel === "Medium" ? 2 : 0;
        updateFatigueScore(fatigueScore + boost + trafficBoost, "Trip context updated for fatigue monitoring.");
    }
}

async function triggerFatigueAlert(message, force = false) {
    const now = Date.now();
    if (!force && now < fatigueAlertCooldownUntil) return;
    fatigueAlertCooldownUntil = now + FATIGUE_CONFIG.alertCooldownMs;

    const log = document.getElementById("fatigue-alert-log");
    if (log) log.textContent = `${new Date().toLocaleTimeString()} - ${message}`;
    showSmartAlert(message);
    speakFatigueWarning(message);
    await notifyBrowser("Driver Fatigue Alert", message);
}

function speakFatigueWarning(message) {
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return;
    const utterance = new SpeechSynthesisUtterance(`Safety alert. ${message}`);
    const voice = selectCalmVoice();
    if (voice) utterance.voice = voice;
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.onstart = () => setSpeakingPulse(true);
    utterance.onend = () => setSpeakingPulse(false);
    utterance.onerror = () => setSpeakingPulse(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
}

async function initFatigueFaceMesh() {
    if (fatigueFaceMesh || !window.FaceMesh) return Boolean(fatigueFaceMesh);
    fatigueFaceMesh = new FaceMesh({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
    });
    fatigueFaceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });
    fatigueFaceMesh.onResults(handleFatigueFaceResults);
    return true;
}

function handleFatigueFaceResults(results) {
    if (!fatigueMonitorActive || fatigueDetectionMode !== "camera") return;

    const landmarks = results.multiFaceLandmarks?.[0];
    if (!landmarks) {
        updateFatigueScore(
            fatigueScore + 1.3,
            "Face not detected clearly. Keep your face centered and eyes on the road."
        );
        if (fatigueScore >= 74) void triggerFatigueAlert("Driver attention lost. Please pause and refocus.", false);
        return;
    }

    const leftEar = getEyeAspectRatio(landmarks, LEFT_EYE_POINTS);
    const rightEar = getEyeAspectRatio(landmarks, RIGHT_EYE_POINTS);
    const ear = (leftEar + rightEar) / 2;
    const mar = getMouthAspectRatio(landmarks);

    if (ear < FATIGUE_CONFIG.earThreshold) closedEyeFrameCount += 1;
    else closedEyeFrameCount = Math.max(0, closedEyeFrameCount - 2);

    if (mar > FATIGUE_CONFIG.marThreshold) yawnFrameCount += 1;
    else yawnFrameCount = Math.max(0, yawnFrameCount - 1);

    let delta = -0.5;
    if (ear < FATIGUE_CONFIG.earThreshold) delta += 1.2;
    if (mar > FATIGUE_CONFIG.marThreshold) delta += 0.9;
    if (lastRouteSnapshot?.prediction?.congestion_level === "High") delta += 0.3;

    updateFatigueScore(
        fatigueScore + delta,
        `EAR: ${ear.toFixed(2)} | Yawn index: ${mar.toFixed(2)} | Eye events: ${eyesClosedEventCount} | Yawns: ${yawnEventCount}`
    );

    if (closedEyeFrameCount >= FATIGUE_CONFIG.closedEyeFramesForAlert) {
        resetFatigueFrameCounters();
        eyesClosedEventCount += 1;
        updateFatigueScore(fatigueScore + 14, "Extended eye closure detected. Consider an immediate break.");
        void triggerFatigueAlert("Drowsiness detected from prolonged eye closure. Please stop and rest.", true);
    }

    if (yawnFrameCount >= FATIGUE_CONFIG.yawnFramesForAlert) {
        yawnFrameCount = 0;
        yawnEventCount += 1;
        updateFatigueScore(fatigueScore + 10, "Repeated yawn pattern detected. Fresh air and short break recommended.");
        void triggerFatigueAlert("Frequent yawning detected. Consider taking a short break.", false);
    }

    if (fatigueScore >= 82) {
        void triggerFatigueAlert("High fatigue risk. Pull over safely and rest before continuing.", false);
    }
}

function startFatigueFallback(reason = "Camera AI unavailable.") {
    fatigueDetectionMode = "fallback";
    if (fatigueFrameHandle) {
        cancelAnimationFrame(fatigueFrameHandle);
        fatigueFrameHandle = null;
    }
    if (fatigueFallbackTimer) clearInterval(fatigueFallbackTimer);
    resetFatigueFrameCounters();
    updateFatigueUi(getFatigueLevel(fatigueScore), `${reason} Running historical-pattern fallback monitoring.`);

    fatigueFallbackTimer = setInterval(() => {
        if (!fatigueMonitorActive || fatigueDetectionMode !== "fallback") return;
        const hour = new Date().getHours();
        let delta = (hour >= 22 || hour <= 5) ? 2.3 : 1.1;
        if (lastRouteSnapshot?.durationMins >= 120) delta += 1.5;
        else if (lastRouteSnapshot?.durationMins >= 90) delta += 0.8;
        if (lastRouteSnapshot?.prediction?.congestion_level === "High") delta += 0.9;
        if (lastRouteSnapshot?.prediction?.congestion_level === "Medium") delta += 0.4;

        updateFatigueScore(fatigueScore + delta, "Fallback fatigue model active (time + trip load based).");
        if (fatigueScore >= 76) {
            void triggerFatigueAlert("Fatigue risk increasing in fallback mode. Please schedule a break.", false);
        }
    }, 6000);
}

async function startFatigueMonitoring() {
    if (fatigueMonitorActive) return;
    fatigueMonitorActive = true;
    fatigueScore = 8;
    fatigueAlertCooldownUntil = 0;
    resetFatigueFrameCounters();
    eyesClosedEventCount = 0;
    yawnEventCount = 0;
    const log = document.getElementById("fatigue-alert-log");
    if (log) log.textContent = "Monitoring started. Keep your face in view for reliable detection.";
    updateFatigueUi("low", "Initializing fatigue monitor...");

    const video = document.getElementById("fatigue-video");
    if (!video) {
        showAlert("Fatigue monitor UI is unavailable.");
        fatigueMonitorActive = false;
        return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
        startFatigueFallback("Camera access is not supported in this browser.");
        return;
    }

    try {
        fatigueStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 360 } },
            audio: false
        });
        video.srcObject = fatigueStream;
        await video.play();
        video.classList.add("active");

        const faceMeshReady = await initFatigueFaceMesh();
        if (!faceMeshReady) {
            startFatigueFallback("FaceMesh model unavailable.");
            return;
        }

        fatigueDetectionMode = "camera";
        updateFatigueUi("low", "Camera AI monitoring started. Keep your face visible for accurate detection.");

        const runFrame = async () => {
            if (!fatigueMonitorActive || fatigueDetectionMode !== "camera") return;
            try {
                if (video.readyState >= 2 && fatigueFaceMesh) {
                    await fatigueFaceMesh.send({ image: video });
                }
            } catch (error) {
                console.warn("Fatigue FaceMesh loop error:", error.message);
                startFatigueFallback("Face tracking interruption detected.");
                return;
            }
            fatigueFrameHandle = requestAnimationFrame(() => {
                void runFrame();
            });
        };

        void runFrame();
    } catch (error) {
        console.warn("Fatigue monitor camera error:", error.message);
        startFatigueFallback("Camera permission denied or unavailable.");
    }
}

function stopFatigueMonitoring(silent = false) {
    fatigueMonitorActive = false;
    fatigueDetectionMode = "off";
    fatigueAlertCooldownUntil = 0;
    resetFatigueFrameCounters();
    eyesClosedEventCount = 0;
    yawnEventCount = 0;

    if (fatigueFrameHandle) {
        cancelAnimationFrame(fatigueFrameHandle);
        fatigueFrameHandle = null;
    }
    if (fatigueFallbackTimer) {
        clearInterval(fatigueFallbackTimer);
        fatigueFallbackTimer = null;
    }
    if (fatigueStream) {
        fatigueStream.getTracks().forEach((track) => track.stop());
        fatigueStream = null;
    }

    const video = document.getElementById("fatigue-video");
    if (video) {
        video.pause();
        video.srcObject = null;
        video.classList.remove("active");
    }

    fatigueScore = 0;
    if (!silent) {
        const log = document.getElementById("fatigue-alert-log");
        if (log) log.textContent = "No active fatigue alerts.";
        updateFatigueUi("low", "Monitoring stopped. Restart before your next trip.");
    }
}

function connectCalendar(provider) {
    const status = document.getElementById("calendar-sync-status");
    if (status) {
        status.textContent = `${provider} Calendar connection skeleton activated. OAuth + event sync endpoint can be integrated here.`;
    }
}

function startVoiceInput() {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
        showAlert("Voice input is not supported in your browser.");
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    const voiceBtn = document.getElementById("voice-btn");
    if (voiceBtn) {
        voiceBtn.textContent = "Listening...";
        voiceBtn.style.background = "#EEF2FF";
        voiceBtn.style.borderColor = "#4F46E5";
    }

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        if (transcript.toLowerCase().includes(" to ")) {
            const parts = transcript.split(/\s+to\s+/i);
            document.getElementById("source").value = parts[0].trim();
            document.getElementById("destination").value = parts[1].trim();
        } else {
            document.getElementById("source").value = transcript.trim();
        }
        if (voiceBtn) {
            voiceBtn.innerHTML = '<span class="voice-icon">Mic</span> Voice Input';
            voiceBtn.style.background = "";
            voiceBtn.style.borderColor = "";
        }
    };

    recognition.onerror = (event) => {
        showAlert("Voice recognition error: " + event.error);
        if (voiceBtn) {
            voiceBtn.innerHTML = '<span class="voice-icon">Mic</span> Voice Input';
            voiceBtn.style.background = "";
            voiceBtn.style.borderColor = "";
        }
    };

    recognition.onend = () => {
        if (voiceBtn) {
            voiceBtn.innerHTML = '<span class="voice-icon">Mic</span> Voice Input';
            voiceBtn.style.background = "";
            voiceBtn.style.borderColor = "";
        }
    };

    recognition.start();
}

function startVoiceCommandStarter() {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
        showAlert("Voice command is not supported in your browser.");
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    const commandBtn = document.getElementById("voice-command-btn");
    if (commandBtn) {
        commandBtn.textContent = "Listening command...";
        commandBtn.style.background = "#EEF2FF";
        commandBtn.style.borderColor = "#4F46E5";
    }

    recognition.onresult = (event) => {
        const text = event.results[0][0].transcript.trim().toLowerCase();

        const fromToMatch = text.match(/from\s+(.+)\s+to\s+(.+)/i);
        if (fromToMatch) {
            document.getElementById("source").value = fromToMatch[1].trim();
            document.getElementById("destination").value = fromToMatch[2].trim();
        } else {
            const toMatch = text.match(/route\s+to\s+(.+)/i);
            if (toMatch) document.getElementById("destination").value = toMatch[1].trim();
        }

        let mode = "default";
        if (text.includes("fastest")) mode = "best";
        else if (text.includes("shortest")) mode = "shortest";
        else if (text.includes("eco")) mode = "fuel";

        if (!text.includes("trafficai") && !text.includes("route")) {
            showAlert('Try saying: "Hey TrafficAI, find the fastest route to Mysore."');
        } else {
            findRoute(mode);
        }

        if (commandBtn) {
            commandBtn.innerHTML = '<span class="voice-icon">VC</span> Voice Command (Starter)';
            commandBtn.style.background = "";
            commandBtn.style.borderColor = "";
        }
    };

    recognition.onerror = () => {
        if (commandBtn) {
            commandBtn.innerHTML = '<span class="voice-icon">VC</span> Voice Command (Starter)';
            commandBtn.style.background = "";
            commandBtn.style.borderColor = "";
        }
    };

    recognition.onend = () => {
        if (commandBtn) {
            commandBtn.innerHTML = '<span class="voice-icon">VC</span> Voice Command (Starter)';
            commandBtn.style.background = "";
            commandBtn.style.borderColor = "";
        }
    };

    recognition.start();
}

function drawTrafficGraph(points) {
    const canvas = document.getElementById("traffic-graph");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.setTransform(2, 0, 0, 2, 0, 0);

    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = "#E2E8F0";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i += 1) {
        const y = (height / 4) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "rgba(79,70,229,0.3)");
    gradient.addColorStop(1, "rgba(79,70,229,0.05)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(0, height);
    points.forEach((point, i) => {
        const x = (i / (points.length - 1)) * width;
        const y = height - (point / 100) * height;
        ctx.lineTo(x, y);
    });
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "#4F46E5";
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((point, i) => {
        const x = (i / (points.length - 1)) * width;
        const y = height - (point / 100) * height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();
}

function saveToHistory(source, destination, purpose = "personal", priority = "normal") {
    searchHistory.unshift({ source, destination, purpose, priority, timestamp: Date.now() });
    searchHistory = searchHistory.slice(0, 5);
    localStorage.setItem("trafficai_history", JSON.stringify(searchHistory));
    renderSearchHistory();
}

function loadSearchHistory() {
    const saved = localStorage.getItem("trafficai_history");
    if (saved) {
        searchHistory = JSON.parse(saved);
        renderSearchHistory();
    }
}

function renderSearchHistory() {
    const list = document.getElementById("history-list");
    if (!list) return;
    list.innerHTML = "";

    if (!searchHistory.length) {
        const li = document.createElement("li");
        li.textContent = "No recent searches";
        li.style.color = "#94A3B8";
        list.appendChild(li);
        return;
    }

    searchHistory.forEach((entry) => {
        const li = document.createElement("li");
        const purposeLabel = getLabel(PURPOSE_LABELS, entry.purpose || "personal", "Personal");
        const priorityLabel = getLabel(PRIORITY_LABELS, entry.priority || "normal", "Normal");
        li.textContent = `${entry.source} -> ${entry.destination} (${purposeLabel}, ${priorityLabel})`;
        li.style.cursor = "pointer";
        li.onclick = () => {
            document.getElementById("source").value = entry.source;
            document.getElementById("destination").value = entry.destination;
            const viaInput = document.getElementById("via-points");
            if (viaInput) viaInput.value = "";
            const purposeInput = document.getElementById("trip-purpose");
            const priorityInput = document.getElementById("trip-priority");
            if (purposeInput) purposeInput.value = entry.purpose || "personal";
            if (priorityInput) priorityInput.value = entry.priority || "normal";
        };
        list.appendChild(li);
    });
}

document.getElementById("reset-btn").onclick = function () {
    if (routeLayer) {
        map.removeLayer(routeLayer);
        routeLayer = null;
    }
    routeLayers.forEach((layer) => map.removeLayer(layer));
    routeLayers = [];
    routeLayerMeta = [];
    clearRouteMarkers();
    clearDraftWaypointMarkers();
    stopLiveLocationTracking();
    stopFatigueMonitoring();
    stopAmbulanceSimulation();
    stopRealtimeDataLoop();
    pathLine?.setLatLngs([]);
    trafficHotspotLayer?.clearLayers();
    trafficHotspots = [];
    renderTrafficHotspotList([]);
    evStations = [];
    renderEvStationList([]);
    const hotelList = document.getElementById("hotel-list");
    if (hotelList) hotelList.innerHTML = "";
    Object.values(poiLayers).forEach((layer) => {
        layer.clearLayers();
        if (map.hasLayer(layer)) map.removeLayer(layer);
    });
    ["poi-gas", "poi-charging", "poi-police"].forEach((id) => {
        const checkbox = document.getElementById(id);
        if (checkbox) checkbox.checked = false;
    });
    waypointAddMode = false;
    const waypointBtn = document.getElementById("waypoint-mode-btn");
    if (waypointBtn) {
        waypointBtn.classList.remove("active");
        waypointBtn.textContent = "Add Stop Mode: Off";
    }
    const ambulanceBtn = document.getElementById("ambulance-mode-btn");
    if (ambulanceBtn) {
        ambulanceBtn.classList.remove("active");
        ambulanceBtn.textContent = "Ambulance Priority: Off";
    }
    ambulanceModeActive = false;
    selectedRouteCoordinates = [];
    selectedRouteGeometry = null;
    selectedRouteKey = "recommended";
    map.setView([14.4644, 75.9218], 11);
    document.getElementById("source").value = "";
    document.getElementById("destination").value = "";
    const viaInput = document.getElementById("via-points");
    if (viaInput) viaInput.value = "";
    const purposeInput = document.getElementById("trip-purpose");
    const priorityInput = document.getElementById("trip-priority");
    if (purposeInput) purposeInput.value = "personal";
    if (priorityInput) priorityInput.value = "normal";
    document.getElementById("result-card")?.classList.add("hidden");
    document.getElementById("smart-alert")?.classList.add("hidden");
    document.getElementById("leave-info").textContent = "Enter route to calculate...";
    document.getElementById("future-traffic-note").textContent = "Predicted using historical pattern simulation.";
    updatePlacePreviews("Source", "Destination");
    setAmbulanceUi("Ambulance priority is in standby.", "--", "--");
    const slider = document.getElementById("future-traffic-slider");
    const hourValue = document.getElementById("future-hour-value");
    if (slider) slider.value = "0";
    if (hourValue) hourValue.textContent = "0";
    lastRouteSnapshot = null;
    setWorkspaceState("splash");
};

function showAlert(message) {
    alert(message);
}

function updateConnectionStatus() {
    const indicator = document.getElementById("status-indicator");
    if (!indicator) return;
    if (navigator.onLine) {
        indicator.innerHTML = '<span class="status-dot"></span> Connected';
        indicator.className = "connected";
    } else {
        indicator.innerHTML = '<span class="status-dot"></span> Offline';
        indicator.className = "disconnected";
    }
    updateOfflineBanner();
}

window.addEventListener("online", updateConnectionStatus);
window.addEventListener("offline", updateConnectionStatus);
window.addEventListener("resize", () => {
    if (workspaceState === "results") {
        setTimeout(() => map?.invalidateSize(), 180);
    }
});
window.addEventListener("beforeunload", () => {
    stopFatigueMonitoring(true);
    stopRealtimeDataLoop();
    stopAmbulanceSimulation();
});
updateConnectionStatus();

function getRoute() {
    let source = document.getElementById("source").value;
    let destination = document.getElementById("destination").value;

    if (source === "" || destination === "") {
        alert("Please enter both fields!");
        return;
    }

    let time = document.getElementById("time").value;

    let message = "";

    if ((time >= 8 && time <= 10) || (time >= 17 && time <= 20)) {
    message = "🔴 Peak Hour! Expect Heavy Traffic";
    }
    else if (time >= 11 && time <= 16) {
    message = "🟡 Moderate Traffic Time";
    }
    else {  
        message = "🟢 Best Time to Travel";
    message = "🟢 Best Time to Travel";
    }
    let traffic = ["Low", "Medium", "High"];
    let randomTraffic = traffic[Math.floor(Math.random() * traffic.length)];

   document.getElementById("result").innerHTML =
    "Route: " + source + " → " + destination + "<br>" +
    "Traffic Level: " + randomTraffic + "<br>" +
    message;
}

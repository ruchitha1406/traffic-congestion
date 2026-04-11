function getRoute() {
    let source = document.getElementById("source").value;
    let destination = document.getElementById("destination").value;

    if (source === "" || destination === "") {
        alert("Please enter both fields!");
        return;
    }

    
    let traffic = ["Low", "Medium", "High"];
    let randomTraffic = traffic[Math.floor(Math.random() * traffic.length)];

    document.getElementById("result").innerHTML =
        "Route: " + source + " → " + destination + "<br>" +
        "Traffic Level: " + randomTraffic;
}
